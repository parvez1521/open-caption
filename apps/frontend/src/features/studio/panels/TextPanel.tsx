"use client";

import React from "react";
import type { OverlayItem, ProjectSettings } from "@capseasy/shared";
import type { MediaAssetRecord } from "../mediaStore";
import type { ImportError } from "../useMediaAssets";
import { Button, Section } from "../controls";
import { overlayItemsOf, type Composition } from "../composition";
import { OverlayEditor, OverlayRow } from "./OverlayEditor";
import { makeTextOverlay } from "./overlayItems";
import { TitleCardControl } from "./TitleCardControl";

export interface OverlayPanelProps {
  settings: ProjectSettings;
  patch: (p: Partial<ProjectSettings>) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  getTimeMs: () => number;
  durationMs: number;
  /** the Stage-A composition view — lists read from it; writes still go through `patch` */
  composition?: Composition | null;
  /** the project's device-local media bin, for the social-overlay avatar/QR asset picker in
   *  OverlayEditor (optional: panels mounted without a bin simply don't offer the picker) */
  mediaAssets?: MediaAssetRecord[];
  onImportMedia?: (files: File[]) => Promise<ImportError[]>;
}

export interface TextPanelProps extends OverlayPanelProps {
  /** A5 (Phase 5): the auto title card — transcript + project title for the routed
   *  generation, and an optional composition-commit placer (StudioPage supplies it so
   *  the place is one undo step through the composition path; absent = the panel's
   *  own settings patch, exactly like "Add text"). Optional: existing mounts unchanged. */
  titleCard?: {
    sourceTitle: string;
    transcriptText: string;
    onPlace?: (item: OverlayItem) => void;
  };
}

/** Text: timed text overlays. They render above the video (below the captions) in the preview and the exported MP4. */
export const TextPanel: React.FC<TextPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition, titleCard }) => {
  const texts = composition ? overlayItemsOf(composition, "text") : settings.overlays.filter((o) => o.kind === "text");
  const selected = texts.find((o) => o.id === selectedId) ?? null;
  const replace = (next: OverlayItem) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) });
  const add = () => {
    const item = makeTextOverlay(getTimeMs(), durationMs);
    patch({ overlays: [...settings.overlays, item] });
    onSelect(item.id);
  };
  const placeTitleCard = (item: OverlayItem) => {
    if (titleCard?.onPlace) titleCard.onPlace(item);
    else patch({ overlays: [...settings.overlays, item] });
    onSelect(item.id);
  };
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Text overlays" hint="Text that appears over the video at a set time, and is burned into the exported MP4.">
        {titleCard ? (
          <TitleCardControl
            sourceTitle={titleCard.sourceTitle}
            transcriptText={titleCard.transcriptText}
            durationMs={durationMs}
            onPlace={placeTitleCard}
          />
        ) : null}
        <Button tone="primary" onClick={add} className="w-full">Add text</Button>
        {texts.length ? (
          <div className="space-y-1.5">
            {texts.map((o) => (
              <OverlayRow key={o.id} item={o} label={o.text?.trim() || "Your text"} selected={o.id === selectedId} onSelect={() => onSelect(o.id === selectedId ? null : o.id)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-st-faint">No text overlays yet. Add one and it starts at the playhead, for three seconds.</p>
        )}
      </Section>
      {selected ? (
        <OverlayEditor
          item={selected}
          onChange={replace}
          onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
        />
      ) : null}
    </div>
  );
};
