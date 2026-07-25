import { startVexlyCloakRouter } from "../src/server/services/vexly-cloak-router.js";

const server = await startVexlyCloakRouter();
console.log(JSON.stringify({ service: "vexly-cloak-router", host: "127.0.0.1", port: 8328 }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.shutdown().catch(() => {
        console.error(JSON.stringify({ service: "vexly-cloak-router", signal, status: "close_failed" }));
        process.exitCode = 1;
    });
  });
}
