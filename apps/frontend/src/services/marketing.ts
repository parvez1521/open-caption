import { apiClient } from "./api-client";
import { authService } from "./auth";

export interface MarketingPreference {
  email: string | null;
  marketingOptIn: boolean;
  marketingOptInAt: string | null;
}

/**
 * Record this account's email on the subscriber list (once per session,
 * from /start). A capture failure must NEVER break sign-in: the table may
 * not be migrated yet, the network may blip — either way the caller just
 * carries on to the dashboard. Returns null when nothing was recorded.
 */
export async function captureEmailSubscription(): Promise<{ marketingOptIn: boolean } | null> {
  try {
    return await apiClient.post<{ marketingOptIn: boolean }>("/marketing/capture", { json: {} });
  } catch {
    return null;
  }
}

/** The Settings toggle's initial state. */
export async function getMarketingPreference(): Promise<MarketingPreference> {
  return apiClient.get<MarketingPreference>("/marketing/preference");
}

/** The Settings toggle's save. */
export async function setMarketingPreference(marketingOptIn: boolean): Promise<MarketingPreference> {
  return apiClient.patch<MarketingPreference>("/marketing/preference", { json: { marketingOptIn } });
}

/**
 * Owner check for the Settings export button: the admin route answers 200
 * (with the subscriber count) to the owner and 403 to everyone else.
 * Null = not the owner (or the route is unreachable) — the button hides.
 */
export async function getSubscriberListMeta(): Promise<{ total: number } | null> {
  try {
    return await apiClient.get<{ total: number }>("/admin/subscribers");
  } catch {
    return null;
  }
}

/**
 * The CSV download. apiClient only speaks JSON, so this fetches the same
 * route directly — WITH the Bearer token attached, exactly as apiClient
 * would; without it the route answers 401. The blob is handed to the
 * browser as a file download, never rendered in the page.
 */
export async function downloadSubscriberCsv(): Promise<void> {
  const token = await authService.getToken();
  const res = await fetch("/api/v1/admin/subscribers?format=csv", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Could not download the subscriber list.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `captionit-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
