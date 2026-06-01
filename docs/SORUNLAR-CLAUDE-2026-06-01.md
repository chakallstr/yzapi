# Claude İzleme — Açık Sorunlar (2026-06-01 ~15:50)

> Bu dosyayı Claude Code yazdı. Kiro ile birlikte çözülecek maddeler.
> Tüm maddeler doğrulanmış, tahmin yok.

---

## 1. 🗑️ Stale Stash — Silinmeli (düşük risk, temizlik)

**Sorun:** `git stash list` → `stash@{0}: WIP-parallel-sessions (admin-notify + others)` bekliyor.
Admin-notify servisi stash'ten **bağımsız olarak** doğrudan yeniden yazıldı (`src/server/services/admin-notify-service.ts` untracked).
Bu stash artık stale — uygulanırsa çakışma çıkabilir, uygulanmazsa karışıklığa yol açar.

**Çözüm:**
```bash
git stash drop stash@{0}
```

---

## 2. 🌲 Prunable Worktree — Temizlenmeli (düşük risk)

**Sorun:** `/private/tmp/yzapi-traffic-deploy` worktree'si `prunable` durumunda (detached HEAD `a69df62`).
Disk yer kaplıyor, `git worktree list`'te gürültü yaratıyor.

**Çözüm:**
```bash
git worktree prune
```

---

## 3. 🔒 Provider-name Leak — Contract Test Commit'lenmemiş (orta öncelik)

**Sorun:** `src/provider-name-noleak-contract.test.ts` hâlâ **untracked** (commit edilmedi).
`scripts/scan-public-bundle.mjs`'e `closerouter`, `omniroute`, `wellflow`, `claude-popusk`, `stepanovikov` iğneleri eklendi ama test kilidi henüz repoya girmedi.
Build regresyonu olursa koruma çalışmaz.

**Çözüm:** Aşağıdaki 4 dosyanın birlikte commit'lenmesi:
- `src/provider-name-noleak-contract.test.ts` (yeni)
- `scripts/scan-public-bundle.mjs` (güncellendi)
- `src/server/services/closerouter-service.ts` (`chatcmpl_omniroute` → `chatcmpl`)
- `src/yapayzekalab/tab-admin.jsx` (hardcoded `'closerouter'` default'ları temizlendi)

Önce `npm test` ile contract testin geçtiğini doğrula, sonra commit.

---

## 4. 📦 Büyük Uncommitted Batch — Commit'lenmeli (orta öncelik)

**Sorun:** 16 dosya uncommitted (12 modified + 4 untracked). Liste:

```
M  .env.example                                    (+6 satır — WhatsApp notify env)
M  docs/AI_HANDOFF.md
M  docs/OPERATIONS.md
M  docs/router-poc.md
M  docs/vps-deploy.md
M  scripts/scan-public-bundle.mjs                  (+6 iğne)
M  src/server/lib/env.ts                           (+6 — ADMIN_NOTIFY_* vars)
M  src/server/routes/auth.ts                       (+8 — signup admin notify)
M  src/server/routes/payments.ts                   (+97 — ödeme olayları admin notify)
M  src/server/routes/telegram.ts                   (+23)
M  src/server/services/closerouter-service.ts      (provider-leak fix)
M  src/yapayzekalab/tab-admin.jsx                  (provider-leak fix)
?? src/provider-name-noleak-contract.test.ts       (yeni — madde 3)
?? src/server/services/admin-notify-service.ts     (yeni servis)
?? src/server/services/admin-notify-service.test.ts
?? src/server/services/admin-notify-service.behavior.test.ts
```

**Önerilen commit sırası (2 ayrı commit):**

**Commit A — provider-name non-leak:**
```
feat(security): provider codename non-leak contract + scan + frontend hardcode temizliği
```
Dosyalar: `closerouter-service.ts`, `tab-admin.jsx`, `scan-public-bundle.mjs`, `provider-name-noleak-contract.test.ts`

**Commit B — admin-notify:**
```
feat(admin-notify): Telegram/WhatsApp admin bildirimleri (yeni üye, ödeme olayı, hata)
```
Dosyalar: `admin-notify-service.ts/test.ts/behavior.test.ts`, `auth.ts`, `payments.ts`, `telegram.ts`, `env.ts`, `.env.example`, docs

---

## 5. ✅ Doğrulama Adımları (her commit öncesi)

```bash
npm run lint
npm test
npm run build
npm run scan:public   # provider leak scan
```

---

## Genel Değerlendirme

Kiro'nun bugünkü çalışması sağlıklı ve disiplinli:
- Her değişiklikle test ekleniyor
- Billing formülüne dokunulmadı (yalnız token seçim mantığı düzeltildi)
- Security fix'ler (port bind, provider leak) yerinde yapıldı

Yukarıdaki 5 madde blokör değil — rutin temizlik ve commit hijyeni.
