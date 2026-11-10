import { describe, expect, it } from "vitest";
import { AudioSample, AudioSampleSource, BufferTarget, Output, WavOutputFormat } from "mediabunny";
import {
  RNNOISE_PCM_SCALE,
  denoiseChannels,
  loadRnnoiseFactory,
  makeNoiseSuppressedWav,
  processChannelFrames,
  type DenoiseFrameProcessor,
} from "../audio/denoise";
import { decodeAudioRange } from "../audio/decode";
import { rms } from "../audio/dsp";

/**
 * A12 denoise tests. Two layers, honestly separated:
 * 1. PIPELINE tests with an injected processor — framing, the ×32768 scaling
 *    RNNoise expects, one state per channel, the <1-frame tail rule, and the
 *    full decode → process → WAV derived-asset round trip.
 * 2. A REAL-WASM measurement: white noise through the actual
 *    @shiguredo/rnnoise-wasm build must collapse. (Speech preservation was
 *    measured in the adoption spike on a REAL human recording — RMS ratio
 *    0.97 — and is documented in denoise.ts; synthetic tones are not
 *    recognised as speech by RNNoise's VAD, so no synthetic fixture is
 *    used to fake that number here.)
 */

const SR = 48000;

/** A fake processor: records the scaled frames it saw, returns them halved. */
function fakeProcessor(frameSize = 480) {
  const seen: Float32Array[] = [];
  let destroyed = false;
  const processor: DenoiseFrameProcessor = {
    frameSize,
    processFrame(frame) {
      seen.push(frame.slice());
      for (let i = 0; i < frame.length; i++) frame[i] = frame[i]! / 2;
      return 0.5;
    },
    destroy() { destroyed = true; },
  };
  return { processor, seen, wasDestroyed: () => destroyed };
}

describe("processChannelFrames — framing + scaling", () => {
  it("feeds the processor 16-bit-scaled full frames and scales the result back", () => {
    const fake = fakeProcessor(4);
    const input = new Float32Array([0.5, -0.25, 1, 0, 0.2, 0.2, 0.2, 0.2]);
    const out = processChannelFrames(input, fake.processor);
    expect(fake.seen).toHaveLength(2);
    expect(fake.seen[0]![0]).toBeCloseTo(0.5 * RNNOISE_PCM_SCALE, 3);
    expect(out[0]).toBeCloseTo(0.25, 6); // halved by the fake
    expect(input[0]).toBe(0.5); // input untouched
  });

  it("passes the sub-frame tail through unchanged (documented <10 ms rule)", () => {
    const fake = fakeProcessor(480);
    const input = new Float32Array(500).fill(0.4);
    const out = processChannelFrames(input, fake.processor);
    expect(fake.seen).toHaveLength(1);
    expect(out[479]).toBeCloseTo(0.2, 6); // processed frame
    expect(out[480]).toBe(input[480]); // tail: untouched, bit-identical to the input
    expect(out[499]).toBe(input[499]);
  });
});

describe("denoiseChannels — one state per channel", () => {
  it("creates and destroys a separate processor per channel", async () => {
    const fakes = [fakeProcessor(4), fakeProcessor(4)];
    let calls = 0;
    const out = await denoiseChannels(
      [new Float32Array([1, 1, 1, 1]), new Float32Array([0.5, 0.5, 0.5, 0.5])],
      () => Promise.resolve(fakes[calls++]!.processor),
    );
    expect(calls).toBe(2);
    expect(fakes.every((f) => f.wasDestroyed())).toBe(true);
    expect(out[0][0]).toBeCloseTo(0.5, 6);
    expect(out[1][0]).toBeCloseTo(0.25, 6);
  });
});

describe("makeNoiseSuppressedWav — the derived-asset pipeline end to end", () => {
  it("decodes a WAV, processes it and returns a WAV whose samples are the processed ones", async () => {
    // build a 0.5 s WAV of a 0.4 DC-ish tone with Mediabunny (same fixture style as audio-mixdown.test.ts)
    const n = Math.round(0.5 * SR);
    const data = new Float32Array(n * 2).fill(0.4);
    const target = new BufferTarget();
    const output = new Output({ format: new WavOutputFormat(), target });
    const source = new AudioSampleSource({ codec: "pcm-s16" });
    output.addAudioTrack(source);
    await output.start();
    const sample = new AudioSample({
      data: data.buffer as ArrayBuffer, format: "f32-planar", numberOfChannels: 2, sampleRate: SR, timestamp: 0,
    });
    await source.add(sample);
    sample.close();
    await output.finalize();
    const srcBlob = new Blob([target.buffer!], { type: "audio/wav" });

    const fake = fakeProcessor(480);
    const wav = await makeNoiseSuppressedWav(srcBlob, () => Promise.resolve(fake.processor));
    expect(wav).not.toBeNull();
    expect(wav!.type).toBe("audio/wav");
    const decoded = await decodeAudioRange(wav!, null);
    expect(decoded).not.toBeNull();
    // halved by the fake processor (s16 quantisation → loose tolerance)
    expect(rms(decoded!.channels[0])).toBeGreaterThan(0.17);
    expect(rms(decoded!.channels[0])).toBeLessThan(0.23);
  });

  it("returns null for a blob with no audio track (caller stores nothing)", async () => {
    const fake = fakeProcessor(480);
    await expect(
      makeNoiseSuppressedWav(new Blob(["not media"], { type: "text/plain" }), () => Promise.resolve(fake.processor)),
    ).resolves.toBeNull();
  });
});

describe("REAL RNNoise WASM — measured suppression", () => {
  it("white noise collapses: output RMS < 5% of input (spike measured 0.3%)", async () => {
    const factory = await loadRnnoiseFactory();
    // deterministic white noise, RMS ≈ 0.144
    let s = 987654321;
    const noise = new Float32Array(2 * SR);
    for (let i = 0; i < noise.length; i++) {
      s = (Math.imul(s, 1103515245) + 12345) | 0;
      noise[i] = (((s >>> 0) / 4294967296) * 2 - 1) * 0.25;
    }
    const [out] = await denoiseChannels([noise, noise.slice()], factory);
    // measure the last 60% (after the RNN has adapted)
    const tailIn = rms(noise.subarray(Math.floor(noise.length * 0.4)));
    const tailOut = rms(out.subarray(Math.floor(out.length * 0.4)));
    expect(tailIn).toBeGreaterThan(0.1);
    expect(tailOut / tailIn).toBeLessThan(0.05);
  }, 90_000);
});
