import { useEffect, useMemo, useState } from 'react';

export type AppTheme = 'light' | 'dark';
export type AppearanceMode = 'system' | 'light' | 'dark';
export type VisualStyle = 'classic' | 'calm' | 'vibrant';

const THEME_KEY = 'ghm_theme';
const LEGACY_KEY = 'ghm_theme_v87';
const APPEARANCE_KEY = 'ghm_appearance_v105';
const STYLE_KEY = 'ghm_visual_style_v105';

function systemTheme(): AppTheme {
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function getSavedAppearanceMode(): AppearanceMode {
  try {
    const saved = localStorage.getItem(APPEARANCE_KEY);
    if (saved === 'system' || saved === 'light' || saved === 'dark') return saved;
    const legacy = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_KEY);
    if (legacy === 'light' || legacy === 'dark') return legacy;
  } catch { /* privacy mode */ }
  return 'system';
}

export function getSavedVisualStyle(): VisualStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved === 'classic' || saved === 'calm' || saved === 'vibrant') return saved;
  } catch { /* privacy mode */ }
  return 'classic';
}

export function resolveAppearance(mode: AppearanceMode): AppTheme {
  return mode === 'system' ? systemTheme() : mode;
}

function applyResolvedTheme(theme: AppTheme) {
  document.documentElement.dataset.ghmTheme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const themeColor = theme === 'dark' ? '#0c1821' : '#f4f0e8';
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = themeColor;
}

export function applyVisualStyle(style: VisualStyle) {
  document.documentElement.dataset.ghmStyle = style;
  try { localStorage.setItem(STYLE_KEY, style); } catch { /* no-op */ }
  window.dispatchEvent(new CustomEvent('ghm:visual-style', { detail: { style } }));
}

export function applyAppearance(mode: AppearanceMode) {
  const theme = resolveAppearance(mode);
  document.documentElement.dataset.ghmAppearance = mode;
  applyResolvedTheme(theme);
  try {
    localStorage.setItem(APPEARANCE_KEY, mode);
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(LEGACY_KEY, theme);
  } catch { /* no-op */ }
  window.dispatchEvent(new CustomEvent('ghm:appearance', { detail: { mode, theme } }));
  window.dispatchEvent(new CustomEvent('ghm:theme', { detail: { theme } }));
}

export function initializeThemePreferences() {
  const mode = getSavedAppearanceMode();
  const style = getSavedVisualStyle();
  applyVisualStyle(style);
  applyAppearance(mode);
}

// Backward-compatible APIs used by historical GHM components.
export function getSavedTheme(): AppTheme { return resolveAppearance(getSavedAppearanceMode()); }
export function applyTheme(theme: AppTheme) { applyAppearance(theme); }

export function useThemePreference() {
  const [appearance, setAppearanceState] = useState<AppearanceMode>(() => getSavedAppearanceMode());
  const [style, setStyleState] = useState<VisualStyle>(() => getSavedVisualStyle());
  const [theme, setThemeState] = useState<AppTheme>(() => resolveAppearance(getSavedAppearanceMode()));

  useEffect(() => {
    applyAppearance(appearance);
    setThemeState(resolveAppearance(appearance));
  }, [appearance]);

  useEffect(() => { applyVisualStyle(style); }, [style]);

  useEffect(() => {
    const onAppearance = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: AppearanceMode; theme?: AppTheme }>).detail;
      if (detail?.mode) setAppearanceState(detail.mode);
      if (detail?.theme) setThemeState(detail.theme);
    };
    const onStyle = (event: Event) => {
      const next = (event as CustomEvent<{ style?: VisualStyle }>).detail?.style;
      if (next) setStyleState(next);
    };
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSystem = () => {
      if (getSavedAppearanceMode() !== 'system') return;
      const next = systemTheme();
      applyResolvedTheme(next);
      setThemeState(next);
      window.dispatchEvent(new CustomEvent('ghm:theme', { detail: { theme: next } }));
    };
    window.addEventListener('ghm:appearance', onAppearance);
    window.addEventListener('ghm:visual-style', onStyle);
    media?.addEventListener?.('change', onSystem);
    return () => {
      window.removeEventListener('ghm:appearance', onAppearance);
      window.removeEventListener('ghm:visual-style', onStyle);
      media?.removeEventListener?.('change', onSystem);
    };
  }, []);

  const api = useMemo(() => ({
    theme,
    appearance,
    style,
    setAppearance: (next: AppearanceMode) => setAppearanceState(next),
    setStyle: (next: VisualStyle) => setStyleState(next),
    setTheme: (next: AppTheme) => setAppearanceState(next),
    toggleTheme: () => setAppearanceState(theme === 'dark' ? 'light' : 'dark'),
  }), [theme, appearance, style]);
  return api;
}

export function ThemeToggle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { theme, toggleTheme, appearance } = useThemePreference();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle-v88 ${compact ? 'compact' : ''} ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={appearance === 'system' ? `System appearance · currently ${theme}` : (dark ? 'Light mode' : 'Dark mode')}
    >
      <span className="theme-toggle-icon-v88" aria-hidden="true">{dark ? '☀' : '☾'}</span>
      {!compact && <strong>{appearance === 'system' ? `System · ${dark ? 'Dark' : 'Light'}` : (dark ? 'Light mode' : 'Dark mode')}</strong>}
    </button>
  );
}
