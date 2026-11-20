import Link from "next/link";
import { Footer, Nav } from "@/components/home/Sections";
import { FaceSwapTool } from "@/features/faceswap/FaceSwapTool";

/**
 * /face-swap — put your face in any thumbnail, free and in your browser.
 *
 * The swap runs entirely on the visitor's own device: the thumbnail is
 * uploaded from their tab, the face comes from a live selfie (never an
 * uploaded photo, so nobody can swap someone else's face), and nothing
 * is sent anywhere. 5 swaps a day per browser, one at a time.
 *
 * Layout follows the other tool pages: dark background, one column,
 * stacked sections. No three-cards-in-a-row, no bento grid, no glass
 * card, no dot-grid background, no hover animation, no purple gradient.
 */
export default function FaceSwapPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Face swap</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">Put your face in any thumbnail</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[#FFFFEB]/80">
          Upload a thumbnail, take a live selfie, and see your face in it — free, in your browser. Your selfie is the only face that can be
          swapped in, and your images never leave this tab.
        </p>

        <div className="mt-10">
          <FaceSwapTool />
        </div>

        <section className="mt-16" aria-labelledby="how-face-swap-works">
          <h2 id="how-face-swap-works" className="font-sora text-[22px] font-bold">
            How it works
          </h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            <li>Upload your thumbnail. Faces in it are found on your device — pick the one to replace.</li>
            <li>Take a live selfie, facing the camera in good light. A photo upload is not accepted as the source face.</li>
            <li>Swap, compare before and after, and download the result as a PNG.</li>
          </ol>
        </section>

        <section className="mt-16" aria-labelledby="face-swap-limits">
          <h2 id="face-swap-limits" className="font-sora text-[22px] font-bold">
            Limits, stated plainly
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#FFFFEB]/70">
            5 swaps a day, one at a time, in this browser. Thumbnails are resized to 1280 px on the long edge. Front-facing faces in good
            light swap best — side profiles, sunglasses and poor light give poor results, and the swapped face will not be a perfect
            likeness. Only your own face, only your own thumbnail.
          </p>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/start"
            className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]"
          >
            Start free
          </Link>
          <Link
            href="/auto-caption-generator"
            className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 font-sora text-[14px] font-semibold text-[#FFFFEB]"
          >
            Auto caption generator
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
