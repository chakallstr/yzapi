import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const fromParts = (...parts: string[]) => parts.join("");

const activeFrontendSources = () => {
  const files = ["src/App.tsx", "src/main.tsx", "index.html"];
  if (existsSync("src/index.css")) files.push("src/index.css");
  const themeDir = "src/yapayzekalab";
  if (existsSync(themeDir)) {
    for (const entry of readdirSync(themeDir)) {
      if (/\.(jsx|tsx|ts|css)$/.test(entry)) files.push(join(themeDir, entry));
    }
  }
  return files;
};

const allSource = () => activeFrontendSources().map(read).join("\n");

const rejectedTemplateFingerprints = [
  fromParts("Scientific", "Data"),
  fromParts("Molek", "üler analiz"),
  fromParts("Bilimsel ", "veri formatları"),
  fromParts("/api/", "files"),
  fromParts("/api/", "route-agent"),
  fromParts("Route ", "Simulator"),
  fromParts("Dosya ", "analizi"),
  fromParts("api.yzlab.ai", "/v2/route"),
  fromParts("Dataset ", "upload"),
  fromParts("Route ", "Agent"),
  fromParts("File ", "analysis"),
  fromParts("Sim", "ülasyon"),
  fromParts("MODEL MAL", "İYETİNİ SAKLAMAYAN AI API"),
  fromParts("model maliyetini ", "saklamayan"),
  fromParts("TÜRK GELİŞTİRİCİLER ", "İÇİN AI API PLATFORMU"),
  "tailwindcss",
  "Space Grotesk",
  "JetBrains Mono",
  "skeleton-shimmer",
];

const approvedOldThemeFingerprints = [
  "Türkiye'nin",
  "Yapay Zekâ",
  "API Geçidi",
  "api.yapayzekalab.org",
  fromParts("Kota ", "yok. Gizli limit yok."),
  fromParts("Bakiye ", "kalkülatörü"),
  "Ayda ne kadar",
  "ödersin?",
  "Shopier",
  "IBAN",
  "Cryptomus",
  "yzk_live_YOUR_KEY",
  "/v1/chat/completions",
  "cix.crazy666@gmail.com",
];

describe("approved frontend theme guard", () => {
  it("keeps the approved old YapayZekaLab theme as the active React app", () => {
    expect(existsSync("src/yapayzekalab/App.jsx")).toBe(true);
    expect(read("src/App.tsx")).toContain("./yapayzekalab/App.jsx");

    const source = allSource();
    for (const fingerprint of approvedOldThemeFingerprints) {
      expect(source).toContain(fingerprint);
    }
  });

  it("keeps rejected template fingerprints out of active frontend sources", () => {
    const source = allSource();
    for (const fingerprint of rejectedTemplateFingerprints) {
      expect(source).not.toContain(fingerprint);
    }
  });

  it("does not keep starter template package identity", () => {
    const packageSource = read("package.json");
    expect(packageSource).not.toContain(fromParts("react", "-example"));
    expect(packageSource).toContain(fromParts("yapayzeka", "lab"));
  });

  it("does not reintroduce the separate admin password flow", () => {
    const source = allSource();
    expect(source).toContain("cix.crazy666@gmail.com");
    expect(source).not.toContain("yz_admin_token");
    expect(source).not.toContain("/api/admin/login");
    expect(source).not.toContain("admin parola");
    expect(source).not.toContain("Admin paneline gir");
    expect(source).not.toContain("AdminLoginGate");
  });

  it("does not load the leftover global template stylesheet", () => {
    const source = allSource();
    expect(read("src/main.tsx")).not.toContain("./index.css");
    expect(source).not.toContain("@import \"tailwindcss\"");
    expect(source).not.toContain("Space Grotesk");
    expect(source).not.toContain("skeleton-shimmer");
  });

  it("keeps public bundle scanning aligned with rejected template CSS fingerprints", () => {
    const scanScript = read("scripts/scan-public-bundle.mjs");
    for (const fingerprint of ["tailwindcss", "Space Grotesk", "JetBrains Mono", "skeleton-shimmer"]) {
      expect(scanScript).toContain(fingerprint);
    }
  });

  it("does not keep template-only Tailwind dependency wiring", () => {
    const viteConfig = read("vite.config.ts");
    const packageSource = read("package.json");

    expect(viteConfig).not.toContain("@tailwindcss/vite");
    expect(viteConfig).not.toContain("tailwindcss()");
    expect(packageSource).not.toContain("@tailwindcss/vite");
    expect(packageSource).not.toContain("\"tailwindcss\"");
  });
});
