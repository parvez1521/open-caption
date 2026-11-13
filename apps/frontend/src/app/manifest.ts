import type { MetadataRoute } from "next";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";

/**
 * Web app manifest — served by Next.js at /manifest.webmanifest.
 *
 * Icons are generated from the shipped logo mark (see /tmp/gen_icons.py
 * provenance in the PWA branch history; source geometry is
 * apps/frontend/src/app/icon.svg): the 192/512 "any" icons are the mark
 * itself, the "maskable" icons are the same mark on a full-bleed #141412
 * background scaled to the central 80% safe zone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141412",
    theme_color: "#141412",
    categories: ["photo", "productivity", "video"],
    icons: [
      {
        src: "/brand/captionit-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/captionit-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/captionit-icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/captionit-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
