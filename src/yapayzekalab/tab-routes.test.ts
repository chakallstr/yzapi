import { describe, it, expect } from 'vitest';
import { TAB_PATHS, pathForTab, tabForPath } from './tab-routes.js';

describe('tab-routes', () => {
  const tabs = Object.keys(TAB_PATHS);

  it('round-trips every tab through its canonical path', () => {
    // Critical invariant: after pushState(pathForTab(tab)), a popstate must
    // resolve the SAME tab — otherwise Back/Forward would loop or escape.
    for (const tab of tabs) {
      expect(tabForPath(pathForTab(tab))).toBe(tab);
    }
  });

  it('maps canonical paths to the right tab', () => {
    expect(tabForPath('/')).toBe('home');
    expect(tabForPath('/models')).toBe('models');
    expect(tabForPath('/account')).toBe('account');
    expect(tabForPath('/admin')).toBe('admin');
    expect(tabForPath('/documents')).toBe('documents');
    expect(tabForPath('/ai-chat')).toBe('ai-chat');
    expect(tabForPath('/studio')).toBe('studio');
    expect(tabForPath('/packages')).toBe('packages');
    expect(tabForPath('/activity')).toBe('activity');
    expect(tabForPath('/status')).toBe('status');
  });

  it('honors legacy path aliases', () => {
    expect(tabForPath('/usage')).toBe('activity');
    expect(tabForPath('/docs')).toBe('documents');
    expect(tabForPath('/api-keys')).toBe('account');
    expect(tabForPath('/dashboard')).toBe('account');
    expect(tabForPath('/balance')).toBe('account');
    expect(tabForPath('/paketler')).toBe('packages');
  });

  it('does not map /support (no in-app support tab body) — falls to home', () => {
    expect(tabForPath('/support')).toBe('home');
    expect(tabForPath('/destek')).toBe('home');
  });

  it('tolerates nested paths, trailing segments and case', () => {
    expect(tabForPath('/models/claude')).toBe('models');
    expect(tabForPath('/ACCOUNT')).toBe('account');
    expect(tabForPath('/admin/users')).toBe('admin');
  });

  it('falls back to home for unknown or empty paths', () => {
    expect(tabForPath('/totally-unknown')).toBe('home');
    expect(tabForPath('')).toBe('home');
    expect(tabForPath(undefined)).toBe('home');
  });

  it('pathForTab falls back to root for an unknown tab', () => {
    expect(pathForTab('nope')).toBe('/');
  });
});
