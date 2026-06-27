const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8080';

export function getToken(): string | null {
  return localStorage.getItem('gp_admin_token');
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem('gp_admin_token', t);
  else localStorage.removeItem('gp_admin_token');
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path, { headers: authHeaders() });
  if (res.status === 401) { setToken(null); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.includes('/login')) { setToken(null); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function login(email: string, password: string): Promise<string> {
  const r = await apiPost<{ token: string }>('/admin/login', { email, password });
  setToken(r.token);
  return r.token;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}
