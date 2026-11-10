import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import { apiClient } from "@/services/api-client";
import {
  EMPTY_VOICE,
  activateBrandProfile,
  containsAvoidedWord,
  createBrandProfile,
  deleteBrandProfile,
  fetchBrandProfiles,
  normalizeVoice,
  profilePromptBlock,
  updateBrandProfile,
  type BrandProfile,
  type BrandVoice,
} from "../brandProfile";

const profile = (voice: Partial<BrandVoice>, rest: Partial<BrandProfile> = {}): BrandProfile => ({
  id: "p1",
  name: "Fitness",
  isActive: true,
  colors: [],
  fontId: null,
  voice: { ...EMPTY_VOICE, ...voice },
  createdAt: "2026-11-10T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
  ...rest,
});

describe("normalizeVoice", () => {
  it("returns an empty voice for non-objects", () => {
    for (const raw of [null, undefined, 42, "voice", [], true]) {
      expect(normalizeVoice(raw)).toEqual(EMPTY_VOICE);
    }
  });

  it("keeps strings, coerces non-strings to empty strings", () => {
    const v = normalizeVoice({ niche: "fitness", audience: 42, language: null, tone: { x: 1 }, writingStyle: "punchy" });
    expect(v.niche).toBe("fitness");
    expect(v.audience).toBe("");
    expect(v.language).toBe("");
    expect(v.tone).toBe("");
    expect(v.writingStyle).toBe("punchy");
  });

  it("keeps only string items in arrays, and treats non-arrays as empty", () => {
    const v = normalizeVoice({ wordsToUse: ["grow", 7, null, "strong"], wordsToAvoid: "spam", sampleCaptions: [], preferredCtas: ["Follow"] });
    expect(v.wordsToUse).toEqual(["grow", "strong"]);
    expect(v.wordsToAvoid).toEqual([]);
    expect(v.sampleCaptions).toEqual([]);
    expect(v.preferredCtas).toEqual(["Follow"]);
  });

  it("caps string length at 500, item length at 120, and list length at 30", () => {
    const long = "x".repeat(600);
    const v = normalizeVoice({ niche: long, wordsToUse: Array.from({ length: 40 }, (_, i) => `${i}-${long}`) });
    expect(v.niche).toHaveLength(500);
    expect(v.wordsToUse).toHaveLength(30);
    expect(v.wordsToUse[0]).toHaveLength(120);
  });

  it("never shares arrays with EMPTY_VOICE or between calls", () => {
    const a = normalizeVoice(null);
    const b = normalizeVoice({ wordsToUse: ["one"] });
    a.wordsToUse.push("mutated");
    expect(EMPTY_VOICE.wordsToUse).toEqual([]);
    expect(b.wordsToUse).toEqual(["one"]);
  });
});

describe("profilePromptBlock", () => {
  it("returns an empty string for an empty-ish profile, so callers omit the block", () => {
    expect(profilePromptBlock(profile({}))).toBe("");
    expect(profilePromptBlock(profile({ niche: "  ", wordsToUse: [" "] }))).toBe("");
  });

  it("states the filled fields and calls out the words to AVOID explicitly", () => {
    const block = profilePromptBlock(
      profile({
        niche: "home fitness",
        tone: "direct",
        wordsToUse: ["progress"],
        wordsToAvoid: ["miracle", "guaranteed results"],
        preferredCtas: ["Save this for later"],
      }),
    );
    expect(block).toContain("Niche: home fitness");
    expect(block).toContain("Tone: direct");
    expect(block).toContain("Words to use: progress");
    expect(block).toContain("Words to AVOID");
    expect(block).toContain("miracle");
    expect(block).toContain("guaranteed results");
    expect(block).toContain("Preferred calls to action: Save this for later");
  });

  it("omits empty fields entirely — no hollow labels", () => {
    const block = profilePromptBlock(profile({ tone: "calm" }));
    expect(block).toContain("Tone: calm");
    expect(block).not.toContain("Niche:");
    expect(block).not.toContain("Audience:");
    expect(block).not.toContain("AVOID");
    expect(block).not.toContain("Sample captions");
  });

  it("includes at most two sample captions as style examples", () => {
    const block = profilePromptBlock(profile({ sampleCaptions: ["one caption", "two caption", "three caption"] }));
    expect(block).toContain("Sample captions");
    expect(block).toContain("one caption");
    expect(block).toContain("two caption");
    expect(block).not.toContain("three caption");
  });
});

describe("containsAvoidedWord", () => {
  const voice = (wordsToAvoid: string[]): BrandVoice => ({ ...EMPTY_VOICE, wordsToAvoid });

  it("matches whole words only — substrings do not count", () => {
    expect(containsAvoidedWord("wholesale prices dropped", voice(["sale"]))).toBe(false);
    expect(containsAvoidedWord("big sale today", voice(["sale"]))).toBe(true);
    expect(containsAvoidedWord("sales are up", voice(["sale"]))).toBe(false);
  });

  it("is case-insensitive and ignores surrounding punctuation", () => {
    expect(containsAvoidedWord("This is a MIRACLE!", voice(["miracle"]))).toBe(true);
    expect(containsAvoidedWord("a (miracle) happened", voice(["Miracle"]))).toBe(true);
  });

  it("matches multi-word phrases as phrases", () => {
    expect(containsAvoidedWord("get guaranteed results fast", voice(["guaranteed results"]))).toBe(true);
    expect(containsAvoidedWord("results are guaranteed", voice(["guaranteed results"]))).toBe(false);
    expect(containsAvoidedWord("cheap   tricks inside", voice(["cheap tricks"]))).toBe(true);
  });

  it("treats regex-special characters in avoided words literally", () => {
    expect(containsAvoidedWord("learn c++ today", voice(["c++"]))).toBe(true);
    expect(containsAvoidedWord("learn cpp today", voice(["c++"]))).toBe(false);
    expect(containsAvoidedWord("get 100% free stuff", voice(["100% free"]))).toBe(true);
    expect(containsAvoidedWord("price is $5 only", voice(["$5"]))).toBe(true);
  });

  it("returns false for empty text, no avoided words, or blank entries", () => {
    expect(containsAvoidedWord("", voice(["sale"]))).toBe(false);
    expect(containsAvoidedWord("big sale today", voice([]))).toBe(false);
    expect(containsAvoidedWord("big sale today", voice(["", "  "]))).toBe(false);
  });
});

describe("client helpers — they hit the profiles API through apiClient", () => {
  const getMock = vi.mocked(apiClient.get);
  const postMock = vi.mocked(apiClient.post);
  const putMock = vi.mocked(apiClient.put);
  const deleteMock = vi.mocked(apiClient.delete);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchBrandProfiles GETs /brand/profiles", async () => {
    const result = { profiles: [], activeId: null, voiceReady: true };
    getMock.mockResolvedValue(result);
    await expect(fetchBrandProfiles()).resolves.toEqual(result);
    expect(getMock).toHaveBeenCalledWith("/brand/profiles");
  });

  it("create / update / delete / activate use the matching verbs and paths", async () => {
    postMock.mockResolvedValue({});
    putMock.mockResolvedValue({});
    deleteMock.mockResolvedValue({ deleted: true });
    await createBrandProfile({ name: "Fitness" });
    expect(postMock).toHaveBeenCalledWith("/brand/profiles", { json: { name: "Fitness" } });
    await updateBrandProfile("p1", { name: "Renamed" });
    expect(putMock).toHaveBeenCalledWith("/brand/profiles/p1", { json: { name: "Renamed" } });
    await deleteBrandProfile("p1");
    expect(deleteMock).toHaveBeenCalledWith("/brand/profiles/p1");
    await activateBrandProfile("p1");
    expect(postMock).toHaveBeenCalledWith("/brand/profiles/p1/activate");
  });
});
