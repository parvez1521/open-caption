import type { Metadata } from "next";
import { statSync } from "node:fs";
import { join } from "node:path";
import { pageMetadata } from "@/lib/seo";
import { Footer, Nav } from "@/components/home/Sections";

/**
 * Minimal downloads page (production-pages audit): the free Android app
 * (TWA) as a direct APK download. The file size is read from the real
 * file on disk at build time — never hardcoded — so the page cannot drift
 * from the file it links to. No version number or checksum is published:
 * neither is recorded for this file.
 */
export const metadata: Metadata = pageMetadata({
  title: "Download the Android App",
  description: "Get Captionit for Android as a free APK download. Captions, looks and MP4 export in your browser, wrapped as an app.",
  path: "/downloads",
});

function apkSizeLabel(): string {
  try {
    const bytes = statSync(join(process.cwd(), "public", "downloads", "captionit.apk")).size;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  } catch {
    return "";
  }
}

export default function DownloadsPage() {
  const size = apkSizeLabel();
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Downloads</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Captionit for Android
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[#FFFFEB]/80">
          The same free in-browser studio, wrapped as an Android app. No account needed to start; exports need a free account.
        </p>
        <div className="mt-10 rounded-2xl border border-[#FFFFEB]/10 bg-[#1E1E1B] p-6">
          <p className="font-sora text-[15px] font-bold">Captionit APK{size ? <span className="ml-2 font-normal text-[#FFFFEB]/60">({size})</span> : null}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[#FFFFEB]/70">Free. Works on Android phones and tablets.</p>
          <a
            href="/downloads/captionit.apk"
            download
            className="mt-5 inline-block rounded-full bg-[#34D399] px-6 py-3 text-sm font-semibold text-[#141412]"
          >
            Download the APK
          </a>
        </div>
        <h2 className="mt-12 text-xl font-bold tracking-tight">How to install</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-[#FFFFEB]/75">
          <li>Tap &ldquo;Download the APK&rdquo; above on your Android phone.</li>
          <li>Open the downloaded file. If Android asks, allow installation from your browser.</li>
          <li>Open Captionit from your app drawer and start captioning.</li>
        </ol>
        <p className="mt-8 text-[14px] leading-relaxed text-[#FFFFEB]/60">
          Prefer the browser instead? Captionit runs fully at captionit.in — nothing to install.
        </p>
      </main>
      <Footer />
    </div>
  );
}
