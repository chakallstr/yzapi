// src/server/services/__fakes__/fake-db.ts
//
// A tiny in-memory fake of the Drizzle `db` client used as the "thin repository
// seam" for property tests (design.md "Testing Strategy" → "DB-backed
// resolvers/services are tested against an in-memory fake … so properties run
// without Postgres"). It implements just enough of the Drizzle query-builder
// surface that provider-config-service / added-model-service / api-settings
// exercise:
//
//   db.select(proj?).from(t).where(eq(col, v)).limit(n)
//   db.select().from(t).orderBy(asc(col))
//   db.insert(t).values(v).returning()
//   db.update(t).set(patch).where(eq(col, v))
//   db.delete(t).where(eq(col, v))
//
// Rows are stored under the table's runtime name (Symbol.for("drizzle:Name"))
// keyed by their JS property names (the same shape Drizzle returns), so the
// services read them transparently. Conditions are decoded straight off the
// Drizzle SQL `queryChunks` without importing any Drizzle internals, which keeps
// this module import-order independent (safe inside an async vi.mock factory).

const NAME_SYM = Symbol.for("drizzle:Name");
const COLUMNS_SYM = Symbol.for("drizzle:Columns");

type Row = Record<string, unknown>;

// Shared, per-test-file singleton store. Vitest isolates module state per test
// file, so each test file gets its own clean store while the vi.mock factory and
// the test body share the very same instance.
const tables = new Map<string, Row[]>();

function tableName(table: unknown): string {
  return (table as Record<symbol, string>)[NAME_SYM];
}

// Map snake_case column name -> JS property key for a given table.
function columnNameToJsKey(table: unknown): Map<string, string> {
  const columns = (table as Record<symbol, Record<string, { name: string }>>)[COLUMNS_SYM] ?? {};
  const map = new Map<string, string>();
  for (const jsKey of Object.keys(columns)) {
    map.set(columns[jsKey].name, jsKey);
  }
  return map;
}

interface DecodedCondition {
  columnName: string;
  value: unknown;
}

// Decode a Drizzle eq(col, value) condition off its queryChunks. The column
// appears as a chunk exposing a string `name`; the comparison value appears as a
// `Param` chunk (real tables) or a raw primitive chunk (plain objects).
function decodeCondition(condition: unknown): DecodedCondition | null {
  const chunks = (condition as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return null;

  let columnName: string | undefined;
  let value: unknown;
  for (const chunk of chunks) {
    if (chunk && typeof chunk === "object") {
      const maybeName = (chunk as { name?: unknown }).name;
      if (typeof maybeName === "string") {
        columnName = maybeName;
        continue;
      }
      if ((chunk as { constructor?: { name?: string } })?.constructor?.name === "Param") {
        value = (chunk as { value?: unknown }).value;
        continue;
      }
    } else if (typeof chunk === "string" || typeof chunk === "number" || typeof chunk === "boolean") {
      // Plain-object tables inline the comparison value as a raw primitive.
      value = chunk;
    }
  }

  if (!columnName) return null;
  return { columnName, value };
}

function decodeOrderColumn(order: unknown): string | null {
  const chunks = (order as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return null;
  for (const chunk of chunks) {
    if (chunk && typeof chunk === "object") {
      const maybeName = (chunk as { name?: unknown }).name;
      if (typeof maybeName === "string") return maybeName;
    }
  }
  return null;
}

function rowsFor(table: unknown): Row[] {
  const name = tableName(table);
  let rows = tables.get(name);
  if (!rows) {
    rows = [];
    tables.set(name, rows);
  }
  return rows;
}

function matches(row: Row, table: unknown, conditions: DecodedCondition[]): boolean {
  const nameToKey = columnNameToJsKey(table);
  return conditions.every((cond) => {
    const jsKey = nameToKey.get(cond.columnName) ?? cond.columnName;
    return row[jsKey] === cond.value;
  });
}

class SelectBuilder implements PromiseLike<Row[]> {
  private table: unknown;
  private conditions: DecodedCondition[] = [];
  private orderKey: string | null = null;
  private limitN: number | null = null;

  from(table: unknown): this {
    this.table = table;
    return this;
  }

  where(condition: unknown): this {
    const decoded = decodeCondition(condition);
    if (decoded) this.conditions.push(decoded);
    return this;
  }

  orderBy(order: unknown): this {
    const columnName = decodeOrderColumn(order);
    if (columnName) {
      const jsKey = columnNameToJsKey(this.table).get(columnName) ?? columnName;
      this.orderKey = jsKey;
    }
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private exec(): Row[] {
    let rows = rowsFor(this.table).filter((row) => matches(row, this.table, this.conditions));
    if (this.orderKey) {
      const key = this.orderKey;
      rows = [...rows].sort((a, b) => {
        const av = a[key] as number | string | Date;
        const bv = b[key] as number | string | Date;
        if (av < bv) return -1;
        if (av > bv) return 1;
        return 0;
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows.map((row) => ({ ...row }));
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

class InsertBuilder implements PromiseLike<Row[]> {
  private toInsert: Row[] = [];

  constructor(private table: unknown) {}

  values(value: Row | Row[]): this {
    const list = Array.isArray(value) ? value : [value];
    const now = new Date();
    for (const v of list) {
      // Apply table-level timestamp defaults Drizzle would normally supply.
      const row: Row = { createdAt: now, updatedAt: now, ...v };
      this.toInsert.push(row);
    }
    return this;
  }

  returning(): this {
    return this;
  }

  private exec(): Row[] {
    const rows = rowsFor(this.table);
    for (const row of this.toInsert) rows.push(row);
    return this.toInsert.map((row) => ({ ...row }));
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

class UpdateBuilder implements PromiseLike<Row[]> {
  private patch: Row = {};
  private conditions: DecodedCondition[] = [];

  constructor(private table: unknown) {}

  set(patch: Row): this {
    this.patch = patch;
    return this;
  }

  where(condition: unknown): this {
    const decoded = decodeCondition(condition);
    if (decoded) this.conditions.push(decoded);
    return this;
  }

  private exec(): Row[] {
    const rows = rowsFor(this.table);
    for (const row of rows) {
      if (matches(row, this.table, this.conditions)) Object.assign(row, this.patch);
    }
    return [];
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

class DeleteBuilder implements PromiseLike<Row[]> {
  private conditions: DecodedCondition[] = [];

  constructor(private table: unknown) {}

  where(condition: unknown): this {
    const decoded = decodeCondition(condition);
    if (decoded) this.conditions.push(decoded);
    return this;
  }

  private exec(): Row[] {
    const name = tableName(this.table);
    const rows = rowsFor(this.table);
    const kept = rows.filter((row) => !matches(row, this.table, this.conditions));
    tables.set(name, kept);
    return [];
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

export const fakeDb = {
  select(_projection?: unknown): SelectBuilder {
    return new SelectBuilder();
  },
  insert(table: unknown): InsertBuilder {
    return new InsertBuilder(table);
  },
  update(table: unknown): UpdateBuilder {
    return new UpdateBuilder(table);
  },
  delete(table: unknown): DeleteBuilder {
    return new DeleteBuilder(table);
  },
};

// Minimal dbSql stand-in (unused by the services these tests cover, but exported
// so the mocked module shape matches db/client.js).
export const fakeDbSql = Object.assign(() => Promise.resolve([]), {
  begin: async (fn: (sql: unknown) => unknown) => fn(() => Promise.resolve([])),
});

// ── Test helpers ───────────────────────────────────────────────────────────

export function resetFakeDb(): void {
  tables.clear();
}

// Seed (replace) the rows for a given table object.
export function seedTable(table: unknown, rows: Row[]): void {
  tables.set(tableName(table), rows.map((row) => ({ ...row })));
}

// Read the current rows for a table object (clones).
export function getTableRows(table: unknown): Row[] {
  return rowsFor(table).map((row) => ({ ...row }));
}
