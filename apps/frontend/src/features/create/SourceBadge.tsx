"use client";

import React from "react";
import type { Source } from "./model";
import { sourceBadge } from "./model";

/** The visible source badge on every batch of generated output. Wording lives in model.ts only. */
export function SourceBadge({ source }: { source: Source }) {
  const isModel = source !== "template"; // cloud and local are both real models; the template engine is not
  return (
    <span
      data-source={source}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sora text-[11px] font-semibold ${
        isModel ? "border-emerald-accent/60 bg-emerald-accent/10 text-ink" : "border-sand-300 bg-sand-100 text-sand-800"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isModel ? "bg-emerald-accent" : "bg-sand-500"}`} />
      {sourceBadge(source)}
    </span>
  );
}
