"use client";

import React from "react";
import { Section } from "../controls";
import { StockAudioSection } from "./StockAudioSection";

export interface SoundEffectsPanelProps {
  /** the project whose bin stock imports land in */
  projectId: string | null;
  /** bin refresh for when a stock sound lands */
  onAdded?: () => void;
}

/**
 * Sound Effects: the stock-audio home of the editor — its own rail section, split out of the
 * Media panel (owner order 2026-11-11) so the Media bin is the project's own files only.
 * Everything inside is the existing StockAudioSection unchanged: the bundled CC0 starter SFX
 * pack and Pixabay browse-import, both landing in the project's media bin with their licence
 * records attached — the Audio panel and exports then treat them like any imported file.
 */
export const SoundEffectsPanel: React.FC<SoundEffectsPanelProps> = ({ projectId, onAdded }) => (
  <div className="h-full overflow-y-auto">
    <Section
      title="Sound effects"
      more="The starter pack is CC0 — free for any use. Pixabay imports use your own free Pixabay key and are stored on this device only, each with its licence record."
    >
      <StockAudioSection projectId={projectId} onAdded={onAdded} tone="studio" />
    </Section>
  </div>
);
