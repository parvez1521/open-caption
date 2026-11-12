/**
 * Centralized client for the real MotionAI backend. Source: contracts/api.md
 * > Standard Response Format. Source: Sprint 1.6 brief > API Client
 * ("Centralize: API client, Request interceptors, Error handling, Retry
 * policy, Upload progress, Abort handling.").
 *
 * Every service module routes HTTP calls through this module — none of
 * them touch `fetch`/`XMLHttpRequest`/localStorage directly.
 */

import { authService } from "./auth";

// The API is served by this same Next app (route handlers), so it is always same-origin.
const API_BASE_URL = "/api/v1";

/** Idempotent GETs only get one extra attempt — a network blip, not a
 * fixed contract response, is the only thing worth retrying automatically.
 * 4xx/5xx responses (the backend answered) are never retried here. */
const GET_RETRY_ATTEMPTS = 1;
const GET_RETRY_DELAY_MS = 400;

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  retryable?: boolean;
  timestamp?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown> | null;
  retryable: boolean;
  timestamp: string | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.code = body.code;
    this.status = status;
    this.details = body.details ?? null;
    this.retryable = body.retryable ?? false;
    this.timestamp = body.timestamp ?? null;
  }
}

/** Thrown when the backend cannot be reached at all (DNS/connection
 * refused/CORS) — distinct from ApiError, which means the backend *did*
 * respond, just with an error. */
export class NetworkUnavailableError extends Error {
  constructor() {
    super("Could not reach the backend. Check your connection and try again.");
  }
}

async function getAuthToken(): Promise<string | null> {
  return authService.getToken();
}

async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new ApiError(response.status, body.error ?? { code: "UNKNOWN_ERROR", message: "Request failed." });
  }
  return body.data as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithNetworkErrorHandling(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkUnavailableError();
  }
}

export const apiClient = {
  async post<T>(path: string, init?: { json?: unknown; formData?: FormData; signal?: AbortSignal }): Promise<T> {
    const token = await getAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await fetchWithNetworkErrorHandling(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: init?.formData ? headers : { ...headers, "Content-Type": "application/json" },
      body: init?.formData ?? (init?.json !== undefined ? JSON.stringify(init.json) : undefined),
      signal: init?.signal,
    });
    return unwrap<T>(response);
  },

  async patch<T>(path: string, init?: { json?: unknown; signal?: AbortSignal }): Promise<T> {
    const token = await getAuthToken();
    const headers: HeadersInit = { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };

    const response = await fetchWithNetworkErrorHandling(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: init?.signal,
    });
    return unwrap<T>(response);
  },

  async put<T>(path: string, init?: { json?: unknown; signal?: AbortSignal }): Promise<T> {
    const token = await getAuthToken();
    const headers: HeadersInit = { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };

    const response = await fetchWithNetworkErrorHandling(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: init?.signal,
    });
    return unwrap<T>(response);
  },

  async delete<T = void>(path: string, init?: { signal?: AbortSignal }): Promise<T> {
    const token = await getAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await fetchWithNetworkErrorHandling(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers,
      signal: init?.signal,
    });
    if (response.status === 204) return undefined as T;
    return unwrap<T>(response);
  },

  async get<T>(path: string, init?: { signal?: AbortSignal }): Promise<T> {
    const token = await getAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    let lastError: unknown;
    for (let attempt = 0; attempt <= GET_RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await fetchWithNetworkErrorHandling(`${API_BASE_URL}${path}`, {
          headers,
          signal: init?.signal,
        });
        return await unwrap<T>(response);
      } catch (err) {
        lastError = err;
        // Only retry network failures, never aborts or backend error responses.
        if (!(err instanceof NetworkUnavailableError) || attempt === GET_RETRY_ATTEMPTS) {
          throw err;
        }
        await sleep(GET_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  },

  /** Like `get`, but returns `meta` alongside `data` — needed for paginated
   * list endpoints (contracts/api.md > Standard Response Format `meta`). */
  async getWithMeta<T>(path: string, init?: { signal?: AbortSignal }): Promise<{ data: T; meta: Record<string, unknown> }> {
    const token = await getAuthToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    let lastError: unknown;
    for (let attempt = 0; attempt <= GET_RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await fetchWithNetworkErrorHandling(`${API_BASE_URL}${path}`, {
          headers,
          signal: init?.signal,
        });
        const body = await response.json();
        if (!response.ok || body.success === false) {
          throw new ApiError(response.status, body.error ?? { code: "UNKNOWN_ERROR", message: "Request failed." });
        }
        return { data: body.data as T, meta: body.meta ?? {} };
      } catch (err) {
        lastError = err;
        if (!(err instanceof NetworkUnavailableError) || attempt === GET_RETRY_ATTEMPTS) {
          throw err;
        }
        await sleep(GET_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  },

  /** Multipart upload with progress reporting (fetch has no upload-progress event).
   * `onXhrReady` hands back the underlying XHR so the caller can `.abort()` it. */
  uploadWithProgress<T>(
    path: string,
    formData: FormData,
    onProgress: (percent: number) => void,
    onXhrReady?: (xhr: XMLHttpRequest) => void
  ): Promise<T> {
    return (async () => {
      const token = await getAuthToken();
      return new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}${path}`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        onXhrReady?.(xhr);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          let body: any;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            reject(new Error("Backend returned a non-JSON response."));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300 && body.success !== false) {
            resolve(body.data as T);
          } else {
            reject(new ApiError(xhr.status, body.error ?? { code: "UNKNOWN_ERROR", message: "Upload failed." }));
          }
        };

        xhr.onerror = () => reject(new NetworkUnavailableError());
        xhr.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));

        xhr.send(formData);
      });
    })();
  },
};
