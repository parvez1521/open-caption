import type { Metadata } from "next";
import { faqPageJsonLd, pageMetadata, SITE_URL, softwareApplicationJsonLd } from "@/lib/seo";
import { IMAGE_EDITOR_FAQS } from "./faqs";

export const metadata: Metadata = pageMetadata({
  title: "Image Elements Editor — Edit Any Object or Text in a Photo",
  description:
    "Upload any photo, click an object or a line of text, and change its colour, size or place — free, in your browser. No layers to learn, no upload, no watermark.",
  path: "/image-editor",
});

const structuredData = [softwareApplicationJsonLd({ url: `${SITE_URL}/image-editor` }), faqPageJsonLd(IMAGE_EDITOR_FAQS)];

export default function ImageEditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}
