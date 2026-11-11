"use client";

import React from "react";
import Link from "next/link";
import { useStudio } from "@/features/studio/useStudio";
import { useDeviceVideo } from "@/features/upload/useDeviceVideo";
import { useWaveform } from "@/features/studio/useWaveform";
import { ClipperPanel } from "@/features/studio/panels/ClipperPanel";

/**
 * Package 3 item I.1 — the standalone Clipper workspace body: the SAME ClipperPanel the
 * Studio used to embed, fed from the same hooks the Studio page uses (useStudio for the
 * project + caption doc, useDeviceVideo for the on-device file, useWaveform for peaks).
 * One implementation, two doors — the Studio now links here instead of embedding it.
 *
 * Honest states: no video yet, or no captions yet, say so and point at the project —
 * uploading and transcription still happen in the project's Studio, as they always have.
 */
export const ClipperWorkspace: React.FC<{ projectId: string }> = ({ projectId }) => {
  const s = useStudio(projectId);
  const { data } = s;
  const device = useDeviceVideo(data?.video ?? null);
  const video = device.video;
  const wave = useWaveform(video?.id, video?.url, video?.size);

  if (s.query.isLoading) return <p className="text-sm text-sand-700">Loading the project…</p>;
  if (!data) return <p className="text-sm text-sand-700">This project could not be found.</p>;
  if (!data.video) {
    return (
      <div className="text-sm text-sand-700">
        <p>This project has no video yet.</p>
        <Link href={`/projects/${projectId}`} className="mt-2 inline-block font-semibold text-ink underline decoration-emerald-accent decoration-2 underline-offset-4">
          Open the project to add one
        </Link>
      </div>
    );
  }
  if (!s.doc) {
    return (
      <div className="text-sm text-sand-700">
        <p>No captions yet — clip suggestions are measured from the transcript, so this video needs its captions first.</p>
        <Link href={`/projects/${projectId}`} className="mt-2 inline-block font-semibold text-ink underline decoration-emerald-accent decoration-2 underline-offset-4">
          Open the project to caption it
        </Link>
      </div>
    );
  }
  return (
    <div className="h-[720px] max-h-[75vh] overflow-hidden rounded-2xl bg-[#141412]">
      <ClipperPanel
        projectId={projectId}
        sourceTitle={data.project.title}
        sourceVideoId={data.video?.id ?? null}
        mediaDurationMs={data.video?.durationMs ?? video?.durationMs ?? 0}
        doc={s.doc}
        peaks={wave.peaks}
        videoUrl={video?.url ?? null}
        sourceWidth={data.video?.width ?? null}
        sourceHeight={data.video?.height ?? null}
        sourceUrl={video?.url ?? null}
      />
    </div>
  );
};
