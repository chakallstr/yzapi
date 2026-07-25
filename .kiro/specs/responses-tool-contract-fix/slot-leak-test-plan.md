# Slot Sızıntısı — Test Planı (geçici not)

Bu dosya yalnızca çalışma notudur; test kodu `~/gpt-web-service/tests/api/slot-leak.test.ts` içine yazılır.

## Sızıntı yolları (kod okumasıyla doğrulanmış)

| Yol | Eski davranış | Sonuç |
|---|---|---|
| Non-stream 120sn timeout | `chunk.done` gelmez → `closeSession` çağrılmaz; retry döngüsü ÜSTÜNE yeni `startChat` açar | tek istek 6 slota kadar sızdırır |
| Non-stream `startChat` reject | aynı | slot sızar |
| Stream istemci kopması (`req.raw` close) | `cleanup()` yalnız `finished = true` | slot + 2sn keep-alive timer sızar |
| Stream 120sn timeout | aynı | aynı |
| Süreç seviyesinde takılma | yalnız 30 dk'lık bayat sweep | `max_conversations=1` ile komple kesinti |

## Doğrulama yöntemi

`proxyBridge` mock'u: `startChat` bir sessionId döndürür, `done` chunk'ı ASLA göndermez (upstream takılması).
`closeSession` çağrıları kaydedilir. Rota timeout'u testte beklenemeyeceği için (120sn),
timeout eşiği env ile kısaltılamıyor → bunun yerine **istemci kopması** yolu ve
**watchdog** birim testiyle doğrulanır; timeout yolu canlı log kanıtıyla teyit edilir.
