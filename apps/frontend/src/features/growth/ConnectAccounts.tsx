"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/services/api-client";

/**
 * "Connect your accounts" (Growth Studio P1, 2026-11-11).
 *
 * One card per platform, four honest states driven entirely by the status
 * route — this component never guesses:
 *  - not switched on: the platform's OAuth app is not configured for the
 *    product yet. There is NO connect button in this state, fake or
 *    otherwise — just the plain fact.
 *  - setup pending: credentials exist but the database update
 *    (APPLY-GROWTH-CONNECT.sql) has not been applied.
 *  - connect: a button that fetches the server OAuth URL (authed) and
 *    navigates to the provider.
 *  - connected: account name, last sync, Sync now, Disconnect (two-step,
 *    with the "synced posts stay" fact stated before confirming).
 * Instagram carries one extra plain line: views/reach/shares/saves arrive
 * only once Meta approves the app's insights permission review.
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

const cardCls = "rounded-2xl border border-sand-200 bg-sand-50 p-5 shadow-[0_2px_16px_rgba(16,15,10,0.06)]";
const primaryBtn =
  "inline-flex items-center justify-center rounded-full bg-sand-900 px-5 py-2.5 font-sora text-[13px] font-semibold text-sand-50 transition hover:bg-sand-800 disabled:opacity-50";
const ghostBtn =
  "inline-flex items-center justify-center rounded-full border border-sand-300 bg-sand-50 px-4 py-2 font-sora text-[12.5px] font-semibold text-obsidian transition hover:bg-sand-100 disabled:opacity-50";

/**
 * Every call goes through the shared apiClient, which attaches the session's
 * Bearer token — the API's only auth channel. (Bugfix 2026-11-11: this panel
 * originally used raw fetch with no token, so the status route answered 401
 * and the section could only ever render its "couldn't load" state in a real
 * browser; the fetch-stubbed panel tests never modelled auth, so it shipped.)
 */
async function api<T>(path: string, init?: { method?: string }): Promise<T> {
  return init?.method === "POST" ? apiClient.post<T>(path) : apiClient.get<T>(path);
}

const platformName = (value: string | null): string =>
  value === "youtube" ? "YouTube" : value === "instagram" ? "Instagram" : "That account";

export function ConnectAccounts({ onSynced }: { onSynced: () => void }) {
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
          : `${platformName(connected)} is connected and its latest posts were synced into your list below.`,
      );
      onSynced();
      void load();
    } else if (failed) {
      setNotice(
        failed === "instagram"
          ? "Instagram didn't finish connecting. This can happen while Meta's permission review for the app is still pending — nothing was stored."
          : `${platformName(failed)} didn't finish connecting — nothing was stored. You can try again from its card.`,
      );
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
          `Synced ${result.stored} post${result.stored === 1 ? "" : "s"} in your list.` +
          (result.channelTotal !== null
            ? ` YouTube reports ${result.channelTotal} upload${result.channelTotal === 1 ? "" : "s"} in total.`
            : ""),
      }));
      onSynced();
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
      setRowNote((m) => ({ ...m, [platform]: "Disconnected. Posts already synced stay in your list." }));
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
    return (
      <div key={row.platform} className="rounded-xl border border-sand-200 bg-white/60 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-sora text-[14.5px] font-semibold text-obsidian">{meta.name}</p>
          <span className="rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
            {stateLabel}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-sand-700">{meta.blurb}</p>

        {!row.configured ? (
          <p className="mt-3 text-[13px] leading-relaxed text-sand-700">
            This connection isn&apos;t switched on for Open Caption yet. Manual entry and CSV import keep working as
            they are.
          </p>
        ) : row.connected ? (
          <div className="mt-3">
            <p className="text-[13px] text-obsidian">
              Connected as <span className="font-semibold">{row.accountName ?? meta.name}</span>
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
                <span className="text-[12.5px] text-sand-700">Disconnect {meta.name}? Synced posts stay in your list.</span>
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
          <p className="mt-3 text-[13px] leading-relaxed text-sand-700">
            One server setup step is still pending (a database update) before accounts can connect.
          </p>
        ) : (
          <div className="mt-3">
            <button type="button" className={primaryBtn} disabled={busyKey !== null} onClick={() => void startConnect(row.platform)}>
              {busyKey === `${row.platform}:connect` ? "Opening…" : `Connect ${meta.name}`}
            </button>
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
    );
  };

  return (
    <section className="pt-10" aria-label="Connect your accounts">
      <h2 className="font-sora text-[19px] font-bold tracking-[-0.01em] text-obsidian">Connect your accounts</h2>
      <div className={`${cardCls} mt-4`}>
        <p className="max-w-[68ch] text-[13px] leading-relaxed text-sand-700">
          Connect your own YouTube or Instagram and its post stats flow in here automatically — read-only, and only
          ever your account. Disconnecting stops future syncs; posts already synced stay yours.
        </p>
        {notice ? (
          <p role="status" className="mt-3 rounded-lg border border-sand-200 bg-sand-100 px-3 py-2 text-[13px] text-obsidian">
            {notice}
          </p>
        ) : null}
        {loadFailed ? (
          <p className="mt-3 text-[13px] text-sand-700">
            Connection status couldn&apos;t load just now.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>
              Retry
            </button>
          </p>
        ) : status === null ? (
          <p className="mt-3 text-[13px] text-sand-600">Loading connection status…</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">{status.platforms.map(renderRow)}</div>
        )}
      </div>
    </section>
  );
}
