"use client";

import { useEffect, useRef } from "react";
import type { EditorComposition } from "./compositionDoc";
import { buildMixPlan, type MixPlan } from "./audio/mixPlan";
import { decodeAudioRange } from "./audio/decode";
import { applyCleanup, generateImpulse } from "./audio/dsp";
import { MIX_HOP_MS, combineVoicePeaks, duckEnvelope, fadeGainAt, peaksFromChannels } from "./audio/mixMath";

/**
 * Preview audio for the audio studio (Phase 4 Run 3, slice 4.8).
 *
 * SYNC MODEL (honest): this hook is NOT sample-locked to the Remotion
 * Player. The Player owns the picture and its own clock; this hook starts a
 * Web Audio graph when playback starts, positioned from `getPlayerMs()`,
 * and RESTARTS the graph when playback stops/starts or when a seek is
 * detected (the throttled `timeMs` feed lands more than 250 ms away from
 * where the graph's own clock says the playhead should be). Between
 * restarts the two clocks drift by at most their own rate difference, and
 * the next play/seek re-aligns them. That is the trade made for a preview
 * that never blocks or breaks the picture: every failure here (no
 * AudioContext, an asset that will not decode) is a silent no-op — the
 * video keeps playing, just without the mixed sound — and nothing in this
 * file ever throws into StudioPage.
 *
 * The mix itself is not re-invented here: the plan comes from W2's
 * buildMixPlan, fades/ducks come from mixMath, cleanup is baked into the
 * per-item PCM with dsp.applyCleanup, and the graph (EQ biquads, generated-
 * impulse convolver reverb, master gain + compressor) only plays that plan
 * through live nodes. KNOWN PREVIEW/EXPORT DIFFERENCE: reverb is wired as
 * dry gain 1 + a parallel wet gain of `reverb` (the coordinator aligns the
 * dry/wet split with the export mixdown's choice at merge if it differs).
 */

/** The plan-item shape this hook reads. W2's MixItem is cast through this
 *  local view so the preview tolerates the plan's field spellings (volume
 *  vs gain, rate vs playbackRate, …) instead of inventing its own plan. */
interface ItemLike {
  id?: string;
  kind?: string;
  role?: string;
  assetId?: string | null;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  sourceInMs?: number;
  sourceOutMs?: number;
  volume?: number;
  gain?: number;
  baseGain?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  rate?: number;
  playbackRate?: number;
  muted?: boolean;
  isVoice?: boolean;
  ducking?: { enabled?: boolean; amountDb?: number; thresholdDb?: number } | null;
  processors?: {
    eq?: { lowDb?: number; midDb?: number; highDb?: number };
    cleanup?: { enabled?: boolean; highPassHz?: number; gateDb?: number };
    reverb?: number;
  } | null;
  eq?: { lowDb?: number; midDb?: number; highDb?: number };
  cleanup?: { enabled?: boolean; highPassHz?: number; gateDb?: number };
  reverb?: number;
}

type Pcm = { channels: [Float32Array, Float32Array]; sampleRate: number };

const itemStart = (it: ItemLike) => Math.max(0, it.startMs ?? 0);
const itemRate = (it: ItemLike) => Math.max(0.05, it.rate ?? it.playbackRate ?? 1);
const itemDuration = (it: ItemLike) => {
  if (it.durationMs && it.durationMs > 0) return it.durationMs;
  if (it.endMs !== undefined) return Math.max(0, it.endMs - itemStart(it));
  if (it.sourceInMs !== undefined && it.sourceOutMs !== undefined) return (it.sourceOutMs - it.sourceInMs) / itemRate(it);
  return 0;
};
const itemGain = (it: ItemLike) => it.baseGain ?? it.gain ?? it.volume ?? 1;
const itemProcessors = (it: ItemLike) => ({
  eq: it.processors?.eq ?? it.eq ?? { lowDb: 0, midDb: 0, highDb: 0 },
  cleanup: it.processors?.cleanup ?? it.cleanup ?? { enabled: false, highPassHz: 80, gateDb: -50 },
  reverb: it.processors?.reverb ?? it.reverb ?? 0,
});
const isVoiceItem = (it: ItemLike) => Boolean(it.isVoice) || it.kind === "video" || it.role === "voice";

export interface UseAudioPreviewOpts {
  active: boolean;
  comp: EditorComposition | null;
  playing: boolean;
  timeMs: number;
  getPlayerMs: () => number;
  getBlob: (assetId: string | null) => Promise<Blob | null>;
}

export function useAudioPreview(opts: UseAudioPreviewOpts): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const ctxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  /** generation token: bumping it cancels any in-flight start and any live graph */
  const runGenRef = useRef(0);
  /** graph clock anchor: ctx.currentTime / playhead position at graph start */
  const anchorRef = useRef<{ ctxAt: number; posMs: number } | null>(null);
  /** decoded (raw) PCM per asset+range; baked (cleanup-applied) PCM per item signature */
  const rawCacheRef = useRef(new Map<string, Promise<Pcm | null>>());
  const bakedCacheRef = useRef(new Map<string, Pcm>());
  const startRef = useRef<((posMs: number) => Promise<void>) | null>(null);

  const planSig = (() => {
    if (!opts.active || !opts.comp) return "";
    try { return JSON.stringify(buildMixPlan(opts.comp, opts.comp.durationMs)); } catch { return ""; }
  })();

  useEffect(() => { bakedCacheRef.current.clear(); }, [planSig]);

  useEffect(() => {
    const stopGraph = () => {
      for (const s of sourcesRef.current) { try { s.stop(); } catch { /* already stopped */ } try { s.disconnect(); } catch { /* noop */ } }
      sourcesRef.current = [];
      anchorRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) void ctx.close().catch(() => undefined);
    };
    const teardown = () => { runGenRef.current += 1; stopGraph(); };

    if (!opts.active || !opts.comp || !opts.playing) { teardown(); return teardown; }

    const loadBaked = async (it: ItemLike): Promise<Pcm | null> => {
      const proc = itemProcessors(it);
      const key = JSON.stringify([it.assetId ?? null, it.sourceInMs ?? null, it.sourceOutMs ?? null, proc.cleanup]);
      const hit = bakedCacheRef.current.get(key);
      if (hit) return hit;
      const rawKey = JSON.stringify([it.assetId ?? null, it.sourceInMs ?? null, it.sourceOutMs ?? null]);
      let rawPromise = rawCacheRef.current.get(rawKey);
      if (!rawPromise) {
        rawPromise = (async () => {
          try {
            const blob = await optsRef.current.getBlob(it.assetId ?? null);
            if (!blob) return null;
            const range = it.sourceInMs !== undefined && it.sourceOutMs !== undefined ? { startMs: it.sourceInMs, endMs: it.sourceOutMs } : null;
            return await decodeAudioRange(blob, range);
          } catch { return null; }
        })();
        rawCacheRef.current.set(rawKey, rawPromise);
      }
      const raw = await rawPromise;
      if (!raw) return null;
      const baked: Pcm = { channels: [new Float32Array(raw.channels[0]), new Float32Array(raw.channels[1])], sampleRate: raw.sampleRate };
      try {
        if (proc.cleanup.enabled) applyCleanup(baked.channels as unknown as Float32Array[], baked.sampleRate, { enabled: true, highPassHz: proc.cleanup.highPassHz ?? 80, gateDb: proc.cleanup.gateDb ?? -50 });
      } catch { /* cleanup is best-effort in preview */ }
      bakedCacheRef.current.set(key, baked);
      return baked;
    };

    const start = async (posMs: number) => {
      const myGen = ++runGenRef.current;
      const alive = () => runGenRef.current === myGen && optsRef.current.playing && optsRef.current.active;
      const comp = optsRef.current.comp;
      if (!comp) return;
      let plan: MixPlan;
      try { plan = buildMixPlan(comp, comp.durationMs); } catch { return; }
      const items = (plan.items as unknown as ItemLike[]).filter((it) => !it.muted && itemDuration(it) > 0);
      if (items.length === 0) return;

      const baked = new Map<ItemLike, Pcm>();
      await Promise.all(items.map(async (it) => { const pcm = await loadBaked(it); if (pcm) baked.set(it, pcm); }));
      if (!alive() || baked.size === 0) return;

      // combined voice peaks over the whole plan (timeline hops), for ducking
      const totalHops = Math.max(1, Math.ceil(plan.durationMs / MIX_HOP_MS));
      const voiceArrays: Float32Array[] = [];
      for (const it of items) {
        if (!isVoiceItem(it)) continue;
        const pcm = baked.get(it);
        if (!pcm) continue;
        try {
          const peaks = peaksFromChannels(pcm.channels, pcm.sampleRate, MIX_HOP_MS);
          const aligned = new Float32Array(totalHops);
          const rate = itemRate(it);
          const startHop = Math.floor(itemStart(it) / MIX_HOP_MS);
          for (let i = 0; i < peaks.length; i++) {
            const h = startHop + Math.floor(i / rate);
            if (h >= 0 && h < totalHops) aligned[h] = Math.max(aligned[h]!, peaks[i]!);
          }
          voiceArrays.push(aligned);
        } catch { /* ducking degrades to no ducking */ }
      }
      const voicePeaks = voiceArrays.length ? combineVoicePeaks(voiceArrays, totalHops) : new Float32Array(totalHops);

      const AC = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
      if (!AC) return;
      let ctx: AudioContext;
      try { ctx = new AC(); } catch { return; }
      if (!alive()) { void ctx.close().catch(() => undefined); return; }
      stopGraph(); // any previous graph (a seek restart) goes away before this one starts
      ctxRef.current = ctx;

      try {
        const masterGain = ctx.createGain();
        masterGain.gain.value = plan.master?.volume ?? comp.audioMaster.volume;
        let tail: AudioNode = masterGain;
        const compCfg = plan.master?.compressor ?? comp.audioMaster.compressor;
        if (compCfg?.enabled) {
          const dyn = ctx.createDynamicsCompressor();
          dyn.threshold.value = compCfg.thresholdDb;
          dyn.ratio.value = compCfg.ratio;
          dyn.knee.value = compCfg.kneeDb;
          dyn.attack.value = compCfg.attackMs / 1000;
          dyn.release.value = compCfg.releaseMs / 1000;
          masterGain.connect(dyn);
          tail = dyn;
        }
        tail.connect(ctx.destination);

        const t0 = ctx.currentTime + 0.05;
        anchorRef.current = { ctxAt: t0, posMs };
        const sources: AudioBufferSourceNode[] = [];

        for (const it of items) {
          const pcm = baked.get(it);
          if (!pcm) continue;
          const startMs = itemStart(it);
          const durMs = itemDuration(it);
          if (startMs + durMs <= posMs) continue;
          const rate = itemRate(it);
          const buffer = ctx.createBuffer(2, Math.max(1, pcm.channels[0].length), pcm.sampleRate);
          buffer.copyToChannel(pcm.channels[0] as Float32Array<ArrayBuffer>, 0);
          buffer.copyToChannel(pcm.channels[1] as Float32Array<ArrayBuffer>, 1);
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.playbackRate.value = rate;

          const proc = itemProcessors(it);
          let head: AudioNode = src;
          const bands: Array<[BiquadFilterType, number, number]> = [
            ["lowshelf", 200, proc.eq.lowDb ?? 0],
            ["peaking", 1000, proc.eq.midDb ?? 0],
            ["highshelf", 4000, proc.eq.highDb ?? 0],
          ];
          for (const [type, freq, db] of bands) {
            if (!db) continue;
            const f = ctx.createBiquadFilter();
            f.type = type; f.frequency.value = freq; f.gain.value = db;
            if (type === "peaking") f.Q.value = 1;
            head.connect(f); head = f;
          }

          // gain envelope: baseGain × fade × duck, sampled at hop resolution
          const gainNode = ctx.createGain();
          const skipMs = Math.max(0, posMs - startMs);
          const remainMs = durMs - skipMs;
          let envelope: Float32Array | null = null;
          if (it.ducking?.enabled) {
            try { envelope = duckEnvelope(voicePeaks, { thresholdDb: it.ducking.thresholdDb ?? -42, amountDb: it.ducking.amountDb ?? 12 }, MIX_HOP_MS); } catch { envelope = null; }
          }
          const steps = Math.max(2, Math.ceil(remainMs / MIX_HOP_MS) + 1);
          const curve = new Float32Array(steps);
          const base = itemGain(it);
          for (let i = 0; i < steps; i++) {
            const localMs = skipMs + i * MIX_HOP_MS;
            let g = base;
            try { g *= fadeGainAt({ volume: 1, fadeInMs: it.fadeInMs ?? 0, fadeOutMs: it.fadeOutMs ?? 0 }, localMs, durMs); } catch { /* keep base */ }
            if (envelope) {
              const hop = Math.floor((startMs + localMs) / MIX_HOP_MS);
              g *= envelope[Math.min(hop, envelope.length - 1)] ?? 1;
            }
            curve[i] = Math.max(0, g);
          }
          const when = t0 + Math.max(0, (startMs - posMs) / 1000);
          try { gainNode.gain.setValueCurveAtTime(curve, when, Math.max(0.01, remainMs / 1000)); }
          catch { gainNode.gain.value = base; }
          head.connect(gainNode);
          gainNode.connect(masterGain); // dry path (gain 1)

          if (proc.reverb > 0) {
            try {
              const impulse = generateImpulse(ctx.sampleRate);
              const conv = ctx.createConvolver();
              const ibuf = ctx.createBuffer(2, Math.max(1, impulse[0].length), ctx.sampleRate);
              ibuf.copyToChannel(impulse[0] as Float32Array<ArrayBuffer>, 0);
              ibuf.copyToChannel(impulse[1] as Float32Array<ArrayBuffer>, 1);
              conv.buffer = ibuf;
              const wet = ctx.createGain();
              wet.gain.value = proc.reverb;
              gainNode.connect(conv); conv.connect(wet); wet.connect(masterGain);
            } catch { /* dry path already connected */ }
          }

          const offsetSec = (skipMs * rate) / 1000;
          try { src.start(when, Math.min(offsetSec, Math.max(0, buffer.duration - 0.01))); sources.push(src); }
          catch { /* item skipped */ }
        }
        sourcesRef.current = sources;
        void ctx.resume().catch(() => undefined);
      } catch {
        if (ctxRef.current === ctx) ctxRef.current = null;
        try { void ctx.close().catch(() => undefined); } catch { /* noop */ }
      }
    };

    startRef.current = start;
    void start(optsRef.current.getPlayerMs());
    return () => { startRef.current = null; teardown(); };
    // planSig is the plan-change trigger; playing/active gate the whole effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active, opts.playing, opts.comp, planSig]);

  // seek detection: while playing, if the throttled time feed disagrees with the
  // graph's expected position by more than 250 ms, restart the graph there.
  const lastSeekCheckRef = useRef(0);
  useEffect(() => {
    if (!opts.playing || !opts.active) return;
    const anchor = anchorRef.current;
    const ctx = ctxRef.current;
    if (!anchor || !ctx || !startRef.current) return;
    const now = performance.now();
    if (now - lastSeekCheckRef.current < 100) return;
    lastSeekCheckRef.current = now;
    const expected = anchor.posMs + (ctx.currentTime - anchor.ctxAt) * 1000;
    if (Math.abs(opts.timeMs - expected) <= 250) return;
    void startRef.current(opts.timeMs);
  }, [opts.timeMs, opts.playing, opts.active]);

  // full teardown on unmount
  useEffect(() => () => {
    runGenRef.current += 1;
    for (const s of sourcesRef.current) { try { s.stop(); } catch { /* noop */ } }
    sourcesRef.current = [];
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }, []);
}
