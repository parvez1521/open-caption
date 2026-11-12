"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/services/api-client";

/**
 * Accounts bar (Growth page rebuild, owner order 2026-11-11): the connected
 * accounts sit at the TOP of the chat-first Growth page — the slot vidIQ
 * gives the channel identity — and this bar replaces both the old
 * full-width "Connect your accounts" section and the connection chips the
 * coach briefly carried in its own header.
 *
 * One compact card per platform, four honest states driven entirely by the
 * status route — this component never guesses:
 *  - not switched on: the platform's OAuth app is not configured for the
 *    product yet. There is NO connect button in this state, fake or
 *    otherwise — just the plain fact.
 *  - setup pending: credentials exist but the database update
 *    (APPLY-GROWTH-CONNECT.sql) has not been applied.
 *  - connect: a button that fetches the server OAuth URL (authed) and
 *    navigates to the provider.
 *  - connected: an initials tile (the status route carries no avatar
 *    image, so none is invented), the account name, the platform, how
 *    many posts have synced, Sync now, and a two-step Disconnect that
 *    states synced posts stay before confirming.
 * Instagram carries one extra plain line: views/reach/shares/saves arrive
 * only once Meta approves the app's insights permission review.
 *
 * The handlers (OAuth start via authed JSON { url }, sync, disconnect)
 * are the same ones the old ConnectAccounts section ran — only the
 * surface and the copy changed: there is no post list below this bar any
 * more, so nothing here points at one.
 */

type Platform = "youtube" | "instagram";

interface PlatformStatus {
  platform: Platform;
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  lastSyncAt: string | null;
  /** Stored posts this connection's syncs have brought in; null = the count couldn't be read. */
  postCount?: number | null;
}

interface StatusResponse {
  setupPending: boolean;
  platforms: PlatformStatus[];
}

const PLATFORM_META: Record<Platform, { name: string; blurb: string }> = {
  youtube: { name: "YouTube", blurb: "Your channel's uploads, with views, likes and comments per video." },
  instagram: { name: "Instagram", blurb: "Your posts, with likes and comments per post." },
};

const primaryBtn =
  "inline-flex items-center justify-center rounded-full bg-sand-900 px-4 py-2 font-sora text-[12.5px] font-semibold text-sand-50 transition hover:bg-sand-800 disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center justify-center rounded-full border border-sand-300 bg-sand-50 px-4 py-2 font-sora text-[12.5px] font-semibold text-obsidian transition hover:bg-sand-100 disabled:opacity-50";

/**
 * Every call goes through the shared apiClient, which attaches the session's
 * Bearer token — the API's only auth channel. (Bugfix 2026-11-11: the
 * predecessor panel used raw fetch with no token, so the status route
 * answered 401 and the section could only ever render its "couldn't load"
 * state in a real browser; the fetch-stubbed panel tests never modelled
 * auth, so it shipped.)
 */
async function api<T>(path: string, init?: { method?: string }): Promise<T> {
  return init?.method === "POST" ? apiClient.post<T>(path) : apiClient.get<T>(path);
}

const platformName = (value: string | null): string =>
  value === "youtube" ? "YouTube" : value === "instagram" ? "Instagram" : "That account";

/** Initials for the account tile — the status route carries no avatar image, so a tile is drawn from the name it does carry. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function AccountsBar({ onSynced }: { onSynced?: () => void }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Platform | null>(null);
  const [rowNote, setRowNote] = useState<Partial<Record<Platform, string>>>({});
  const [rowError, setRowError] = useState<Partial<Record<Platform, string>>>({});

  const load = useCallback(async () => {
    try {
      setStatus(await api<StatusResponse>("/growth/connections"));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One-shot notices from the OAuth round-trip (?connected= / ?connect_error= / ?connect=…-off).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const failed = params.get("connect_error");
    const off = params.get("connect");
    if (!connected && !failed && !off) return;
    if (connected) {
      setNotice(
        params.get("sync") === "failed"
          ? `${platformName(connected)} is connected. The first sync didn't finish — press Sync now on its card.`
          : `${platformName(connected)} is connected and its latest posts were synced. Ask the Coach about them below.`,
      );
      onSynced?.();
      void load();
    } else if (failed) {
      // No cause is claimed here: the callback only carries the platform,
      // and past failures were code bugs, not Meta's review — so the notice
      // says only what is known (it didn't finish, nothing was stored).
      setNotice(`${platformName(failed)} didn't finish connecting — nothing was stored. You can try again from its card.`);
    } else if (off) {
      const platform = off.replace(/-off$/, "");
      setNotice(`${platformName(platform)} connect isn't switched on for Open Caption yet.`);
    }
    window.history.replaceState({}, "", "/growth");
    // onSynced/load are stable enough for a one-shot mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The start route answers JSON { url } to an authed call (a bare browser
   * navigation could never carry the Bearer token — see the route), so the
   * button fetches the provider URL through the apiClient and navigates.
   */
  const startConnect = async (platform: Platform) => {
    setBusyKey(`${platform}:connect`);
    setRowError((m) => ({ ...m, [platform]: undefined }));
    try {
      const { url } = await api<{ url: string }>(`/growth/connect/${platform}/start`);
      window.location.href = url;
    } catch (err) {
      setRowError((m) => ({ ...m, [platform]: err instanceof Error ? err.message : "Connect didn't open — try again." }));
      setBusyKey(null);
    }
  };

  const syncNow = async (platform: Platform) => {
    setBusyKey(`${platform}:sync`);
    setRowError((m) => ({ ...m, [platform]: undefined }));
    try {
      const result = await api<{ synced: number; fetched: number; stored: number; channelTotal: number | null }>(
        `/growth/connect/${platform}/sync`,
        { method: "POST" },
      );
      setRowNote((m) => ({
        ...m,
        [platform]:
          `Synced ${result.stored} post${result.stored === 1 ? "" : "s"}.` +
          (result.channelTotal !== null
            ? ` YouTube reports ${result.channelTotal} upload${result.channelTotal === 1 ? "" : "s"} in total.`
            : ""),
      }));
      onSynced?.();
      await load();
    } catch (err) {
      setRowError((m) => ({ ...m, [platform]: err instanceof Error ? err.message : "Sync failed — try again." }));
    } finally {
      setBusyKey(null);
    }
  };

  const disconnect = async (platform: Platform) => {
    setBusyKey(`${platform}:disconnect`);
    setRowError((m) => ({ ...m, [platform]: undefined }));
    try {
      await api(`/growth/connect/${platform}/disconnect`, { method: "POST" });
      setConfirming(null);
      setRowNote((m) => ({ ...m, [platform]: "Disconnected. Posts already synced stay yours." }));
      await load();
    } catch (err) {
      setRowError((m) => ({ ...m, [platform]: err instanceof Error ? err.message : "Disconnect failed — try again." }));
    } finally {
      setBusyKey(null);
    }
  };

  const renderRow = (row: PlatformStatus) => {
    const meta = PLATFORM_META[row.platform];
    const stateLabel = row.connected
      ? "Connected"
      : !row.configured
        ? "Not switched on"
        : status?.setupPending
          ? "Setup pending"
          : "Not connected";
    const displayName = row.connected && row.accountName ? row.accountName : meta.name;
    return (
      <div key={row.platform} className="rounded-2xl border border-sand-200 bg-sand-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-900 font-sora text-[13px] font-bold text-sand-50"
          >
            {initialsOf(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="truncate font-sora text-[14.5px] font-semibold text-obsidian" title={displayName}>
                {displayName}
              </p>
              <span className="rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
                {stateLabel}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] font-medium text-sand-600">{meta.name}</p>

            {!row.configured ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-sand-700">
                This connection isn&apos;t switched on for Open Caption yet.
              </p>
            ) : row.connected ? (
              <div className="mt-2">
                <p className="text-[12.5px] text-sand-700">
                  Connected as <span className="font-semibold text-obsidian">{row.accountName ?? meta.name}</span>
                  {" · "}
                  {row.lastSyncAt
                    ? `Last synced ${new Date(row.lastSyncAt).toLocaleString()}`
                    : "Not synced yet"}
                  {typeof row.postCount === "number"
                    ? ` · Synced ${row.postCount} post${row.postCount === 1 ? "" : "s"}`
                    : ""}
                </p>
                {confirming === row.platform ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-sand-700">Disconnect {meta.name}? Posts already synced stay yours.</span>
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={busyKey !== null}
                      onClick={() => void disconnect(row.platform)}
                    >
                      {busyKey === `${row.platform}:disconnect` ? "Disconnecting…" : "Yes, disconnect"}
                    </button>
                    <button type="button" className={ghostBtn} onClick={() => setConfirming(null)}>
                      Keep connected
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={busyKey !== null}
                      onClick={() => void syncNow(row.platform)}
                    >
                      {busyKey === `${row.platform}:sync` ? "Syncing…" : "Sync now"}
                    </button>
                    <button type="button" className={ghostBtn} disabled={busyKey !== null} onClick={() => setConfirming(row.platform)}>
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            ) : status?.setupPending ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-sand-700">
                One server setup step is still pending (a database update) before accounts can connect.
              </p>
            ) : (
              <div className="mt-2">
                <p className="text-[12.5px] leading-relaxed text-sand-700">{meta.blurb}</p>
                <div className="mt-3">
                  <button type="button" className={primaryBtn} disabled={busyKey !== null} onClick={() => void startConnect(row.platform)}>
                    {busyKey === `${row.platform}:connect` ? "Opening…" : `Connect ${meta.name}`}
                  </button>
                </div>
                {row.platform === "instagram" ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-sand-600">
                    Views, reach, shares and saves arrive once Meta approves the app&apos;s insights permission — until
                    then a sync brings posts, likes and comments only.
                  </p>
                ) : null}
              </div>
            )}

            {rowNote[row.platform] ? <p className="mt-2 text-[12.5px] text-sand-700">{rowNote[row.platform]}</p> : null}
            {rowError[row.platform] ? (
              <p role="alert" className="mt-2 text-[12.5px] font-medium text-red-700">
                {rowError[row.platform]}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section aria-label="Connected accounts">
      {notice ? (
        <p role="status" className="mb-3 rounded-lg border border-sand-200 bg-sand-100 px-3 py-2 text-[13px] text-obsidian">
          {notice}
        </p>
      ) : null}
      {loadFailed ? (
        <p className="rounded-2xl border border-sand-200 bg-sand-50 px-4 py-4 text-[13px] text-sand-700">
          Connection status couldn&apos;t load just now.{" "}
          <button type="button" className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : status === null ? (
        <p className="rounded-2xl border border-sand-200 bg-sand-50 px-4 py-4 text-[13px] text-sand-600">
          Loading connection status…
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{status.platforms.map(renderRow)}</div>
      )}
    </section>
  );
}
