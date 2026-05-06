export function compactNumber(value, options = {}) {
  const { suffix = '', decimals = 2 } = options;
  const x = Number(value || 0);
  const a = Math.abs(x);

  if (a >= 1e9) return `${(x / 1e9).toFixed(decimals)}B${suffix}`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(decimals)}M${suffix}`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(1)}k${suffix}`;

  return `${x.toLocaleString('en-LK', { maximumFractionDigits: decimals })}${suffix}`;
}

export function moneyShort(value) {
  return compactNumber(value, { suffix: ' LKR', decimals: 2 });
}

export function formatValueByKey(key, value) {
  if (value === null || value === undefined) return 'N/A';

  const normalized = String(key || '').toLowerCase();
  if (normalized.includes('lkr')) return moneyShort(value);

  if (typeof value === 'number') {
    return value.toLocaleString('en-LK', { maximumFractionDigits: 4 });
  }

  return String(value);
}
