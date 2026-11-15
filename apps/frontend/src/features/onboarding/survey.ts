/**
 * First-visit onboarding survey — a routing quiz shown once, right after
 * sign-up, before the dashboard. Two questions, one screen at a time;
 * the last answer is saved (localStorage) and the user lands on the
 * dashboard, where they pick the tool. LocalStorage only: no DB column,
 * no API route, no server work.
 *
 * This is NOT the Studio's first-visit mini tutorial
 * (features/studio/tutorial.ts, 5–6 steps after captions generate) — that
 * teaches the Studio; this survey asks what the user wants BEFORE the
 * dashboard, so the dashboard can offer the matching tool.
 *
 * Destinations (resolved from the real doors, not invented) — the goal→tool
 * map the dashboard uses to offer the matching tool; the survey itself
 * always lands on the dashboard first (SURVEY_FINISH_DESTINATION), where
 * DASHBOARD_DOORS renders the three tool doors and highlights the one that
 * matches the stored goal (recommendedGoal). No stored answers (skipped
 * survey, returning user, corrupt storage) means no highlight, never a
 * crash — the doors all render the same.
 *   transcribe → /transcribe (the standalone Transcribe tool)
 *   edit       → /editor (the Normal Editor's front door: continue the most
 *                recent project, or pick any project to edit — the "editor"
 *                door of START_DOORS in features/studio/projectMode.ts)
 *   captions   → /captions (the Captions home: project list; each project
 *                opens the Studio where its captions are made and styled)
 */

export type SurveyUserType = "creator" | "freelance-editor" | "business" | "teacher";
export type SurveyGoal = "transcribe" | "edit" | "captions";

export interface SurveyAnswers {
  userType: SurveyUserType | null;
  goal: SurveyGoal | null;
}

export interface SurveyOption<T extends string> {
  value: T;
  label: string;
}

export interface SurveyQuestion<T extends string> {
  id: "user-type" | "goal";
  question: string;
  options: readonly SurveyOption<T>[];
}

export const SURVEY_QUESTIONS: readonly [
  SurveyQuestion<SurveyUserType>,
  SurveyQuestion<SurveyGoal>,
] = [
  {
    id: "user-type",
    question: "What best describes you?",
    options: [
      { value: "creator", label: "Creator" },
      { value: "freelance-editor", label: "Freelance video editor" },
      { value: "business", label: "Business / brand" },
      { value: "teacher", label: "Teacher / educator" },
    ],
  },
  {
    id: "goal",
    question: "What do you want to do?",
    options: [
      { value: "transcribe", label: "Transcribe a video or audio" },
      { value: "edit", label: "Edit a video" },
      { value: "captions", label: "Add captions to a video" },
    ],
  },
];

/** Where each Q2 answer routes. One source — the page and the tests share it. */
export const GOAL_DESTINATIONS: Readonly<Record<SurveyGoal, string>> = {
  transcribe: "/transcribe",
  edit: "/editor",
  captions: "/captions",
};

/** Where the survey lands when finished (or skipped via /start): the dashboard first — the user picks the tool there. */
export const SURVEY_FINISH_DESTINATION = "/dashboard";

export function destinationForGoal(goal: SurveyGoal): string {
  return GOAL_DESTINATIONS[goal];
}

/**
 * The dashboard's tool doors, one source — the dashboard renders these and
 * highlights the door whose goal matches the stored survey answers. The
 * hrefs reuse GOAL_DESTINATIONS so a door can never drift from the survey's
 * goal map; the subs reuse the survey's Q2 option labels word for word.
 */
export const DASHBOARD_DOORS: readonly {
  goal: SurveyGoal;
  href: string;
  label: string;
  sub: string;
}[] = [
  { goal: "transcribe", href: GOAL_DESTINATIONS.transcribe, label: "Transcribe", sub: "Transcribe a video or audio" },
  { goal: "edit", href: GOAL_DESTINATIONS.edit, label: "Editor", sub: "Edit a video" },
  { goal: "captions", href: GOAL_DESTINATIONS.captions, label: "Captions", sub: "Add captions to a video" },
];

/**
 * Which dashboard door the stored answers recommend, or null when there is
 * nothing to recommend: no stored answers, a skipped survey (goal null), or
 * a goal that is not a real door. Pure, so the dashboard and the tests share
 * it — the dashboard never highlights on an unvalidated value.
 */
export function recommendedGoal(answers: SurveyAnswers | null): SurveyGoal | null {
  if (!answers || !answers.goal) return null;
  return answers.goal in GOAL_DESTINATIONS ? answers.goal : null;
}

/* ---------- first-visit flag + stored answers (localStorage only) ---------- */

export const ONBOARDING_DONE_KEY = "oc:onboarding-done";
export const ONBOARDING_ANSWERS_KEY = "oc:onboarding-answers";

export function isOnboardingDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return true; // storage unavailable: never nag — /start doors are one click away
  }
}

export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    /* private mode / storage full: the survey may show again, harmless */
  }
}

export function saveOnboardingAnswers(answers: SurveyAnswers): void {
  try {
    window.localStorage.setItem(ONBOARDING_ANSWERS_KEY, JSON.stringify(answers));
  } catch {
    /* private mode / storage full */
  }
}

export function readOnboardingAnswers(): SurveyAnswers | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_ANSWERS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { userType, goal } = parsed as Partial<SurveyAnswers>;
    const isType = (v: unknown): v is SurveyUserType =>
      v === "creator" || v === "freelance-editor" || v === "business" || v === "teacher";
    const isGoal = (v: unknown): v is SurveyGoal =>
      v === "transcribe" || v === "edit" || v === "captions";
    return { userType: isType(userType) ? userType : null, goal: isGoal(goal) ? goal : null };
  } catch {
    return null;
  }
}

/**
 * The first-visit gate, as a pure decision so tests can pin it without a
 * browser: show the survey only to a signed-in, non-anonymous user whose
 * flag is unset. Guests (anonymous sessions) and returning users go
 * straight to the /start doors, never the survey.
 */
export function shouldShowSurvey(args: {
  signedIn: boolean;
  isGuest: boolean;
  done: boolean;
}): boolean {
  return args.signedIn && !args.isGuest && !args.done;
}
