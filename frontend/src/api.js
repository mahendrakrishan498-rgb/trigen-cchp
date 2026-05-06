const defaultApiBase =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? '/_/backend/api'
    : 'http://localhost:5000/api';

export const API_BASE = import.meta.env.VITE_API_BASE || defaultApiBase;

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
    throw new Error(msg);
  }
  return res.json();
}

export async function downloadPdf(projectId) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reports/${projectId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('PDF generation failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trigen-report-project-${projectId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
