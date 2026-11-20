import { describe, expect, it, vi } from "vitest";
import type { apiClient } from "@/services/api-client";
import {
  buildCorrectionPrompt,
  cleanCorrectionOutput,
  CORRECTION_CHUNK_CHARS,
  requestTranscriptCorrection,
  splitTranscriptForCorrection,
} from "../correctTranscript";

/** A stand-in client: only `post` is used, cast to the real client type. */
const clientWith = (post: unknown) => ({ post }) as unknown as typeof apiClient;

describe("splitTranscriptForCorrection", () => {
  it("short text stays one chunk; empty text has none", () => {
    expect(splitTranscriptForCorrection("Hello world.")).toEqual(["Hello world."]);
    expect(splitTranscriptForCorrection("")).toEqual([]);
    expect(splitTranscriptForCorrection("   ")).toEqual([]);
  });

  it("packs sentences in order, no chunk over the cap, nothing lost", () => {
    const sentence = "Aaj hum baat karenge free AI tools ke baare mein jo aapke kaam ko aasan bana dete hain. ";
    const text = sentence.repeat(40);
    const chunks = splitTranscriptForCorrection(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= CORRECTION_CHUNK_CHARS)).toBe(true);
    expect(chunks.join(" ")).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("a single over-long sentence hard-splits on word boundaries", () => {
    const text = Array.from({ length: 400 }, () => "word").join(" ");
    const chunks = splitTranscriptForCorrection(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= CORRECTION_CHUNK_CHARS)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("respects a custom cap", () => {
    expect(splitTranscriptForCorrection("One. Two. Three. Four.", 10)).toEqual(["One. Two.", "Three.", "Four."]);
  });
});

describe("buildCorrectionPrompt", () => {
  it("Hinglish: Roman stays Roman, never Devanagari", () => {
    const p = buildCorrectionPrompt("aaj hum ek video banayenge", "hinglish");
    expect(p.system).toContain("Roman");
    expect(p.system).toContain("never convert it to Devanagari");
    expect(p.system).toContain("Do not add new content");
    expect(p.user).toBe("aaj hum ek video banayenge");
  });

  it("Hindi keeps Devanagari; English stays English", () => {
    expect(buildCorrectionPrompt("x", "hindi").system).toContain("Devanagari stays Devanagari");
    expect(buildCorrectionPrompt("x", "en").system).toContain("English stays English");
  });

  it("never names a model or provider", () => {
    for (const lang of ["hinglish", "hindi", "en", "tamil"]) {
      const p = buildCorrectionPrompt("test", lang);
      const all = `${p.system} ${p.user}`.toLowerCase();
      expect(all).not.toContain("gpt");
      expect(all).not.toContain("groq");
      expect(all).not.toContain("whisper");
      expect(all).not.toContain("120b");
    }
  });
});

describe("cleanCorrectionOutput", () => {
  it("strips markdown fences", () => {
    expect(cleanCorrectionOutput("```\nHello world.\n```")).toBe("Hello world.");
    expect(cleanCorrectionOutput("```text\nHello world.\n```")).toBe("Hello world.");
  });

  it("strips a Corrected text label line", () => {
    expect(cleanCorrectionOutput("Corrected text:\nHello world.")).toBe("Hello world.");
  });

  it("strips surrounding quotes only when the whole output is wrapped", () => {
    expect(cleanCorrectionOutput('"Hello world."')).toBe("Hello world.");
    expect(cleanCorrectionOutput('He said "hello" to me.')).toBe('He said "hello" to me.');
  });

  it("leaves plain text untouched", () => {
    expect(cleanCorrectionOutput("Hello world.")).toBe("Hello world.");
  });
});

describe("requestTranscriptCorrection", () => {
  it("posts to the transcribe route and returns the corrected text", async () => {
    const post = vi.fn(async () => ({ configured: true, corrected: "fixed text" }));
    await expect(requestTranscriptCorrection("raw text", "hinglish", clientWith(post))).resolves.toBe("fixed text");
    expect(post).toHaveBeenCalledWith("/transcribe/correct", { json: { text: "raw text", language: "hinglish" } });
  });

  it("throws a plain message when the free AI is not switched on", async () => {
    const post = vi.fn(async () => ({ configured: false }));
    await expect(requestTranscriptCorrection("raw", "hinglish", clientWith(post))).rejects.toThrow("not switched on");
  });

  it("throws when the check comes back empty", async () => {
    const post = vi.fn(async () => ({ configured: true, corrected: "   " }));
    await expect(requestTranscriptCorrection("raw", "hinglish", clientWith(post))).rejects.toThrow("came back empty");
  });
});
