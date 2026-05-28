import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, type ViteDevServer} from 'vite';

// Plugin: copy .htaccess into dist/ after build
function copyHtaccess() {
  return {
    name: 'copy-htaccess',
    closeBundle() {
      const src = path.resolve(__dirname, '.htaccess');
      const dest = path.resolve(__dirname, 'dist/.htaccess');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    },
  };
}

const phrase = (...parts: string[]) => parts.join("");

const rejectedTemplateNeedles = [
  phrase("Scientific", "Data"),
  phrase("Molek", "üler analiz"),
  phrase("Bilimsel ", "veri formatları"),
  phrase("Demo ", "Modu"),
  phrase("/api/", "files"),
  phrase("/api/", "route-agent"),
  phrase("Route ", "Simulator"),
  phrase("Dosya ", "analizi"),
  phrase("api.yzlab.ai", "/v2/route"),
  phrase("Dataset ", "upload"),
  phrase("Route ", "Agent"),
  phrase("File ", "analysis"),
  phrase("Sim", "ülasyon"),
  phrase("MODEL MAL", "İYETİNİ SAKLAMAYAN AI API"),
  phrase("model maliyetini ", "saklamayan"),
  phrase("TÜRK GELİŞTİRİCİLER ", "İÇİN AI API PLATFORMU"),
];

const approvedThemeNeedles = [
  "Türkiye'nin",
  "Yapay Zekâ",
  "API Geçidi",
  "Ayda ne kadar",
  "ödersin?",
  phrase("Bakiye ", "kalkülatörü"),
  "yapayzekalab.org/v1",
];

function sourceFiles(root: string) {
  const files = ["src/App.tsx", "index.html"].map((file) => path.resolve(root, file));
  const themeDir = path.resolve(root, "src/yapayzekalab");
  if (fs.existsSync(themeDir)) {
    for (const entry of fs.readdirSync(themeDir)) {
      if (/\.(jsx|tsx|ts|css)$/.test(entry)) files.push(path.join(themeDir, entry));
    }
  }
  return files;
}

function assertRejectedTemplateAbsent(root = __dirname) {
  const approvedDir = path.resolve(root, "src/yapayzekalab");
  if (!fs.existsSync(approvedDir)) {
    throw new Error("Approved YapayZekaLab theme directory missing: src/yapayzekalab");
  }

  const files = sourceFiles(root);
  let combined = "";
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    combined += `\n${text}`;
    for (const needle of rejectedTemplateNeedles) {
      if (text.includes(needle)) {
        throw new Error(`Rejected template fingerprint detected in ${path.relative(root, file)}: ${needle}`);
      }
    }
  }

  for (const needle of approvedThemeNeedles) {
    if (!combined.includes(needle)) {
      throw new Error(`Approved old theme fingerprint missing: ${needle}`);
    }
  }
}

function rejectTemplateGuard() {
  return {
    name: "reject-template-guard",
    buildStart() {
      assertRejectedTemplateAbsent();
    },
    configureServer(server: ViteDevServer) {
      assertRejectedTemplateAbsent();
      server.watcher.on("all", (_event: string, file: string) => {
        if (file.includes(`${path.sep}src${path.sep}yapayzekalab${path.sep}`) || file.endsWith(`${path.sep}src${path.sep}App.tsx`)) {
          try {
            assertRejectedTemplateAbsent();
          } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            process.exit(1);
          }
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [rejectTemplateGuard(), react(), copyHtaccess()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled when DISABLE_HMR env var is set
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
