export type AppTab = "homepage" | "models" | "sss" | "api" | "admin";

const TAB_ALIASES: Record<string, AppTab> = {
  home: "homepage",
  homepage: "homepage",
  models: "models",
  modeller: "models",
  sss: "sss",
  faq: "sss",
  api: "api",
  docs: "api",
  admin: "admin",
};

function normalize(value: string): string {
  return value.replace(/^[/#]+/, "").trim().toLowerCase();
}

export function getInitialAppTab(pathname: string, search = "", hash = ""): AppTab {
  const params = new URLSearchParams(search);
  const tabFromQuery = params.get("tab");
  const candidates = [tabFromQuery ?? "", hash, pathname];

  for (const candidate of candidates) {
    const tab = TAB_ALIASES[normalize(candidate)];
    if (tab) return tab;
  }

  return "homepage";
}
