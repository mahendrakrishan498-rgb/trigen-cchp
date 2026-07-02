const isLocalhost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

const configuredApiBase = import.meta.env.VITE_API_BASE || '';
const devApiBase =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5000/api`
    : 'http://localhost:5000/api';
const isBadProductionApiBase =
  !configuredApiBase ||
  configuredApiBase === '/api' ||
  configuredApiBase.includes('localhost') ||
  configuredApiBase.includes('127.0.0.1');

export const API_BASE =
  isLocalhost || import.meta.env.DEV
    ? (configuredApiBase || devApiBase)
    : (isBadProductionApiBase ? '/_/backend/api' : configuredApiBase);

function clearStoredAuth() {
  localStorage.removeItem('trigen_token');
  localStorage.removeItem('trigen_user');
  localStorage.removeItem('trigen_project_id');
  window.dispatchEvent(new Event('trigen-auth-expired'));
}

export function getToken() {
  return localStorage.getItem('trigen_token');
}

export async function apiRequest(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).message || msg; } catch {}
    if (res.status === 401 && token) clearStoredAuth();
    throw new Error(msg);
  }
  return res.json();
}

export async function downloadPdf(projectId) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reports/${projectId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    if (res.status === 401 && token) clearStoredAuth();
    throw new Error('PDF generation failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trigen-report-project-${projectId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
