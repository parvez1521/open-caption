import { beforeEach, describe, expect, it } from "vitest";
import {
  DASHBOARD_DOORS,
  GOAL_DESTINATIONS,
  ONBOARDING_ANSWERS_KEY,
  ONBOARDING_DONE_KEY,
  SURVEY_FINISH_DESTINATION,
  SURVEY_QUESTIONS,
  destinationForGoal,
  isOnboardingDone,
  markOnboardingDone,
  readOnboardingAnswers,
  recommendedGoal,
  saveOnboardingAnswers,
  shouldShowSurvey,
} from "../survey";

/**
 * Onboarding survey logic: the two questions, the goal→tool map the
 * dashboard uses to offer the matching tool, the dashboard-first finish,
 * and the first-visit gate (signed-in, non-guest, flag unset — guests and
 * returning users never see the survey; Skip marks it done).
 */

describe("onboarding survey questions", () => {
  it("asks exactly two questions, one screen at a time, in plain English", () => {
    expect(SURVEY_QUESTIONS).toHaveLength(2);
    expect(SURVEY_QUESTIONS[0].question).toBe("What best describes you?");
    expect(SURVEY_QUESTIONS[1].question).toBe("What do you want to do?");
  });

  it("no Hinglish remains anywhere in the survey copy", () => {
    const copy = JSON.stringify(SURVEY_QUESTIONS);
    expect(copy).not.toMatch(/Aap|chahiye|kya ho|karo|chahte/i);
    for (const q of SURVEY_QUESTIONS) {
      expect(q.question.split(" ").length).toBeLessThanOrEqual(12);
      for (const o of q.options) expect(o.label.split(" ").length).toBeLessThanOrEqual(12);
    }
  });

  it("Q1 offers the four user types, no emojis", () => {
    expect(SURVEY_QUESTIONS[0].options.map((o) => o.label)).toEqual([
      "Creator",
      "Freelance video editor",
      "Business / brand",
      "Teacher / educator",
    ]);
  });

  it("Q2 offers the three goals", () => {
    expect(SURVEY_QUESTIONS[1].options.map((o) => o.label)).toEqual([
      "Transcribe a video or audio",
      "Edit a video",
      "Add captions to a video",
    ]);
  });
});

describe("goal destinations", () => {
  it("transcribe goes to the standalone Transcribe tool", () => {
    expect(destinationForGoal("transcribe")).toBe("/transcribe");
  });

  it("edit goes to the Normal Editor door, not AI Edit", () => {
    expect(destinationForGoal("edit")).toBe("/editor");
    expect(GOAL_DESTINATIONS.edit).not.toContain("ai-edit");
  });

  it("captions goes to the Captions home", () => {
    expect(destinationForGoal("captions")).toBe("/captions");
  });

  it("covers every goal, no goal without a destination", () => {
    expect(Object.keys(GOAL_DESTINATIONS).sort()).toEqual(["captions", "edit", "transcribe"]);
  });

  it("finishing the survey lands on the dashboard first — the user picks the tool there", () => {
    expect(SURVEY_FINISH_DESTINATION).toBe("/dashboard");
    expect(SURVEY_FINISH_DESTINATION).not.toBe(destinationForGoal("transcribe"));
    expect(SURVEY_FINISH_DESTINATION).not.toBe(destinationForGoal("edit"));
    expect(SURVEY_FINISH_DESTINATION).not.toBe(destinationForGoal("captions"));
  });
});

describe("dashboard doors — the highlight the stored answers drive", () => {
  it("one door per goal, each pointing at its goal destination", () => {
    expect(DASHBOARD_DOORS.map((d) => d.goal)).toEqual(["transcribe", "edit", "captions"]);
    expect(DASHBOARD_DOORS.map((d) => d.href)).toEqual(["/transcribe", "/editor", "/captions"]);
    for (const door of DASHBOARD_DOORS) {
      expect(door.href).toBe(destinationForGoal(door.goal));
    }
  });

  it("door subs reuse the survey's Q2 option labels word for word", () => {
    const q2Labels = SURVEY_QUESTIONS[1].options.map((o) => o.label);
    expect(DASHBOARD_DOORS.map((d) => d.sub)).toEqual(q2Labels);
  });

  it("the stored goal is the recommended door", () => {
    expect(recommendedGoal({ userType: "creator", goal: "transcribe" })).toBe("transcribe");
    expect(recommendedGoal({ userType: "teacher", goal: "edit" })).toBe("edit");
    expect(recommendedGoal({ userType: "business", goal: "captions" })).toBe("captions");
  });

  it("no stored answers means no highlight, never a crash", () => {
    expect(recommendedGoal(null)).toBeNull();
    expect(recommendedGoal({ userType: "creator", goal: null })).toBeNull();
  });

  it("an unknown stored goal means no highlight", () => {
    expect(recommendedGoal({ userType: null, goal: "nope" as never })).toBeNull();
  });
});

describe("first-visit flag", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("unset by default; set after marking done", () => {
    expect(isOnboardingDone()).toBe(false);
    markOnboardingDone();
    expect(isOnboardingDone()).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe("1");
  });

  it("round-trips both answers through localStorage only", () => {
    saveOnboardingAnswers({ userType: "freelance-editor", goal: "transcribe" });
    expect(readOnboardingAnswers()).toEqual({ userType: "freelance-editor", goal: "transcribe" });
    expect(window.localStorage.getItem(ONBOARDING_ANSWERS_KEY)).toContain("freelance-editor");
  });

  it("ignores a corrupt stored answer instead of throwing", () => {
    window.localStorage.setItem(ONBOARDING_ANSWERS_KEY, "{not json");
    expect(readOnboardingAnswers()).toBeNull();
    window.localStorage.setItem(ONBOARDING_ANSWERS_KEY, JSON.stringify({ userType: "nope", goal: "transcribe" }));
    expect(readOnboardingAnswers()).toEqual({ userType: null, goal: "transcribe" });
  });
});

describe("shouldShowSurvey — the first-visit gate", () => {
  it("shows only to a signed-in, non-guest user whose flag is unset", () => {
    expect(shouldShowSurvey({ signedIn: true, isGuest: false, done: false })).toBe(true);
  });

  it("never shows to a guest (anonymous session)", () => {
    expect(shouldShowSurvey({ signedIn: true, isGuest: true, done: false })).toBe(false);
  });

  it("never shows once the flag is set (returning user, or after Skip)", () => {
    expect(shouldShowSurvey({ signedIn: true, isGuest: false, done: true })).toBe(false);
  });

  it("never shows with no session", () => {
    expect(shouldShowSurvey({ signedIn: false, isGuest: false, done: false })).toBe(false);
  });
});
