/**
 * Local-worker pairing + management. Source: apps/backend/app/api/v1/
 * workers.py, pairing_public.py — cloud processing is paused (see
 * DEPLOYMENT.md); AI pipeline/render jobs run on a user's own paired
 * computer instead. Mirrors the projects.ts service pattern exactly.
 */

import { apiClient, ApiError } from "./api-client";

export interface Worker {
  id: string;
  name: string;
  status: "online" | "offline";
  lastSeenAt: string | null;
  lastError: string | null;
}

interface BackendWorker {
  id: string;
  name: string;
  status: string;
  lastSeenAt: string | null;
  lastError: string | null;
}

function toWorker(w: BackendWorker): Worker {
  return {
    id: w.id,
    name: w.name,
    status: w.status === "online" ? "online" : "offline",
    lastSeenAt: w.lastSeenAt,
    lastError: w.lastError,
  };
}

export interface PairingDetails {
  code: string;
  workerName: string;
  platform: string | null;
  status: "pending" | "approved" | "denied" | "consumed" | "expired";
}

export const workersService = {
  async getMyWorkers(): Promise<Worker[]> {
    const workers = await apiClient.get<BackendWorker[]>("/workers");
    return workers.map(toWorker);
  },

  /**
   * Is the desktop helper switched on for this deployment? Returns null when
   * the check itself fails — callers fall back to offering the button, and the
   * setup POST still reports the real error. (Overnight QA follow-up: the
   * Settings pairing button is a dead end while COMPANIONS_ENABLED is off.)
   */
  async getCompanionStatus(): Promise<boolean | null> {
    try {
      const d = await apiClient.get<{ companionsEnabled: boolean }>("/device/status");
      return d.companionsEnabled === true;
    } catch {
      return null;
    }
  },

  async deleteWorker(id: string): Promise<void> {
    await apiClient.delete(`/workers/${id}`);
  },

  /** Device-code flow: the companion printed this code in the user's terminal. */
  async getPairingDetails(code: string): Promise<PairingDetails | null> {
    try {
      const d = await apiClient.get<{ userCode: string; workerName: string | null; platform: string | null; status: PairingDetails["status"] }>(
        `/device/approve?code=${encodeURIComponent(code)}`,
      );
      return { code: d.userCode, workerName: d.workerName ?? "A computer", platform: d.platform, status: d.status };
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_FOUND") return null;
      throw err;
    }
  },

  async confirmPairing(code: string): Promise<void> {
    await apiClient.post("/device/approve", { json: { userCode: code, approve: true } });
  },

  async denyPairing(code: string): Promise<void> {
    await apiClient.post("/device/approve", { json: { userCode: code, approve: false } });
  },
};
