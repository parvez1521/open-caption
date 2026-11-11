import "server-only";
import { getAdmin } from "@/lib/supabase/admin";
import { isMissingTableError, type DbErrorLike } from "@/lib/api/growth";
import type { ConnectPlatform } from "./config";

/**
 * The growth_connections store: the ONLY reader/writer of OAuth tokens.
 *
 * Every query goes through the service-role client (RLS on that table has no
 * policies and no authenticated grant, so PostgREST can never serve a token
 * to a browser) and every query is filtered by owner_id — the routes call
 * this only after requireUser, with the caller's id. The status read selects
 * NON-token columns only, so a token cannot leak through the status route
 * even by accident.
 *
 * Until supabase/APPLY-GROWTH-CONNECT.sql is applied the table does not
 * exist: reads/writes throw ConnectionStoreNotReady and the routes degrade
 * to the honest pending-setup state.
 */

/** The plain pending-setup message sync/disconnect answer until APPLY-GROWTH-CONNECT.sql is applied. */
export const CONNECTIONS_NOT_READY_MESSAGE =
  "Connected accounts are not set up on the server yet — a database update is pending. Manual entry and CSV import keep working.";

export class ConnectionStoreNotReady extends Error {
  constructor() {
    super("growth_connections is not set up yet (APPLY-GROWTH-CONNECT.sql has not been applied)");
    this.name = "ConnectionStoreNotReady";
  }
}

/** Is this error "the external_id column is not there yet" (pre-APPLY database)? */
export function isMissingExternalIdError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message ?? "";
  return message.includes("external_id") && (message.includes("does not exist") || message.includes("Could not find"));
}

export interface ConnectionRow {
  platform: ConnectPlatform;
  accountId: string;
  accountName: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  lastSyncAt: string | null;
}

export interface ConnectionStatusRow {
  platform: ConnectPlatform;
  accountName: string | null;
  lastSyncAt: string | null;
}

interface RawConnectionRow {
  platform: string;
  account_id: string;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  last_sync_at: string | null;
}

const FULL_COLUMNS = "platform, account_id, account_name, access_token, refresh_token, expires_at, last_sync_at";
const STATUS_COLUMNS = "platform, account_name, last_sync_at";

function guard(error: DbErrorLike | null): void {
  if (!error) return;
  if (isMissingTableError(error) || isMissingExternalIdError(error)) throw new ConnectionStoreNotReady();
  throw new Error(`growth_connections query failed: ${error.message ?? "unknown error"}`);
}

/** Statuses for the connect section — no token columns are even selected. */
export async function listConnectionStatuses(ownerId: string): Promise<ConnectionStatusRow[]> {
  const { data, error } = await getAdmin()
    .from("growth_connections")
    .select(STATUS_COLUMNS)
    .eq("owner_id", ownerId);
  guard(error);
  return ((data ?? []) as unknown as Array<{ platform: string; account_name: string | null; last_sync_at: string | null }>).map((r) => ({
    platform: r.platform as ConnectPlatform,
    accountName: r.account_name ?? null,
    lastSyncAt: r.last_sync_at ?? null,
  }));
}

/** The full row INCLUDING tokens — server-side sync/callback paths only. */
export async function getConnection(ownerId: string, platform: ConnectPlatform): Promise<ConnectionRow | null> {
  const { data, error } = await getAdmin()
    .from("growth_connections")
    .select(FULL_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("platform", platform)
    .maybeSingle();
  guard(error);
  if (!data) return null;
  const r = data as unknown as RawConnectionRow;
  return {
    platform: r.platform as ConnectPlatform,
    accountId: r.account_id,
    accountName: r.account_name ?? null,
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? null,
    expiresAt: r.expires_at ?? null,
    lastSyncAt: r.last_sync_at ?? null,
  };
}

export async function upsertConnection(
  ownerId: string,
  row: Omit<ConnectionRow, "lastSyncAt"> & { lastSyncAt?: string | null },
): Promise<void> {
  const { error } = await getAdmin()
    .from("growth_connections")
    .upsert(
      {
        owner_id: ownerId,
        platform: row.platform,
        account_id: row.accountId,
        account_name: row.accountName,
        access_token: row.accessToken,
        refresh_token: row.refreshToken,
        expires_at: row.expiresAt,
        ...(row.lastSyncAt !== undefined ? { last_sync_at: row.lastSyncAt } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,platform" },
    );
  guard(error);
}

export async function touchLastSync(ownerId: string, platform: ConnectPlatform, whenIso: string): Promise<void> {
  const { error } = await getAdmin()
    .from("growth_connections")
    .update({ last_sync_at: whenIso, updated_at: whenIso })
    .eq("owner_id", ownerId)
    .eq("platform", platform);
  guard(error);
}

export async function deleteConnection(ownerId: string, platform: ConnectPlatform): Promise<void> {
  const { error } = await getAdmin()
    .from("growth_connections")
    .delete()
    .eq("owner_id", ownerId)
    .eq("platform", platform);
  guard(error);
}
