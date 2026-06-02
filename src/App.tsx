import YapayZekaLabApp from "./yapayzekalab/App.jsx";
import TelegramTopupApp from "./yapayzekalab/TelegramTopupApp.jsx";

type LegacyTab = "home" | "models" | "activity" | "account" | "admin" | "documents";

const routeToInitialTab = (path: string): LegacyTab => {
  if (path.startsWith("/models")) return "models";
  if (path.startsWith("/activity") || path.startsWith("/usage")) return "activity";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/docs")) return "documents";
  if (path.startsWith("/documents")) return "documents";
  if (
    path.startsWith("/api") ||
    path.startsWith("/keys") ||
    path.startsWith("/api-keys") ||
    path.startsWith("/balance") ||
    path.startsWith("/user-dashboard") ||
    path.startsWith("/dashboard") ||
    path.startsWith("/account")
  ) {
    return "account";
  }
  return "home";
};

export default function App() {
  if (window.location.pathname.startsWith("/telegram/topup")) {
    return <TelegramTopupApp />;
  }
  return <YapayZekaLabApp initialTab={routeToInitialTab(window.location.pathname)} />;
}
