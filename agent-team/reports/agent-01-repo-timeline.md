# Agent 01 - Repo Timeline

Kapsam: `/Users/ufuk/yzapi`

## Bulgular

- Branch `main`, origin karsisinda 1 commit onde.
- Son 24 saatte repo kurulmus ve YZ API / YapayZekaLab yonune rebrand edilmis.
- Commitler:
  - `238a676` Initial commit
  - `0f5b7cf` feat: initialize YZ Lab application base
  - `3544463` Rebrand to YZ API: TL credit platform with 33+ models
- Worktree temiz degil; cok sayida modified ve untracked dosya var.

## Kararlar

- Eski tek dosya `server.ts` modeli birakildi.
- Backend `src/server/index.ts` ve alt modul yapisina tasindi.
- Urun yonu: TL bakiye, model bazli kullandigin kadar ode.
- CloseRouter/OpenAI compatible `/v1` proxy secildi.
- Odeme yuzeyi: Shopier, IBAN, Cryptomus.
- cPanel hedefi: `jupiter.netlen.com.tr`, user `ufukince1`, domain `yapayzekalab.org`, app root `/home/ufukince1/yapayzekalab`.

## Riskler

- README halen eski AI Studio/Gemini template gibi.
- Video endpointleri backendde 501.
- Streaming billing response sonrasi tahsilat basarisiz olursa risk var.
- Migration/seed deploy yolu net degil.

## Kanit

- `/Users/ufuk/yzapi/src/server/`
- `/Users/ufuk/yzapi/src/pricing.ts`
- `/Users/ufuk/yzapi/src/master-models.ts`
- `/Users/ufuk/yzapi/docs/proxy-and-auth-apis.md`
- `/Users/ufuk/yzapi/docs/payment-apis.md`
- `/Users/ufuk/yzapi/cpanel-deploy.md`

