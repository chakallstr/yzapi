import YapayZekaLabApp from "./yapayzekalab/App.jsx";
import TelegramTopupApp from "./yapayzekalab/TelegramTopupApp.jsx";
import { tabForPath } from "./yapayzekalab/tab-routes.js";

export default function App() {
  if (window.location.pathname.startsWith("/telegram/topup")) {
    return <TelegramTopupApp />;
  }
  // Initial tab derived from the URL via the shared tab<->path map so first
  // load and the Back/Forward (popstate) handler agree exactly.
  return <YapayZekaLabApp initialTab={tabForPath(window.location.pathname)} />;
}
