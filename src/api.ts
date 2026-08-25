const cookie = (name: string) => document.cookie.split('; ').find((part) => part.startsWith(`${name}=`))?.split('=').slice(1).join('=');
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(isFormData ? {} : { 'content-type': 'application/json' }), ...(options.method && options.method !== 'GET' ? { 'x-csrf-token': decodeURIComponent(cookie('mustaner_csrf') || '') } : {}), ...options.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Request failed (${response.status})`); }
  return response.status === 204 ? undefined as T : response.json();
}
