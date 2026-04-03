const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + url, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid — clear and redirect to login
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    return undefined as T;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function get<T>(url: string) { return request<T>(url); }

function post<T>(url: string, body?: unknown) {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function put<T>(url: string, body?: unknown) {
  return request<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function del(url: string) {
  return request<void>(url, { method: 'DELETE' });
}

async function upload<T>(url: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + url, { method: 'POST', body: formData, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    return undefined as T;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = { get, post, put, del, upload };
export default api;
