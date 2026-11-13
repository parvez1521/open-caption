import Link from "next/link";
import { AUTO_CAPTION_FAQS } from "./faqs";
import { Footer, Nav } from "@/components/home/Sections";

/**
 * /auto-caption-generator — the first SEO tool landing page (competitor-
 * intelligence programme, 2026-11-13). Original copy written for Captionit
 * from verified product facts only (see seo/competitor-intelligence/audit/
 * captionit-baseline.md): 150 looks, 14 languages, in-browser, free, real
 * formats and limits. No invented stats, no fake testimonials, no keyword
 * stuffing. No image is used on this page: the site's only share image still
 * carries the old "CaptionsEasy" name and "20+ looks", so reusing it would
 * show readers the wrong brand and the wrong count. Replacing that asset is
 * a separate fix, not part of this branch.
 *
 * Layout follows the pricing page: dark background, one column, stacked
 * sections. No three-cards-in-a-row, no bento grid, no glass card, no
 * dot-grid background, no hover animation, no purple gradient.
 */
export default function AutoCaptionGeneratorPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Automatic captions</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Automatic video caption generator
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[#FFFFEB]/80">
          Drop in a short video. Get captions timed to every word, in minutes, free and in your browser. Pick one of 150 animated looks. Fix any word it heard wrong. Export an MP4 ready to post, or a subtitle file for YouTube. Nothing to install, no watermark. For transcription and the normal MP4 export, your video file is never uploaded anywhere.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/start"
            className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 font-sora text-[14px] font-semibold text-[#FFFFEB]"
          >
            See pricing
          </Link>
        </div>

        <section className="mt-16" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="font-sora text-[22px] font-bold">
            How it works
          </h2>
          <ol className="mt-6 space-y-6">
            <li>
              <h3 className="font-sora text-[16px] font-bold">1. Upload your video</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Open <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/start">Captionit</Link> and
                drop in a clip. MP4, MOV, WebM and MKV work. The file stays on your device.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">2. Transcribe in your browser</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Whisper runs inside the tab and writes out what was said, timed to every word, in one of 14 languages
                including Hindi and Hinglish. If you only need the words, the standalone{" "}
                <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/transcribe">Transcribe</Link>{" "}
                tool does the same job and hands you a timed transcript.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">3. Pick a look</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Start from one of 150 animated caption looks, then change the font, colours, position and motion to
                match your video. Add a subscribe pill, a counter or a title from{" "}
                <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/motion">Motion Studio</Link>{" "}
                when the video needs one.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">4. Fix any word</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Click a word and type the correction. The timing stays. If the whole track is early or late, shift all captions at once. No dragging one by one.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">5. Export and post</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Export an MP4 with the captions burned in, ready for Reels, Shorts and TikTok, or a subtitle file
                (SRT, VTT, ASS, plain text or JSON) for YouTube and other editors.
              </p>
            </li>
          </ol>
        </section>

        <section className="mt-16" aria-labelledby="what-you-get">
          <h2 id="what-you-get" className="font-sora text-[22px] font-bold">
            What you get
          </h2>
          <ul className="mt-6 space-y-3 text-[15px] leading-relaxed text-[#FFFFEB]/80">
            <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" /><span>Word-timed captions. Every word lands on the frame where it is spoken. The key word on each line gets its own colour, box or motion.</span></li>
            <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" /><span>150 animated looks. The largest style count we verified among rival tools. Every look is in the free plan.</span></li>
            <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" /><span>14 languages, including Hindi and Hinglish. Hindi and Hinglish come out in Roman script, the way most creators type; Devanagari Hindi is a separate option.</span></li>
            <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" /><span>MP4 and subtitle export from one workflow. Most tools do one or the other; here you get both.</span></li>
            <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" /><span>No watermark, nothing to install. Transcription, editing and MP4 export run in your browser. On desktop or phone.</span></li>
            <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" /><span>Built for vertical video. 9:16 Reels, Shorts and TikTok first. 16:9 widescreen works the same way.</span></li>
          </ul>
        </section>

        <section className="mt-16" aria-labelledby="languages">
          <h2 id="languages" className="font-sora text-[22px] font-bold">
            Captions in your language
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            English, Hindi, Hinglish, Tamil, Telugu, Bengali, Marathi, Punjabi, Urdu, Spanish, French, German, Arabic and Portuguese. Hinglish captions use a Whisper model fine-tuned for Hindi-English speech. Mixed Hindi-English talking comes out as the Roman-script Hinglish creators actually post. Not as a translation.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="formats">
          <h2 id="formats" className="font-sora text-[22px] font-bold">
            Export formats
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            MP4 with captions burned in; transparent overlays as MOV (ProRes) or WebM, rendered by the free desktop
            Companion app; and caption files as SRT, VTT, ASS, plain text or JSON. Translated tracks add translated
            SRT and VTT rows. MP4 export needs Chrome, Edge or Safari.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="limits">
          <h2 id="limits" className="font-sora text-[22px] font-bold">
            What it cannot do
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            It transcribes what was actually said, so it cannot write captions for silent video, and it will make
            mistakes on heavy background noise, overlapping speakers or very quiet speech. Those are fixed by editing
            the words, not by re-running. It is built for short video: free videos can be up to 5 minutes long, and
            paid plans allow longer videos up to 3 hours. Transparent overlay exports need the Companion app; the
            normal MP4 export does not.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="pricing-note">
          <h2 id="pricing-note" className="font-sora text-[22px] font-bold">
            Free, with paid passes when you outgrow it
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            The free plan includes the full editor, all 150 looks and every AI tool. Paid plans are 30-day passes
            that raise the limits: more projects, longer videos, bigger uploads, longer export storage. You pay once;
            nothing renews or charges you again automatically. See{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/pricing">Pricing</Link>{" "}
            for the plans in your currency.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="faq">
          <h2 id="faq" className="font-sora text-[22px] font-bold">
            Frequently asked questions
          </h2>
          <div className="mt-6 space-y-8">
            {AUTO_CAPTION_FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-sora text-[16px] font-bold">{f.q}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-white/10 bg-[#1C1C1A] p-6 sm:p-8" aria-labelledby="closing">
          <h2 id="closing" className="font-serif text-2xl font-semibold">
            Caption your next video free
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            Captionit is made by one person, for creators who post every day. Read more on the{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/about">About</Link> page, or
            go straight to the{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/">homepage</Link> to see the
            full studio.
          </p>
          <Link
            href="/start"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]"
          >
            Caption a video free
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
