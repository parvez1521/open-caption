import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 W2, quirk (b): a clip that plays fine showed "Waveform unavailable for this file".
 * useWaveform's only decode path was WebAudio's decodeAudioData, which demuxes the whole
 * container and rejects playable files whose VIDEO track it cannot handle (e.g. HEVC in an
 * MP4) even though the audio track is fine. The fix: on WebAudio failure, fall back to the
 * Mediabunny audio decoder the mix already uses (audio/decode.ts decodeAudioPeaks), which
 * decodes only the audio track. These tests pin: WebAudio failure + Mediabunny success →
 * ready with normalised peaks; both failing → unavailable; oversize → unavailable, no fetch.
 */

const { decodeAudioPeaks } = vi.hoisted(() => ({ decodeAudioPeaks: vi.fn() }));
vi.mock("../audio/decode", () => ({ decodeAudioPeaks }));

import { useWaveform } from "../useWaveform";

const fetchMock = vi.fn(async () => ({ blob: async () => new Blob(["fake-media"]) }));

afterEach(() => {
  vi.unstubAllGlobals();
  decodeAudioPeaks.mockReset();
  fetchMock.mockClear();
});

describe("useWaveform (quirk b)", () => {
  it("WebAudio cannot decode the container, Mediabunny can: peaks become ready, normalised", async () => {
    // jsdom has no AudioContext: the WebAudio path fails exactly as it does for a container
    // decodeAudioData refuses — the fallback must carry the result.
    vi.stubGlobal("fetch", fetchMock);
    decodeAudioPeaks.mockResolvedValue(new Float32Array([0.25, 0.5, 0.1]));
    const { result } = renderHook(() => useWaveform("wf-fallback-ok", "blob:clip", 1024));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(decodeAudioPeaks).toHaveBeenCalledWith(expect.any(Blob), 20);
    const got = [...result.current.peaks!];
    expect(got[0]).toBeCloseTo(0.5);
    expect(got[1]).toBeCloseTo(1);
    expect(got[2]).toBeCloseTo(0.2);
  });

  it("both decoders fail: state is unavailable (the honest remainder)", async () => {
    vi.stubGlobal("fetch", fetchMock);
    decodeAudioPeaks.mockResolvedValue(null);
    const { result } = renderHook(() => useWaveform("wf-both-fail", "blob:clip", 1024));
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    expect(result.current.peaks).toBeNull();
  });

  it("a file over the size cap never fetches or decodes", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWaveform("wf-too-big", "blob:clip", 301 * 1024 * 1024));
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(decodeAudioPeaks).not.toHaveBeenCalled();
  });
});
