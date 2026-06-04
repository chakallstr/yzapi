import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { tr as baseTr } from './tr.js';
import { en as baseEn } from './en.js';
import appShell from './strings/app-shell.js';
import packages from './strings/packages.js';
import aiChat from './strings/ai-chat.js';
import studio from './strings/studio.js';
import status from './strings/status.js';
import support from './strings/support.js';
import home from './strings/home.js';
import account from './strings/account.js';
import activity from './strings/activity.js';
import models from './strings/models.js';
import shared from './strings/shared.js';
import telegramTopup from './strings/telegram-topup.js';

/* ============================================
   YapayZekaLab — lightweight i18n (0-dep)
   TR (default) + EN. Custom React Context + useT() hook.
   Dictionaries are split into per-surface fragments (./strings/*.js) so files
   can be translated independently without merge conflicts; merged here.
   Keep dictionaries provider-codename free (scan:public).
   ============================================ */

const FRAGMENTS = [
  appShell, packages, aiChat, studio, status, support,
  home, account, activity, models, shared, telegramTopup,
];

export const messagesTr = Object.assign({}, baseTr, ...FRAGMENTS.map((f) => f.tr || {}));
export const messagesEn = Object.assign({}, baseEn, ...FRAGMENTS.map((f) => f.en || {}));

const DICTS = { tr: messagesTr, en: messagesEn };
export const STORAGE_KEY = 'yz_lang';
export const SUPPORTED_LANGS = ['tr', 'en'];

// Pure language picker — unit-testable without DOM globals.
// stored pref wins; else browser tr* → tr, any other → en; final fallback tr.
export function pickLang(stored, navLang) {
  if (stored === 'tr' || stored === 'en') return stored;
  const nav = String(navLang || '').toLowerCase();
  if (nav.startsWith('tr')) return 'tr';
  if (nav) return 'en';
  return 'tr';
}

export function detectInitialLang() {
  let stored = null;
  let navLang = '';
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  try { navLang = navigator.language || navigator.userLanguage || ''; } catch { /* ignore */ }
  return pickLang(stored, navLang);
}

// Pure translate: dict[lang][key] → tr fallback → key itself. {var} interpolation.
export function translate(lang, key, vars) {
  const dict = DICTS[lang] || DICTS.tr;
  let str = dict[key];
  if (str === undefined) str = DICTS.tr[key];
  if (str === undefined) return key;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  }
  return str;
}

const LangContext = createContext({ lang: 'tr', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang);

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* ignore */ }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (next !== 'tr' && next !== 'en') return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    // Let the app mirror the choice to the user's profile (emails follow it).
    try { window.dispatchEvent(new CustomEvent('yz:lang-change', { detail: next })); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}

// === TR/EN segmented toggle =========================================
export function LangToggle({ compact = false }) {
  const { lang, setLang } = useT();
  return (
    <div role="group" aria-label="Language" style={{
      display: 'inline-flex', borderRadius: 999, overflow: 'hidden',
      border: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      {SUPPORTED_LANGS.map((code) => {
        const on = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={on}
            style={{
              padding: compact ? '3px 8px' : '4px 10px',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
              color: on ? 'var(--accent-ink)' : 'var(--ink-3)',
              background: on ? 'var(--accent-bg)' : 'transparent',
              fontFamily: 'var(--font-mono)', transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
