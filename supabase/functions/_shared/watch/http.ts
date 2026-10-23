import type { WatchFailure } from './model.ts';

/** `fetch`, injectable so the provider clients run against mocked APIs in tests. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpOk<T> {
  ok: true;
  status: number;
  body: T;
}
export interface HttpFail {
  ok: false;
  failure: WatchFailure;
  status: number;
  detail: string;
}

export function failureOf(status: number): WatchFailure {
  if (status === 401 || status === 403) return 'not_connected';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 405 || status === 501) return 'unsupported';
  return 'rejected';
}

/** One JSON request. Never throws: network errors and non-2xx answers come back as `HttpFail`. */
export async function requestJson<T = unknown>(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<HttpOk<T> | HttpFail> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        ...(headers as Record<string, string> | undefined),
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch (e) {
    return { ok: false, failure: 'network', status: 0, detail: String(e) };
  }
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      failure: failureOf(response.status),
      status: response.status,
      // Provider messages can be long; the status and the first part are enough to debug.
      detail: text.slice(0, 300),
    };
  }
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { ok: true, status: response.status, body: body as T };
}
