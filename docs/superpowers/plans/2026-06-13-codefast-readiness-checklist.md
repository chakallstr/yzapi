# CodeFast Reseller — Hazırlık / Eksikler Checklist (red-team)

Tarih: 2026-06-13 · Branch `feat/codefast-reseller` · Eşlik eden plan: `2026-06-13-codefast-reseller-integration.md`

## Sistem modeli (özet)
Para: müşteri→yzapi (TL) → entitlement → yzapi→CF order (CF bakiyesi −liste×0.90) → cf_rc_live_ → entitlement'a şifreli.
İstek: yzk_live_ → /v1/* → 404-gate → paket slot → entitlement override chain → reseller-api/proxy/<slug>/* (cf_rc_live_) → CF metreler.

## 🔴 Lansman-blocker boşluklar
- [ ] **#1 Para bütünlüğü:** provisioning başarısız (CF 402/bakiye bitti) → müşteri ödedi ama key yok. ÇÖZÜM (karar gerek):
  - A) Satıştan önce CF quote + bakiye ön-kontrolü (yetersizse satışı durdur/"yakında").
  - B) Provisioning fail → otomatik yzapi iadesi (transactions 'iade') + entitlement revoke.
  - C) Retry job (Idempotency-Key güvenli) + N denemede teslim olmazsa iade.
  - Öneri: B+C (retry, sonra iade) + bakiye alarmı.
- [ ] **#3 CF modelMap:** override `modelMap={}` verbatim — yzapi "claude-haiku-4-5"(tire) ↔ CF "claude-haiku-4.5"(nokta) uyuşmaz. CF-wire çeviri haritası gerek (entitlementOverrideChain'e modelMap parametresi; slug-bazlı). Yeni modellerde (added_models) id'leri CF-wire ile birebir tanımla → map gereksiz.

## 🟠 Mimari netleştirmeler (kod etkiler)
- [ ] **#2 Profil çakışması:** `codefast` profili YALNIZ yeni modeller (Composer/Grok/GLM/Kimi/NVIDIA/görsel) içerir. Claude/GPT'yi EKLEME (wellflow/popusk ile disjoint kalsın). CF Claude/GPT paketleri override-chain ile yönlenir; PAYG aynı model mevcut upstream'e gider.
- [ ] **#5 Görsel/video ürünleri:** /v1/images/* ayrı handler + chargeImage. Override 3 text call-site'a kuruldu; görsel satılacaksa image handler'lara da entitlement override + paket akışı gerek. (Faz: text önce, görsel sonra.)
- [ ] **#8 Claude Max token-bazlı:** yzapi istek sayar, CF token sayar. yzapi limiti yüksek bırak; CF token bütçesini metreler; tükenince CF hata. "Kalan token" yzapi'de gösterilmez (kabul) — veya GET /v1/customers/:id/usage ile periyodik çek.
- [ ] **#6 Yenileme:** aynı paketi tekrar al → grantPackageEntitlement süre uzatır; CF order yeniden açılmalı/uzatılmalı, cf_order_id/cf_rc_key üzerine yazma davranışı netleştir (yeni order = yeni key mi?).
- [ ] **#7 İade simetrisi:** yzapi müşteri iadesi → cfRevokeOrder(cf_order_id) + entitlement revoke.

## 🟡 Operasyon / güvenlik
- [ ] CF bakiyesi düşük-bakiye alarmı (Gözcü domain) — satışlar sessizce patlamasın.
- [ ] Reseller anahtarını lansmandan önce ROTATE (inceleme sırasında üretildi).
- [ ] Secret no-leak kontrat testi (cf_reseller_cost_tl / cf_*_id / cf_rc_key frontend'e sızmaz).
- [ ] Provisioning retry job (cron, cf_status='failed').

## Bağımlılıklar (senin adımların)
- [ ] **CF bakiyesine ~₺200-500 yükle** → kesin model id'leri (/proxy/<slug>/v1/models) + gerçek E2E (order→cf_rc_live_→proxy).
- [ ] Satış fiyat politikası: 1:1 ayna seed + admin panelde marj düzenleme (sen ayarlayacaksın).
- [ ] Kirli ağaçtaki "live-state" admin işini commit/temizle → Faz 6 admin UI'a dokunabilelim.

## Kalan kod (yapılacak, deploy YOK, 3-QA)
- [ ] Proxy hot-path wiring (Task 8): 3 text call-site CF override tercih (entitlementOverrideChain > packageOverrideChain).
- [ ] Task 8b: yalnız-paket guard (codefast profil modeli + !paket → 402; PAYG reserve ÖNCESİ, refund-dance yok) + pending_manual → slot release + 409.
- [ ] Satın-alma hook (package-purchase-service) + **#1 iade/başarısızlık yolu**.
- [ ] added_models + codefast profil seed (yeni modeller; id'ler CF-wire birebir).
- [ ] CF modelMap (#3) entitlementOverrideChain'e.
- [ ] Admin uçları (ayrı router admin-codefast.ts; kirli admin.ts'e dokunma): balance/sync/manuel-teslim/marj.
- [ ] Kontrat testleri + tam doğrulama (lint/test/itest/build/scan:public).

## DOKUNULMAZ hatırlatma
billing reserve/settle/K1, MASTER_MODELS 42-lock, provider codename no-leak, admin email sabiti — değiştirme; CF işi bunların ÜSTÜNE additive.
