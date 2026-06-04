import { Agent, setGlobalDispatcher } from "undici";

// Upstream (sağlayıcı) çağrıları için özel undici dispatcher.
//
// CANLI OLAY (2026-06-04): Popusk (api.claude-popusk.shop) yeni TLS bağlantısını
// undici'nin VARSAYILAN 10sn connect timeout'unda kabul edemeyince `ConnectTimeoutError`
// (UND_ERR_CONNECT_TIMEOUT) → müşteriye ham 500. Varsayılan global dispatcher'da
// keep-alive yeniden kullanımı zayıf ve connect tavanı 10sn.
//
// Bu Agent iki şeyi düzeltir:
//  (a) connect timeout 10sn → 30sn: yavaş-ama-çalışan bir TLS handshake artık başarılı olur.
//  (b) keep-alive HAVUZU: sıcak bağlantılar yeniden kullanılır → her istekte soğuk handshake
//      YOK → Popusk'ın yeni-bağlantı kabul tıkanmasına maruziyet büyük ölçüde düşer.
// (closerouter-service.ts ayrıca connect-fazı hatalarında retry eder = ikinci savunma katmanı.)
export const upstreamDispatcher = new Agent({
  connect: { timeout: 30_000 },   // undici default connectTimeout 10s → 30s
  // keepAlive boşta-tutma 10sn: sıcak bağlantı reuse'unu korur (Roo Code istekleri
  // saniyelerle ardışık) ama "bayat soketi yeniden kullan → ECONNRESET" yarış penceresini
  // dar tutar (QA3 riski). keepAlive'ın getirebileceği reset'ler retry'da DEĞİL (POST'ta
  // upstream çift-işlem riski) → pencereyi küçük tutmak en güvenli mitigasyon.
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 600_000,    // bir bağlantının ömür tavanı
  connections: 128,                // origin başına havuz boyutu
});

// Süreç genelindeki global fetch dispatcher'ını yukarıdaki Agent ile değiştirir.
// Yalnız runtime'da (index.ts startServer) çağrılır; testler çağırmaz → nock/msw
// kendi global dispatcher müdahalesiyle çakışmaz.
export function installUpstreamDispatcher(): void {
  setGlobalDispatcher(upstreamDispatcher);
}
