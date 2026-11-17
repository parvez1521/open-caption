import { Footer, Nav } from "@/components/home/Sections";
import AiGenerator from "@/features/ai-generator/AiGenerator";

/**
 * /ai-generator — a free AI generator for text, images and short video clips,
 * powered by Puter.js. No Captionit account and no API key: generation runs
 * in the visitor's browser against their own free Puter account and its
 * allowance. Captionit charges nothing and stores nothing; prompts go to
 * Puter, a third party. No invented allowances, features or stats anywhere
 * on this page — in particular, nothing here is "unlimited free".
 *
 * Layout follows /auto-caption-generator: full dark background, one column,
 * stacked sections. No three-cards-in-a-row, no bento grid, no glass card,
 * no dot-grid background, no hover animation, no purple gradient.
 */
export default function AiGeneratorPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">AI generator</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          AI generator
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[#FFFFEB]/80">
          Write a prompt and get text, an image, or a short video clip. Free to use, in your browser, with no
          Captionit account — generation is powered by Puter.js and runs against your own free Puter account
          and its allowance.
        </p>

        <div className="mt-10">
          <AiGenerator />
        </div>

        <section className="mt-16" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="font-sora text-[22px] font-bold">
            How it works
          </h2>
          <ol className="mt-6 space-y-6">
            <li>
              <h3 className="font-sora text-[16px] font-bold">1. Pick what to make</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Text, Image or Video. Each one takes a plain written prompt — describe the subject, the motion
                and the mood for a clip.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">2. Sign in to Puter if asked</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                The first time you generate, Puter asks you to sign in to your free Puter account (or create
                one). That account is what pays for the generation, from its own allowance — Captionit never
                sees your Puter login.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">3. Copy, download, keep</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Copy the text, or download the image or clip. Video links from the provider are temporary, so
                download the clips you want to keep.
              </p>
            </li>
          </ol>
        </section>

        <section className="mt-16" aria-labelledby="what-it-costs">
          <h2 id="what-it-costs" className="font-sora text-[22px] font-bold">
            What it costs
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            Captionit charges nothing for this page and stores nothing you generate — your prompts go to
            Puter, a third party, and the results stay in your browser. Generation uses your own free Puter
            account and its allowance, so how much you can make depends on that allowance, not on Captionit.
            Video uses much more of your allowance than text or images, and takes longer: a short clip
            usually takes tens of seconds to a few minutes.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="what-it-cannot-do">
          <h2 id="what-it-cannot-do" className="font-sora text-[22px] font-bold">
            What it cannot do
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            It generates new text, images and clips from your prompt — it does not caption or edit your own
            videos. For word-timed captions on a video you already have, use the{" "}
            <a className="underline decoration-[#34D399]/60 underline-offset-2" href="/auto-caption-generator">
              auto caption generator
            </a>
            . AI output can be wrong, off-prompt or unusable; if a result is not what you asked for, change
            the prompt and try again.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
