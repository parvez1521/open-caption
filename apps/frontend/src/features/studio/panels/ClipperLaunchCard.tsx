"use client";

import React from "react";
import { Section } from "../controls";

/**
 * Package 3 item I.1 — the Studio's Clipper panel is now a LAUNCH CARD: the Clipper
 * itself is a standalone workspace at /clipper (its own tab), so leaving the editor
 * mid-edit is never required. This card is the whole in-Studio surface: header, one
 * line, one button.
 */
export const ClipperLaunchCard: React.FC<{ projectId: string }> = ({ projectId }) => (
  <div className="h-full overflow-y-auto">
    <Section title="Clipper">
      <p className="text-sm text-st-muted">Turn this video&apos;s strongest moments into separate captioned projects.</p>
      <a
        href={`/clipper?project=${projectId}`}
        target="_blank"
        rel="noopener"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-st-ink px-3 py-1.5 text-sm font-medium text-st-panel transition hover:bg-st-ink/85"
      >
        Open Clipper
      </a>
      <p className="mt-2 text-xs text-st-faint">Opens in a new tab — this editor stays as it is.</p>
    </Section>
  </div>
);
