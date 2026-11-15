import Link from "next/link";
import { DASHBOARD_DOORS, type SurveyGoal } from "@/features/onboarding/survey";

/**
 * The dashboard's tool doors — Transcribe, Editor, Captions — in the same
 * panel style as the Export History / Brand Kit doors below them. The door
 * matching the stored survey goal (see recommendedGoal in
 * features/onboarding/survey.ts) gets a "Recommended for you" badge and an
 * emerald border; with no stored answers (skipped survey, returning user,
 * corrupt storage) every door renders the same and nothing is highlighted.
 * Purely presentational: the dashboard page reads the stored answers and
 * passes the goal in, so this renders identically with no answers at all.
 */
export default function StartDoors({ recommendedGoal }: { recommendedGoal: SurveyGoal | null }) {
  return (
    <div className="grid grid-cols-1 gap-4 pt-8 sm:grid-cols-3" aria-label="Start with a tool">
      {DASHBOARD_DOORS.map((door) => {
        const recommended = recommendedGoal === door.goal;
        return (
          <Link
            key={door.goal}
            href={door.href}
            data-recommended={recommended || undefined}
            aria-label={recommended ? `${door.label}, recommended for you` : door.label}
            style={recommended ? { borderColor: "#34D399" } : undefined}
            className="wb-panel block p-5 transition-colors hover:border-sand-300"
          >
            <p className="wb-eyebrow">Start</p>
            {recommended ? (
              <span className="mt-2 inline-block rounded-full bg-[#34D399] px-2.5 py-0.5 font-sora text-[11px] font-semibold text-[#141412]">
                Recommended for you
              </span>
            ) : null}
            <p className="mt-2 font-sora text-[14px] font-bold text-ink">{door.label}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-sand-700">{door.sub}</p>
          </Link>
        );
      })}
    </div>
  );
}
