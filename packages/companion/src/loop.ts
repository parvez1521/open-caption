import { exportMemoryErrorMessage } from "@capseasy/shared";
import { ApiError, CompanionApi, type ClaimedJob } from "./api";
import type { Config } from "./config";
import { runProxy } from "./executors/proxy";
import { runRender } from "./executors/render";
import { runTranscribe } from "./executors/transcribe";
import type { JobContext } from "./executors/context";
import { log } from "./log";
import { buildCapabilities, VERSION } from "./system";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

interface Active {
  id: string;
  controller: AbortController;
  reason: "cancelled" | "lease" | null;
}

/** Errors that will fail identically on retry: tell the server not to burn attempts on them. */
function classify(e: unknown): { code: string; retryable: boolean; message: string } {
  const message = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  if (code === "NO_AUDIO") return { code, retryable: false, message };
  if (code === "ENOSPC" || /no space left/i.test(message)) return { code: "DISK_FULL", retryable: false, message: "Your computer is out of disk space. Free some space and retry." };
  // memory failures (2K/4K renders on a modest machine) get plain words + the fix, and no retry at the same size
  const oom = exportMemoryErrorMessage(e);
  if (oom) return { code: "OUT_OF_MEMORY", retryable: false, message: oom };
  if (/Unsupported|Invalid data found|moov atom not found|could not find codec/i.test(message)) return { code: "BAD_MEDIA", retryable: false, message: `The video could not be read: ${message.slice(0, 300)}` };
  return { code: code && typeof code === "string" ? code : "WORKER_ERROR", retryable: true, message };
}

export async function runCompanion(cfg: Config, opts: { once?: boolean; signal?: AbortSignal } = {}) {
  if (!cfg.token) throw new Error("This computer is not paired yet. Run: capseasy login");
  const api = new CompanionApi(cfg.apiBase, cfg.token);
  let active: Active | null = null;
  let stopped = false;
  let refuseJobs = false;
  // Idle costs nothing but a heartbeat every ~90 s: the server says when there's a job to take (hasWork) and when to
  // call again (pollHintMs). Only then is the claim route called. Checked once at start-up.
  let hasWork = true;
  let nextBeatMs = 15_000;

  const stop = (why: string) => {
    if (!stopped) log.error(why);
    stopped = true;
  };
  opts.signal?.addEventListener("abort", () => (stopped = true), { once: true });

  const heartbeat = async () => {
    try {
      const hb = await api.heartbeat({ version: VERSION, platform: process.platform, capabilities: await buildCapabilities(), currentJobId: active?.id ?? null });
      if (hb) {
        if (typeof hb.hasWork === "boolean") hasWork = hasWork || hb.hasWork;
        nextBeatMs = Math.min(120_000, Math.max(1_000, hb.pollHintMs || 15_000));
        if (cmp(VERSION, hb.minVersion) < 0) {
          if (!refuseJobs) log.error(`This companion (${VERSION}) is older than the required ${hb.minVersion}. Update it, then restart.`);
          refuseJobs = true;
        }
        if (active && hb.cancelJobIds.includes(active.id)) {
          active.reason = "cancelled";
          active.controller.abort();
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) stop("This computer's access was revoked. Pair it again with: capseasy login");
      else log.warn(`heartbeat failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const execute = async (claimed: ClaimedJob) => {
    const a: Active = { id: claimed.job.id, controller: new AbortController(), reason: null };
    active = a;
    let lastSent = 0;
    let lastStage = "Starting";
    let lastPercent = 0;
    // sends progress AND renews the server-side lease; cancellation/lease loss abort the signal instead of throwing
    const send = async (stage: string, percent: number, message?: string) => {
      try {
        const r = await api.progress(claimed.job.id, stage, percent, message);
        if (r?.cancelRequested && !a.reason) {
          a.reason = "cancelled";
          a.controller.abort();
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === "LEASE_LOST" && !a.reason) {
          a.reason = "lease";
          a.controller.abort();
        }
      }
    };
    const ctx: JobContext = {
      api,
      cfg,
      claimed,
      signal: a.controller.signal,
      report: async (stage, percent, message) => {
        const now = Date.now();
        const changed = stage !== lastStage;
        lastStage = stage;
        lastPercent = percent;
        if (!changed && now - lastSent < 1000) return;
        lastSent = now;
        await send(stage, percent, message);
      },
    };
    // long silent steps (first-run browser/model downloads) must not let the 90 s lease expire
    const keepalive = setInterval(() => {
      if (!a.controller.signal.aborted) void send(lastStage, lastPercent);
    }, 20_000);
    log.info(`job ${claimed.job.id.slice(0, 8)} ${claimed.job.kind} started (attempt ${claimed.job.attempts})`);
    try {
      if (claimed.job.kind === "transcribe") await runTranscribe(ctx);
      else if (claimed.job.kind === "render") await runRender(ctx);
      else if (claimed.job.kind === "proxy") await runProxy(ctx);
      else throw Object.assign(new Error(`Unsupported job kind: ${claimed.job.kind}`), { code: "UNSUPPORTED", retryable: false });
      log.info(`job ${claimed.job.id.slice(0, 8)} completed`);
    } catch (e) {
      if (a.reason === "lease") {
        log.warn(`job ${claimed.job.id.slice(0, 8)}: lease lost, dropping work`);
      } else if (a.reason === "cancelled" || a.controller.signal.aborted) {
        log.info(`job ${claimed.job.id.slice(0, 8)} cancelled`);
        await api.fail(claimed.job.id, "CANCELLED", "Cancelled", false).catch(() => undefined);
      } else {
        const c = classify(e);
        log.error(`job ${claimed.job.id.slice(0, 8)} failed: ${c.message}`);
        await api.fail(claimed.job.id, c.code, c.message, c.retryable).catch((err) => log.error(`could not report failure: ${err instanceof Error ? err.message : err}`));
      }
    } finally {
      clearInterval(keepalive);
      active = null;
    }
  };

  log.info(`companion ${VERSION} online (${cfg.apiBase})`);
  await heartbeat();
  let hbTimer: ReturnType<typeof setTimeout> | null = null;
  const beat = () => {
    hbTimer = setTimeout(async () => {
      await heartbeat();
      if (!stopped) beat();
    }, nextBeatMs + Math.random() * 1000);
  };
  beat();

  try {
    while (!stopped) {
      // `--once` (tests, scripts) long-polls so the job is picked up within a second
      if (!active && !refuseJobs && (hasWork || opts.once)) {
        try {
          const claimed = await api.claim(["transcribe", "render", "proxy"], opts.once ? 20_000 : 0);
          if (claimed) {
            await execute(claimed);
            if (opts.once) break;
            continue; // there may be more: try again straight away
          }
          hasWork = false;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) stop("This computer's access was revoked. Pair it again with: capseasy login");
          else log.warn(`claim failed: ${e instanceof Error ? e.message : e}`);
        }
      }
      // a local pause (no network): the heartbeat flips hasWork when a job is queued
      await sleep(refuseJobs ? 15_000 : opts.once ? 250 + Math.random() * 250 : 500);
    }
  } finally {
    if (hbTimer) clearTimeout(hbTimer);
    if (active) {
      (active as Active).reason = "cancelled";
      (active as Active).controller.abort();
    }
  }
}
