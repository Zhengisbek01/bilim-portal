export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: { path: string; message: string }[]) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${url}`, {
    method, credentials: "same-origin",
    headers: body && !isForm ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = data?.fields?.length ? `${data.error}: ${data.fields.map((f: any) => f.message).join("; ")}` : data?.error || `Ошибка ${res.status}`;
    throw new ApiError(res.status, msg, data?.fields);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>("GET", url),
  post: <T = any>(url: string, body: unknown = {}) => request<T>("POST", url, body),
  put: <T = any>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T = any>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T = any>(url: string) => request<T>("DELETE", url),
};
