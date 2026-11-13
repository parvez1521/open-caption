import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc } from "@capseasy/shared";
import type { GenerationDeps, ModelRunner } from "@/features/create/service";
import { EmphasisSuggestions } from "../panels/EmphasisSuggestions";
import { useStudio } from "../useStudio";

/**
 * Addition A1 review surface: the honesty + mutation rules at the UI level.
 * - No AI route -> the action is DISABLED with the reason shown.
 * - Reviewing never mutates the doc; Discard leaves it untouched.
 * - Accepting applies the accepted set through ONE edit() — proven against
 *   the real unified history (useStudio): one undo restores the prior doc
 *   and leaves nothing more to undo.
 */

const doc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w0", text: "Stop", startMs: 0, endMs: 300 },
    { id: "w1", text: "wasting", startMs: 320, endMs: 700 },
    { id: "w2", text: "money", startMs: 720, endMs: 1100 },
    { id: "w3", text: "on", startMs: 1120, endMs: 1300 },
    { id: "w4", text: "free", startMs: 1320, endMs: 1600 },
    { id: "w5", text: "tools", startMs: 1620, endMs: 2000 },
  ],
});

const GOOD_JSON = JSON.stringify([
  { index: 0, word: "Stop", action: "emphasise" },
  { index: 4, word: "free", action: "supersize" },
  { index: 2, word: "money", action: "emoji", emoji: "💰" },
]);
const goodCloud: ModelRunner = async () => GOOD_JSON;
const cloudDeps: GenerationDeps = { runCloud: goodCloud, modelEnabled: false };

describe("EmphasisSuggestions — availability honesty", () => {
  it("with no AI route the action is disabled and the reason is shown (no silent heuristic)", () => {
    render(<EmphasisSuggestions doc={doc} edit={vi.fn()} heroSupported deps={{ modelEnabled: false }} />);
    const btn = screen.getByRole("button", { name: "Suggest emphasis" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/no template or heuristic fallback/)).toBeTruthy();
    expect(screen.getByText(/Nothing changes until you accept/)).toBeTruthy();
  });

  it("a failing route reports unavailable after the attempt — no suggestions, no edit", async () => {
    const down: ModelRunner = async () => { throw new Error("upstream down"); };
    const edit = vi.fn();
    render(<EmphasisSuggestions doc={doc} edit={edit} heroSupported deps={{ runCloud: down, modelEnabled: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("no template fallback");
    expect(edit).not.toHaveBeenCalled();
  });

  it("a transient failure offers Try again, which re-runs the generation and succeeds", async () => {
    let calls = 0;
    const flaky: ModelRunner = async () => {
      calls += 1;
      if (calls === 1) throw new Error("upstream down");
      return GOOD_JSON;
    };
    const edit = vi.fn();
    render(<EmphasisSuggestions doc={doc} edit={edit} heroSupported deps={{ runCloud: flaky, modelEnabled: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("try again in a moment");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (3)")).toBeTruthy());
    expect(calls).toBe(2);
    expect(edit).not.toHaveBeenCalled();
  });

  it("a rate limit offers NO Try again button — retrying now would fail the same way", async () => {
    const limited = new Error("limited") as Error & { code: string };
    limited.code = "RATE_LIMITED";
    const down: ModelRunner = async () => { throw limited; };
    render(<EmphasisSuggestions doc={doc} edit={vi.fn()} heroSupported deps={{ runCloud: down, modelEnabled: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("hit its limit");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("an empty valid result shows 'no suggestions', not an error — with the source badge", async () => {
    const empty: ModelRunner = async () => "[]";
    render(<EmphasisSuggestions doc={doc} edit={vi.fn()} heroSupported deps={{ runCloud: empty, modelEnabled: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("No suggestions for these captions.")).toBeTruthy());
    expect(screen.getByText(/Free AI/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("EmphasisSuggestions — review, reject, accept", () => {
  it("review lists suggestions badged as cloud AI; generating alone does NOT touch the doc", async () => {
    const edit = vi.fn();
    render(<EmphasisSuggestions doc={doc} edit={edit} heroSupported deps={cloudDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (3)")).toBeTruthy());
    const badge = screen.getByText(/Free AI/);
    expect(badge.getAttribute("data-source")).toBe("cloud");
    expect(screen.getByText(/Supersize \(key word\)/)).toBeTruthy();
    expect(screen.getByText(/Emoji 💰/)).toBeTruthy();
    expect(edit).not.toHaveBeenCalled();
  });

  it("local-model suggestions are badged as the local model", async () => {
    render(
      <EmphasisSuggestions doc={doc} edit={vi.fn()} heroSupported deps={{ modelEnabled: true, runModel: goodCloud }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (3)")).toBeTruthy());
    const badge = screen.getByText(/Local model/);
    expect(badge.getAttribute("data-source")).toBe("model");
  });

  it("Discard leaves the doc untouched: edit is never called and the review closes", async () => {
    const edit = vi.fn();
    render(<EmphasisSuggestions doc={doc} edit={edit} heroSupported deps={cloudDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (3)")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(edit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Suggest emphasis" })).toBeTruthy();
  });

  it("per-item accept: unchecking one suggestion excludes exactly that one from the single edit", async () => {
    let applied: CaptionDoc | null = null;
    const edit = vi.fn((fn: (d: CaptionDoc) => CaptionDoc) => { applied = fn(doc); });
    render(<EmphasisSuggestions doc={doc} edit={edit} heroSupported deps={cloudDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (3)")).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Emoji 💰 on "money"/));
    expect(screen.getByText("Apply accepted (2)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply accepted/ }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(applied!.words[0]!.emphasis).toBe("strong");
    expect(applied!.words[4]!.emphasis).toBe("hero");
    expect(applied!.words[2]!.emoji).toBeUndefined();
  });

  it("supersize is blocked (not silently applied) when the layout cannot show a key word", async () => {
    const edit = vi.fn();
    render(<EmphasisSuggestions doc={doc} edit={edit} heroSupported={false} deps={cloudDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (2)")).toBeTruthy());
    expect(screen.getByText(/does not show a key word/)).toBeTruthy();
  });
});

// --- accept path against the REAL unified history: exactly one undo step ---

const STUDIO_DOC = {
  version: 2,
  language: "en",
  direction: "ltr",
  words: [
    { id: "w0", text: "Stop", startMs: 0, endMs: 300 },
    { id: "w1", text: "wasting", startMs: 320, endMs: 700 },
    { id: "w2", text: "money", startMs: 720, endMs: 1100 },
    { id: "w3", text: "on", startMs: 1120, endMs: 1300 },
    { id: "w4", text: "free", startMs: 1320, endMs: 1600 },
    { id: "w5", text: "tools", startMs: 1620, endMs: 2000 },
  ],
  manualBreaks: [],
  noBreakAfter: [],
  cards: {},
  meta: { userEdited: false },
};

const studioData = {
  project: {
    id: "p1", title: "Emphasis", status: "ready", language: "en", aspect_ratio: null,
    look_id: "hormozi_box", template_id: null, style_json: null, settings_json: {}, platform: null,
  },
  video: null,
  job: null,
  canTranscribe: false,
  document: { doc: STUDIO_DOC, revision: 1, unchanged: false },
};

vi.mock("@/services/studio", () => ({
  RevisionConflict: class RevisionConflict extends Error {},
  studioService: {
    getStudio: vi.fn(async () => studioData),
    saveDocument: vi.fn(async () => 2),
    savePatch: vi.fn(async () => undefined),
    saveTranslation: vi.fn(async () => undefined),
  },
}));
vi.mock("@/features/transcribe/session", () => ({ hasActiveSession: () => false }));

const Harness: React.FC = () => {
  const s = useStudio("p1");
  if (!s.doc) return <p>loading</p>;
  return (
    <div>
      <EmphasisSuggestions doc={s.doc} edit={s.edit} heroSupported deps={cloudDeps} />
      <p data-testid="can-undo">{String(s.canUndo)}</p>
      <p data-testid="words">{s.doc.words.map((w) => `${w.text}:${w.emphasis ?? "-"}:${w.emoji?.char ?? "-"}`).join(" ")}</p>
      <button onClick={s.undo}>UndoNow</button>
    </div>
  );
};

describe("EmphasisSuggestions — accept path = exactly one undo step (real useStudio history)", () => {
  it("applying the accepted set is one history step; one undo restores the prior doc completely", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Suggest emphasis" })).toBeTruthy());
    expect(screen.getByTestId("can-undo").textContent).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Suggest emphasis" }));
    await waitFor(() => expect(screen.getByText("Apply accepted (3)")).toBeTruthy());
    // still untouched while reviewing
    expect(screen.getByTestId("can-undo").textContent).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Apply accepted/ }));
    await waitFor(() => expect(screen.getByTestId("can-undo").textContent).toBe("true"));
    expect(screen.getByTestId("words").textContent).toContain("Stop:strong");
    expect(screen.getByTestId("words").textContent).toContain("free:hero");
    expect(screen.getByTestId("words").textContent).toContain("money:-:💰");
    fireEvent.click(screen.getByRole("button", { name: "UndoNow" }));
    await waitFor(() => expect(screen.getByTestId("can-undo").textContent).toBe("false"));
    // ONE undo restored everything and there is nothing left to undo
    expect(screen.getByTestId("words").textContent).toBe(
      "Stop:-:- wasting:-:- money:-:- on:-:- free:-:- tools:-:-",
    );
  });
});
