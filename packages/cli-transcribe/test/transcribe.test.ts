import { describe, expect, it } from "vitest";
import { wavToFloat } from "../../cli/src/node/media";
import { MODELS, transcribe } from "../src/transcribe";

/** a tiny 16-bit PCM WAV, as Remotion's ffmpeg pipes it (placeholder data size) */
function wav(samples: number[], placeholder = true) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2));
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); // PCM
  fmt.writeUInt16LE(1, 10); // mono
  fmt.writeUInt32LE(16000, 12);
  fmt.writeUInt32LE(32000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const head = Buffer.alloc(8);
  head.write("data", 0, "ascii");
  head.writeUInt32LE(placeholder ? 0xffffffff : data.length, 4);
  return Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE", "ascii"), fmt, head, data]);
}

describe("transcribe add-on", () => {
  it("decodes piped 16-bit WAV into float samples", () => {
    const out = wavToFloat(wav([0, 0.5, -0.5, 1]));
    expect(out.length).toBe(4);
    expect(out[1]).toBeCloseTo(0.5, 3);
    expect(out[2]).toBeCloseTo(-0.5, 3);
    expect(wavToFloat(wav([0.25, 0.25], false)).length).toBe(2);
  });

  it("pins the studio's models", () => {
    expect(MODELS.en.id).toBe("onnx-community/whisper-base_timestamped");
    expect(MODELS.hinglish.id).toBe("ishaan-g/whisper-hinglish-swift_timestamped");
    for (const m of Object.values(MODELS)) expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it("fails clearly for a missing file and a bad language", async () => {
    await expect(transcribe("does-not-exist.mp4")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    await expect(transcribe(__filename, { language: "fr" as never })).rejects.toMatchObject({ code: "BAD_ARGS" });
  });
});
