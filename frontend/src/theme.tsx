import { useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';
const STORAGE_KEY = 'ghm_theme';
const LEGACY_KEY = 'ghm_theme_v87';

export function getSavedTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    // Ignore storage/privacy mode failures.
  }
  return 'light';
}

export function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.ghmTheme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(LEGACY_KEY, theme);
  } catch {
    // Ignore storage/privacy mode failures.
  }
  window.dispatchEvent(new CustomEvent('ghm:theme', { detail: { theme } }));
}

export function useThemePreference() {
  const [theme, setTheme] = useState<AppTheme>(() => getSavedTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<{ theme?: AppTheme }>).detail?.theme;
      if (next && next !== theme) setTheme(next);
    };
    window.addEventListener('ghm:theme', sync);
    return () => window.removeEventListener('ghm:theme', sync);
  }, [theme]);

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme((value) => value === 'dark' ? 'light' : 'dark'),
  };
}

export function ThemeToggle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { theme, toggleTheme } = useThemePreference();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle-v88 ${compact ? 'compact' : ''} ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <span className="theme-toggle-icon-v88" aria-hidden="true">{dark ? '☀' : '☾'}</span>
      {!compact && <strong>{dark ? 'Light mode' : 'Dark mode'}</strong>}
    </button>
  );
}
