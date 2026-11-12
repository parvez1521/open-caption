"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/services/auth/supabaseClient";
import { isGuestUser } from "@/services/auth/guest";
import { ChevronLeft } from "@/components/ui/icons";
import { LoadingMark } from "@/components/brand/LoadingMark";
import {
  SURVEY_FINISH_DESTINATION,
  SURVEY_QUESTIONS,
  isOnboardingDone,
  markOnboardingDone,
  saveOnboardingAnswers,
  type SurveyGoal,
  type SurveyUserType,
} from "@/features/onboarding/survey";

/**
 * First-visit onboarding survey — the routing quiz a signed-in user sees
 * once, right after sign-up, before the dashboard. Two questions, one
 * screen at a time; the last answer saves the goal (localStorage) and lands
 * on the dashboard, where the user picks the tool.
 *
 * Guards (defence in depth — /start already only sends first-visit
 * signed-in users here): guests and anyone whose flag is set go straight
 * back to /start. Skip on any step marks the survey done and goes to
 * /start, so it never reappears.
 */

export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [userType, setUserType] = useState<SurveyUserType | null>(null);

  useEffect(() => {
    void (async () => {
      if (isOnboardingDone()) return router.replace("/start");
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || isGuestUser(user)) return router.replace("/start");
      setReady(true);
    })();
  }, [router]);

  const finish = (goal: SurveyGoal) => {
    saveOnboardingAnswers({ userType, goal });
    markOnboardingDone();
    router.replace(SURVEY_FINISH_DESTINATION);
  };

  const skip = () => {
    if (userType) saveOnboardingAnswers({ userType, goal: null });
    markOnboardingDone();
    router.replace("/start");
  };

  if (!ready) {
    return (
      <main id="main-content" className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingMark height={40} />
          <p className="text-[13px] font-semibold text-[#FFFFEB]/70">Opening…</p>
        </div>
      </main>
    );
  }

  const question = SURVEY_QUESTIONS[step];
  const total = SURVEY_QUESTIONS.length;

  return (
    <main id="main-content" className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <LoadingMark height={40} />
        <p className="text-[13px] font-semibold text-[#FFFFEB]/55" aria-label={`Question ${step + 1} of ${total}`}>
          {step + 1} of {total}
        </p>
        <div className="flex w-full gap-2" aria-hidden="true">
          {SURVEY_QUESTIONS.map((q, i) => (
            <span key={q.id} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[#34D399]" : "bg-[#FFFFEB]/15"}`} />
          ))}
        </div>
        <h1 className="text-xl font-bold text-[#FFFFEB]">{question.question}</h1>
        {step === 0 ? (
          <p className="text-[13px] text-[#FFFFEB]/55">Two quick questions, then the right tool opens.</p>
        ) : null}
        <div className="grid w-full gap-2" role="radiogroup" aria-label={question.question}>
          {step === 0
            ? question.options.map((option) => (
                <button
                  key={option.value}
                  role="radio"
                  aria-checked={false}
                  onClick={() => {
                    setUserType(option.value as SurveyUserType);
                    setStep(1);
                  }}
                  className="rounded-2xl border border-[#FFFFEB]/12 bg-[#1E1E1B] px-5 py-4 text-left"
                >
                  <span className="block text-[15px] font-semibold text-[#FFFFEB]">{option.label}</span>
                </button>
              ))
            : question.options.map((option) => (
                <button
                  key={option.value}
                  role="radio"
                  aria-checked={false}
                  onClick={() => finish(option.value as SurveyGoal)}
                  className="rounded-2xl border border-[#FFFFEB]/12 bg-[#1E1E1B] px-5 py-4 text-left"
                >
                  <span className="block text-[15px] font-semibold text-[#FFFFEB]">{option.label}</span>
                </button>
              ))}
        </div>
        <div className="flex w-full items-center justify-between">
          {step === 1 ? (
            <button
              onClick={() => setStep(0)}
              className="flex items-center gap-1 text-[13px] font-semibold text-[#FFFFEB]/75"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}
          <button onClick={skip} className="text-[13px] font-semibold text-[#FFFFEB]/75 underline decoration-[#FFA946] decoration-2 underline-offset-4">
            Skip
          </button>
        </div>
      </div>
    </main>
  );
}
