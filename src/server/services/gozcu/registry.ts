// Gözcü — check kaydı. Her domain TEK bir Check girişi (run() bir dizi döndürür);
// engine düzleştirir. Yeni check eklemek = ilgili checks/<domain>.ts'e fonksiyon + buraya
// (gerekirse yeni domain) ekleme.

import type { Check } from "./types.js";
import { runMoneyDomainChecks } from "./checks/money.js";
import { runUptimeChecks } from "./checks/uptime.js";
import { runProviderChecks } from "./checks/provider.js";
import { runSecurityChecks } from "./checks/security.js";
import { runCodeChecks } from "./checks/code.js";

export const CHECK_REGISTRY: Check[] = [
  { name: "money", domain: "money", signalSource: "mali-izleme (reuse)", run: runMoneyDomainChecks },
  { name: "uptime", domain: "uptime", signalSource: "runtime + collector", run: runUptimeChecks },
  { name: "provider", domain: "provider", signalSource: "upstream + provider_durumlari", run: runProviderChecks },
  { name: "security", domain: "security", signalSource: "abuse signals", run: runSecurityChecks },
  { name: "code", domain: "code", signalSource: "kod kontratları (Katman-3)", run: runCodeChecks },
];
