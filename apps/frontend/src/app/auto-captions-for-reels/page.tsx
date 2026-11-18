import Link from "next/link";
import { REELS_FAQS } from "./faqs";
import { Footer, Nav } from "@/components/home/Sections";

/**
 * /auto-captions-for-reels — the second SEO tool landing page (SEO programme,
 * 2026-11-15). Built for "auto captions for reels", the weakest-competition
 * long-tail in the SERP research: small/niche sites rank, no big brand, no
 * Google help page. Original copy written for Captionit from verified
 * product facts only: 150 looks, 14 languages, in-browser, free, real
 * formats and limits. No invented stats, no fake testimonials, no keyword
 * stuffing. No image is used on this page.
 *
 * Layout follows the /auto-caption-generator page: dark background, one
 * column, stacked sections. No three-cards-in-a-row, no bento grid, no glass
 * card, no dot-grid background, no hover animation, no purple gradient.
 * This is not a copy of that page: the job here is Reels — Instagram's
 * built-in captions vs burned-in, safe zones, and Reels-specific questions.
 */
export default function AutoCaptionsForReelsPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Auto captions for Reels</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Auto captions for Reels
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[#FFFFEB]/80">
          Drop in a vertical clip. Get auto captions timed to every word, in minutes, free and in your browser. Pick one of 150 animated looks. Fix any word it heard wrong. Export an MP4 ready to post on Reels, or a subtitle file for YouTube. Nothing to install, no watermark. Videos up to 50 MB are automatically backed up to your project's cloud storage for multi-device access.
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

        <section className="mt-16" aria-labelledby="why-reels-need-captions">
          <h2 id="why-reels-need-captions" className="font-sora text-[22px] font-bold">
            Why Reels need captions
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            A lot of Reels are watched with the sound off — on the bus, at work, late at night. Without captions,
            those viewers scroll past in the first second. Captions also make the Reel watchable for viewers who
            cannot hear it at all. And when the words move with the speaker, one bold word at a time, the Reel
            reads like a conversation instead of a wall of text.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="built-in-vs-burned-in">
          <h2 id="built-in-vs-burned-in" className="font-sora text-[22px] font-bold">
            Instagram&rsquo;s built-in captions vs burned-in captions
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            Instagram has its own captions: the viewer can turn them on or off, and Instagram styles them. They
            are free and already on your phone — and they only work inside Instagram. If someone downloads your
            Reel or it gets reposted somewhere else, those captions do not travel with it.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            Burned-in captions are part of the video file itself. They are always visible, they carry your style
            instead of Instagram&rsquo;s, and they show everywhere the video is shared — downloads, reposts, other
            apps. The trade-off is that a viewer cannot switch them off. If the Reel lives only on Instagram and
            you want viewers to choose, built-in is fine. If you want your style and captions that travel,
            burn them in.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="font-sora text-[22px] font-bold">
            How to add auto captions to a Reel
          </h2>
          <ol className="mt-6 space-y-6">
            <li>
              <h3 className="font-sora text-[16px] font-bold">1. Upload your Reel</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Open <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/start">Captionit</Link> and
                drop in a vertical 9:16 clip. MP4, MOV, WebM and MKV work. The file stays on your device, and videos up to 50 MB are automatically backed up to your project's cloud storage.
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
                Start from one of 150 animated caption looks. Bold, high-contrast, word-by-word styles read best
                on a phone screen. Tap the heart on a look to favourite it and find it again fast.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">4. Keep captions clear of buttons</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Instagram puts the like, comment and share rail on the right edge, and your caption and music
                credit at the bottom. Drag the caption box into the clear middle of the frame, away from faces
                and the rail, so no word hides behind a button.
              </p>
            </li>
            <li>
              <h3 className="font-sora text-[16px] font-bold">5. Fix any word, export and post</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">
                Click a word and type the correction. The timing stays. Export an MP4 with the captions burned
                in, ready for Reels, or a subtitle file (SRT, VTT, ASS, plain text or JSON) for YouTube and
                other editors.
              </p>
            </li>
          </ol>
        </section>

        <section className="mt-16" aria-labelledby="styles-that-work">
          <h2 id="styles-that-work" className="font-sora text-[22px] font-bold">
            Styles that work on Reels
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            Big, bold words win on a phone screen. The key word on each line gets its own colour, box or motion,
            so the eye lands on it as it is spoken. Start from a Hormozi-style box, Karaoke Fill or Beast
            Bounce, or Luxe Serif, Neon, Comic or Retro 3D — then change fonts, colours, outlines, position and
            motion to match the video. The same captions also work for Shorts and TikTok: same 9:16 frame, same
            looks, same export.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="languages">
          <h2 id="languages" className="font-sora text-[22px] font-bold">
            Captions in your language
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            English, Hindi, Hinglish, Tamil, Telugu, Bengali, Marathi, Punjabi, Urdu, Spanish, French, German, Arabic and Portuguese. Hinglish captions use a Whisper model fine-tuned for Hindi-English speech. Mixed Hindi-English talking comes out as the Roman-script Hinglish creators actually post. Not as a translation.
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
            Free, with paid plans when you outgrow it
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            The free plan includes the full editor, all 150 looks and every AI tool. Paid plans raise the
            limits: more minutes, longer videos, bigger uploads. See{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/pricing">Pricing</Link>{" "}
            for the current plans in your currency. For the full tool, read the{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/auto-caption-generator">auto caption generator</Link>{" "}
            page.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="faq">
          <h2 id="faq" className="font-sora text-[22px] font-bold">
            Frequently asked questions
          </h2>
          <div className="mt-6 space-y-8">
            {REELS_FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-sora text-[16px] font-bold">{f.q}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-[#FFFFEB]/70">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-white/10 bg-[#1C1C1A] p-6 sm:p-8" aria-labelledby="closing">
          <h2 id="closing" className="font-serif text-2xl font-semibold">
            Caption your next Reel free
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
            Caption a Reel free
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
