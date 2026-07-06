const SYMBOLS: Record<string, string> = {
  CAD: '$',
  USD: '$',
  INR: '₹',
  GBP: '£',
  EUR: '€',
  AUD: '$',
  NZD: '$',
};

export function currentCurrency(): string {
  try {
    const cached = localStorage.getItem('account_profile_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.currency_code) return String(parsed.currency_code).toUpperCase();
    }
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      if (parsed?.currency_code) return String(parsed.currency_code).toUpperCase();
    }
  } catch {
    // ignore malformed cache
  }
  return 'CAD';
}

export function money(value?: number | null, currency = currentCurrency()): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
  const code = currency || 'CAD';
  const symbol = SYMBOLS[code] || `${code} `;
  return `${symbol}${Number(value).toFixed(2)}`;
}
