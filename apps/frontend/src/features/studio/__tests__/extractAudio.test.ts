import { describe, expect, it } from "vitest";
import { AudioSample, AudioSampleSource, BufferTarget, Output, WavOutputFormat } from "mediabunny";
import { extractAudioWav, extractedAudioName } from "../audio/extract";
import { decodeAudioRange } from "../audio/decode";
import { rms } from "../audio/dsp";

/**
 * Package 4 item J1 — extract audio, end to end.
 *
 * Fixture note: the fixture carrier is a WAV built with Mediabunny (the same style
 * as denoise.test.ts / audio-mixdown.test.ts) because this environment has no video
 * encoder. The extraction path itself is format-agnostic — Input/BlobSource →
 * primary audio track → PCM → WAV — so a video file's audio track takes exactly
 * the code path exercised here; only the container differs.
 */
const SR = 48000;

async function fixtureWav(seconds: number): Promise<Blob> {
  const n = Math.round(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR);
    right[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR);
  }
  const planar = new Float32Array(n * 2);
  planar.set(left, 0);
  planar.set(right, n);
  const target = new BufferTarget();
  const output = new Output({ format: new WavOutputFormat(), target });
  const source = new AudioSampleSource({ codec: "pcm-s16" });
  output.addAudioTrack(source);
  await output.start();
  const sample = new AudioSample({
    data: planar.buffer as ArrayBuffer, format: "f32-planar", numberOfChannels: 2, sampleRate: SR, timestamp: 0,
  });
  await source.add(sample);
  sample.close();
  await output.finalize();
  return new Blob([target.buffer!], { type: "audio/wav" });
}

describe("extractAudioWav (J1)", () => {
  it("extracts a decodable WAV whose duration matches the source (±60 ms) with both channels alive", async () => {
    const src = await fixtureWav(0.75);
    const out = await extractAudioWav(src);
    expect(out).not.toBeNull();
    expect(out!.blob.type).toBe("audio/wav");
    expect(Math.abs(out!.durationMs - 750)).toBeLessThanOrEqual(60);

    const decoded = await decodeAudioRange(out!.blob, null);
    expect(decoded).not.toBeNull();
    const decodedMs = (decoded!.channels[0].length / decoded!.sampleRate) * 1000;
    expect(Math.abs(decodedMs - 750)).toBeLessThanOrEqual(60);
    expect(rms(decoded!.channels[0])).toBeGreaterThan(0.2); // the 440 Hz tone survived
    expect(rms(decoded!.channels[1])).toBeGreaterThan(0.1); // the 220 Hz tone survived
  });

  it("returns null for a blob with no audio track (nothing is faked)", async () => {
    const out = await extractAudioWav(new Blob(["not media at all"], { type: "text/plain" }));
    expect(out).toBeNull();
  });

  it("names the file from the source name", () => {
    expect(extractedAudioName("Podcast Ep 12.mp4")).toBe("Podcast Ep 12 — audio.wav");
    expect(extractedAudioName("")).toBe("Extracted audio.wav");
  });
});
