"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ConnectComputer } from "./ConnectComputer";
import { workersService, type Worker } from "@/services/workers";

/**
 * Paired computers (A-04 + A-05): the Companion pairing flow and the
 * revoke control the privacy policy and terms promise ("revoke paired
 * computers in Settings").
 *
 * The top half mounts the existing ConnectComputer — the pairing-code
 * flow (POST /device/setup) that no page rendered until now. Below it,
 * the signed-in account's paired workers list with a two-step Remove
 * per computer, wired to workersService.deleteWorker. Removing a
 * computer revokes its token; its exports and transcriptions stop
 * running there. Nothing here invents a computer: an empty list says
 * so plainly.
 */

function formatLastSeen(iso: string | null): string {
  if (!iso) return "never seen";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never seen" : `last seen ${d.toLocaleDateString()}`;
}

export function PairedComputers() {
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setWorkers(await workersService.getMyWorkers());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load your paired computers.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRemove = async (worker: Worker) => {
    if (confirming !== worker.id) {
      setConfirming(worker.id);
      return;
    }
    setConfirming(null);
    setRemovingId(worker.id);
    setRemoveError(null);
    setNote(null);
    try {
      await workersService.deleteWorker(worker.id);
      setWorkers((ws) => (ws ?? []).filter((w) => w.id !== worker.id));
      setNote(`Removed ${worker.name}. It can no longer run exports or transcriptions for you.`);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Couldn't remove that computer. Try again.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sand-200 bg-white p-6">
        <p className="text-[14px] leading-relaxed text-sand-800 max-w-[52ch]">
          Pair this computer to run overlay exports and transcriptions on it instead of in the
          browser. A paired computer stays connected until you remove it below.
        </p>
        <div className="mt-4">
          <ConnectComputer onConnected={() => void load()} />
        </div>
      </div>

      <div className="rounded-xl border border-sand-200 bg-white p-6">
        <h3 className="font-sora text-[13px] font-bold text-ink">Your paired computers</h3>
        {workers === null && !loadError ? (
          <p className="mt-3 text-[13px] text-sand-700">Loading your paired computers…</p>
        ) : loadError ? (
          <p role="alert" className="mt-3 text-[13px] text-obsidian">
            {loadError}{" "}
            <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </p>
        ) : workers!.length === 0 ? (
          <p className="mt-3 text-[13px] text-sand-700">No computers paired yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {workers!.map((worker) => (
              <li key={worker.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{worker.name}</span>
                  <span className="block text-[12px] text-sand-600">
                    {worker.status === "online" ? "Online" : "Offline"} · {formatLastSeen(worker.lastSeenAt)}
                  </span>
                  {worker.lastError ? <span className="block text-[12px] text-orange-accent">{worker.lastError}</span> : null}
                </span>
                {confirming === worker.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] text-sand-700">Remove {worker.name}?</span>
                    <button
                      type="button"
                      onClick={() => void onRemove(worker)}
                      disabled={removingId === worker.id}
                      className="rounded-full border border-sand-300 px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-60"
                    >
                      {removingId === worker.id ? "Removing…" : "Yes, remove"}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-sand-800">
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onRemove(worker)}
                    disabled={removingId === worker.id}
                    className="rounded-full border border-sand-300 px-3 py-1.5 text-[12px] font-semibold text-sand-800 transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {note ? <p role="status" className="mt-3 text-[12px] text-sand-700">{note}</p> : null}
        {removeError ? <p role="alert" className="mt-3 text-[12px] text-obsidian">{removeError}</p> : null}
      </div>
    </div>
  );
}
