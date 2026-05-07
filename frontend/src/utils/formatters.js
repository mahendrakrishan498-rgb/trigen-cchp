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

export function percentValue(value, decimals = 2) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const x = Number(value);
  if (!Number.isFinite(x)) return 'N/A';
  const percent = Math.abs(x) > 0 && Math.abs(x) < 1 ? x * 100 : x;
  return percent.toLocaleString('en-LK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

export function formatValueByKey(key, value) {
  if (value === null || value === undefined) return 'N/A';

  const normalized = String(key || '').toLowerCase();
  if (normalized.includes('lkr')) return moneyShort(value);
  if (normalized.includes('irr') || normalized.includes('percent') || normalized.endsWith('_pct')) return `${percentValue(value)}%`;

  if (typeof value === 'number') {
    return value.toLocaleString('en-LK', { maximumFractionDigits: 4 });
  }

  return String(value);
}
