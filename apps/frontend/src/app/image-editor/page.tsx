import Link from "next/link";
import ImageEditor from "@/features/image-editor/ImageEditor";
import { Footer, Nav } from "@/components/home/Sections";
import { IMAGE_EDITOR_FAQS } from "./faqs";

/**
 * /image-editor — standalone image elements editor (owner 2026-11-18).
 * Upload any photo, press "Edit elements", click an object or a line of text
 * and change it. Everything runs in the tab (SAM segmentation + Tesseract
 * OCR, both in-browser, no upload, no paid API). The page is public, no
 * login. Layout follows the other tool pages: dark background, one column,
 * Nav on top, Footer at the bottom.
 */
export default function ImageEditorPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content">
        <ImageEditor />
        <div className="mx-auto max-w-6xl px-5 pb-24">
          <section className="mt-4" aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="font-sora text-[22px] font-bold">
              How it works
            </h2>
            <ol className="mt-6 space-y-6">
              <li>
                <h3 className="font-sora text-[16px] font-bold">1. Drop in a photo</h3>
                <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#FFFFEB]/70">
                  PNG, JPG or WebP. The file is read by your browser and never uploaded anywhere.
                </p>
              </li>
              <li>
                <h3 className="font-sora text-[16px] font-bold">2. Press “Edit elements”</h3>
                <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#FFFFEB]/70">
                  Two free models run in your tab: one finds objects, the other reads text. The models download once
                  and then stay on your device.
                </p>
              </li>
              <li>
                <h3 className="font-sora text-[16px] font-bold">3. Click, change, download</h3>
                <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#FFFFEB]/70">
                  Click an object to recolour, move, duplicate or delete it. Click a line of text to rewrite it.
                  Every change is a layer you can hide, reorder or undo. Download a PNG when it looks right.
                </p>
              </li>
            </ol>
          </section>

          <section className="mt-16" aria-labelledby="image-editor-faq">
            <h2 id="image-editor-faq" className="font-sora text-[22px] font-bold">
              Questions, answered
            </h2>
            <div className="mt-6 space-y-6">
              {IMAGE_EDITOR_FAQS.map((f) => (
                <div key={f.q}>
                  <h3 className="font-sora text-[16px] font-bold">{f.q}</h3>
                  <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[#FFFFEB]/70">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="mt-16 text-[14px] text-[#FFFFEB]/60">
            Also free in your browser:{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/auto-caption-generator">
              Auto caption generator
            </Link>{" "}
            and{" "}
            <Link className="underline decoration-[#34D399]/60 underline-offset-2" href="/transcribe">
              Transcribe
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
