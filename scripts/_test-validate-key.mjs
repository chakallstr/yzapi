// Geçici test: validateApiKey'yi doğrudan çağır
import { validateApiKey } from "../src/server/services/api-key-service.js";

const r = await validateApiKey("Bearer yzk_live_58dabbc5855d5f637e5927b2");
console.log("Result:", r ? { userId: r.user.id, keyId: r.key.id, durum: r.user.durum, prefix: r.key.prefix } : null);
process.exit(0);
