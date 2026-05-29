import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/tab-admin.jsx", "utf8");

describe("admin balance ui contract", () => {
  it("exposes explicit add and remove balance controls for admins", () => {
    expect(source).toContain("Bakiye +");
    expect(source).toContain("Bakiye -");
    expect(source).toContain("const updateBalance = async (user, mode = 'add')");
  });

  it("sends add and remove actions through the dedicated balance endpoint", () => {
    expect(source).toContain("/api/admin/users/${user.id}/bakiye");
    expect(source).toContain("const amount = isRemove ? -Math.abs(rawAmount) : Math.abs(rawAmount);");
    expect(source).toContain("Manuel admin bakiye düşümü");
    expect(source).toContain("Manuel admin bakiye ekleme");
  });
});
