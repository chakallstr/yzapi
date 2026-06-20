// Single source of truth mapping SPA "tabs" <-> URL paths.
//
// The panel is a tab-state SPA (no React Router). This module lets the
// initial route (App.tsx), the history-push on tab change, and the popstate
// handler (App.jsx) all agree on the same tab<->path mapping, so the browser
// Back/Forward buttons move between in-app tabs instead of escaping the SPA
// into the OAuth redirect chain — which used to log users out
// ("geri tuşu ile az önceki sayfaya girmek isteyince sorun direk atıyor").

// Canonical tab -> path. One canonical path per tab (used for pushState).
export const TAB_PATHS = {
  home: '/',
  models: '/models',
  'ai-chat': '/ai-chat',
  studio: '/studio',
  packages: '/packages',
  mypackages: '/paketlerim',
  documents: '/documents',
  activity: '/activity',
  account: '/account',
  status: '/status',
  admin: '/admin',
};

export function pathForTab(tab) {
  return TAB_PATHS[tab] || '/';
}

// Path -> tab. Accepts the canonical paths above plus the legacy aliases the
// app has always honored on first load (keeps deep links working).
export function tabForPath(pathname) {
  const p = String(pathname || '/').toLowerCase();
  if (p.startsWith('/models')) return 'models';
  if (p.startsWith('/ai-chat') || p.startsWith('/chat')) return 'ai-chat';
  if (p.startsWith('/studio')) return 'studio';
  // ⚠️ '/paketlerim' '/paketler' ile başlar → ÖNCE mypackages kontrol et, yoksa packages yutar.
  if (p.startsWith('/paketlerim') || p.startsWith('/mypackages') || p.startsWith('/my-packages')) return 'mypackages';
  if (p.startsWith('/packages') || p.startsWith('/paketler')) return 'packages';
  if (p.startsWith('/docs') || p.startsWith('/documents')) return 'documents';
  if (p.startsWith('/activity') || p.startsWith('/usage')) return 'activity';
  if (p.startsWith('/admin')) return 'admin';
  if (p.startsWith('/status')) return 'status';
  // NB: there is no in-app "support" tab body, so /support is intentionally
  // NOT mapped here — it falls through to home, matching legacy behavior.
  if (
    p.startsWith('/api') ||
    p.startsWith('/keys') ||
    p.startsWith('/api-keys') ||
    p.startsWith('/balance') ||
    p.startsWith('/user-dashboard') ||
    p.startsWith('/dashboard') ||
    p.startsWith('/account')
  ) {
    return 'account';
  }
  return 'home';
}
