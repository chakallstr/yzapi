/**
 * Toplu havale-bildirimi (pending_iban_payments) silme kararı — PARA GÜVENLİĞİ çekirdeği.
 *
 * Yalnız bakiye YÜKLENMEMİŞ satırlar silinebilir. 'onaylandi' satırlar bakiyeye
 * kredilenmiştir ve ilgili payments/transactions kaydına mutabakat bağı taşır —
 * silinirse bu bağ kopar. Bu yüzden ALLOWLIST kullanılır (blocklist değil): listede
 * olmayan HER durum (onaylandi + gelecekte eklenebilecek 'iade' vb.) otomatik korunur.
 */
export const IBAN_DELETABLE_STATUSES = ["bekliyor", "reddedildi"] as const;

const DELETABLE = new Set<string>(IBAN_DELETABLE_STATUSES);

export type IbanRowStatus = { id: string; durum: string };

export function partitionIbanBulkDelete(rows: IbanRowStatus[]): {
  deletableIds: string[];
  blocked: number;
} {
  const deletableIds: string[] = [];
  let blocked = 0;
  for (const row of rows) {
    if (DELETABLE.has(row.durum)) deletableIds.push(row.id);
    else blocked++; // onaylandi (kredilenmiş) veya bilinmeyen durum → asla silinmez
  }
  return { deletableIds, blocked };
}
