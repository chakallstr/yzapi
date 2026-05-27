import YapayZekaLabApp from "./yapayzekalab/App.jsx";

type LegacyTab = "home" | "models" | "activity" | "account" | "admin";

const routeToInitialTab = (path: string): LegacyTab => {
  if (path.startsWith("/models")) return "models";
  if (path.startsWith("/activity") || path.startsWith("/usage")) return "activity";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/docs")) return "home";
  if (
    path.startsWith("/api") ||
    path.startsWith("/keys") ||
    path.startsWith("/api-keys") ||
    path.startsWith("/balance") ||
    path.startsWith("/user-dashboard")
  ) {
    return "account";
  }
  return "home";
};

export default function App() {
  return <YapayZekaLabApp initialTab={routeToInitialTab(window.location.pathname)} />;
}
