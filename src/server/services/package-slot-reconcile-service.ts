import { dbSql } from "../db/client.js";

/**
 * Paket istek-sayacı uzlaştırma (self-healing).
 *
 * `user_package_entitlements.requests_today` bir REZERVASYON sayacıdır: `tryReservePackageSlot`
 * +1 yapar, hata yolunda `releasePackageSlot` -1 yapar. Nadiren bir istek rezerve edilir ama
 * NE başarılı usage_record yazar NE release edilir (settle/record yazımı düşerse) → sayaç kalıcı
 * over-count'a sızar. Otoriter gerçek = `usage_records` (status='success', bugün) — Aktivite
 * sekmesinin gösterdiği sayı. Bu uzlaştırma sayacı o gerçeğe çeker → panel = gate = Aktivite = gerçek.
 *
 * SALT sayaç düzeltir; bakiye/ledger/CF'ye DOKUNMAZ. Müşteri-favori (over-count'u düşürür → müşteri
 * ödediği isteği alır). Uçuştaki istek (rezerve, henüz settle değil) geçici olarak düşülebilir; settle
 * olunca success kaydı oluşur, sonraki tikte tekrar sayılır → kendini onarır.
 */
export function reconcileSlotTarget(args: {
  status: string;
  resetToday: boolean;
  requestsToday: number;
  realSuccessToday: number;
}): number | null {
  if (args.status !== "active") return null;          // geçmiş/iptal/duraklatılmış satıra dokunma
  if (!args.resetToday) return null;                  // bugün hiç istek yok / gün dönmemiş → dokunma (yarış önleme)
  const target = Math.max(0, Math.floor(Number(args.realSuccessToday) || 0));
  if (target === args.requestsToday) return null;     // zaten doğru → gereksiz yazma yok
  return target;
}

/**
 * Aktif + bugün-resetli entitlement'larda requests_today'i bugünkü gerçek başarılı istek sayısına çeker.
 * Az sayıda aktif entitlement olduğundan satır-satır karar (test edilebilir saf fonksiyon) + hedefli UPDATE.
 * Never-throw değil — job sarmalayıcısı hatayı yutar.
 */
export async function reconcilePackageSlots(): Promise<{ checked: number; corrected: number }> {
  const rows = await dbSql<{
    id: string;
    status: string;
    reset_today: boolean;
    requests_today: number;
    real_today: number;
  }[]>`
    SELECT e.id, e.status,
           (e.last_reset_date = CURRENT_DATE) AS reset_today,
           e.requests_today,
           COALESCE(u.cnt, 0) AS real_today
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    LEFT JOIN (
      SELECT entitlement_id, count(*) AS cnt
      FROM usage_records
      WHERE status = 'success' AND timestamp >= CURRENT_DATE AND entitlement_id IS NOT NULL
      GROUP BY entitlement_id
    ) u ON u.entitlement_id = e.id
    WHERE e.status = 'active' AND e.last_reset_date = CURRENT_DATE
      -- KAYAN-24s pencere (codex koltuk) ve ömürlük (Yeni Üye) paketleri HARİÇ: bunların requests_today'i
      -- takvim-gününe DEĞİL aktivasyon-penceresine/kümülatife bağlıdır. requests_today'i "bugünkü (00:00 UTC'den
      -- beri) usage sayısı"na çekmek, pencere UTC gece-yarısını aştığında sayacı düşürüp AYNI pencerede
      -- 2. parti (çift-servis) açardı. Discriminator = codex koltuk + Yeni Üye ortak imzası: units=0 & daily_quota NULL.
      AND NOT (e.cf_units_ordered = 0 AND e.daily_quota IS NULL)
      -- AYRAÇ KİLİDİ (2026-07-17): reconcile SADECE reserve'ün TAKVİM saydığı satıra dokunabilir.
      -- tryReservePackageSlot (entitlement-service.ts:198,206) kayan pencereyi
      -- "cf_api_slug='codex-api' OR daily_quota IS NOT NULL" ile seçer. Eski ayraç
      -- ("units=0 AND daily_quota IS NULL") devreden satırı (daily_quota DOLU) dışarıda BIRAKMIYOR,
      -- bu yüzden reconcile onun sayacını pencere-içi gerçek yerine takvim toplamına çekiyordu
      -- (canlı kanıt 07-16: 86b4d890 → requests_today=1549, pencere-içi gerçek=131 → +1418 şişme).
      -- Bu iki satır ayracı reserve ile BİREBİR hizalar; reconcile artık yalnız
      -- CF-arkalı, codex-olmayan, günlük-takvim paketlerine dokunur. LOCKSTEP: reserve'deki
      -- ayraç değişirse burası da değişmeli.
      AND e.cf_api_slug IS DISTINCT FROM 'codex-api'
      AND e.daily_quota IS NULL
      -- ÖMÜRLÜK DALI (3. dal): reserve ömürlüğü packages.lifetime_no_reset ile seçer
      -- (entitlement-service.ts:194) ve sayacı KÜMÜLATİF tutar. Eski kod bunu yalnız
      -- "cf_units_ordered=0" VEKİLİYLE dışlıyordu; CF-arkalı bir ömürlük ürün (units>0,
      -- ör. seed-custom-builder-fields.ts'teki birim:"lifetime" builder'lar) o vekili delip
      -- reconcile'a girerdi → kümülatif sayaç her tik bugüne çekilir → ömürlük tavan HİÇ
      -- dolmaz = sınırsız bedava servis. Canlıda bugün kesişim 0 satır (07-17 doğrulandı),
      -- yani delik latent; vekil yerine reserve'ün GERÇEK kolonuna bakarak kalıcı kapatıyoruz.
      -- IS NOT TRUE: NULL'ı da güvenli tarafta (hariç değil) bırakır.
      AND p.lifetime_no_reset IS NOT TRUE
  `;

  let corrected = 0;
  for (const r of rows) {
    const target = reconcileSlotTarget({
      status: r.status,
      resetToday: r.reset_today === true,
      requestsToday: Number(r.requests_today),
      realSuccessToday: Number(r.real_today),
    });
    if (target == null) continue;
    // last_reset_date = CURRENT_DATE guard: SELECT→UPDATE arası gün dönerse (sayaç sıfırlanırsa) yazma.
    await dbSql`
      UPDATE user_package_entitlements
      SET requests_today = ${target}, updated_at = now()
      WHERE id = ${r.id}::uuid AND last_reset_date = CURRENT_DATE AND requests_today <> ${target}
    `;
    corrected++;
  }
  return { checked: rows.length, corrected };
}
