async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request('GET', `/api/${url}`),
  post: (url, body = {}) => request('POST', `/api/${url}`, body),
  put: (url, body = {}) => request('PUT', `/api/${url}`, body),
  del: (url) => request('DELETE', `/api/${url}`),
};
