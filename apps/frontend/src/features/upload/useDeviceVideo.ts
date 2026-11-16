"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioData } from "@/services/studio";
import { getLocalVideo, saveLocalVideo } from "./localVideos";
import { cacheRemoteVideo } from "./videoSync";

type ServerVideo = NonNullable<StudioData["video"]>;
export type DeviceVideoStatus = "none" | "loading" | "ready" | "missing";

/**
 * The project's video as this browser can play it: the copy saved on this device (IndexedDB) first, then a
 * server URL for older uploads that still exist — and for a synced cloud copy. "missing" means neither is
 * available (another device, cleared browser data, or an old upload that was cleaned up): the user picks
 * the same file again and editing continues.
 *
 * When the video only exists as a server URL, the bytes are also pulled into this browser's IndexedDB in
 * the background (once per video), so generate-captions and export work here exactly as on the first
 * device. Playback streams from the server URL meanwhile; a failed cache just leaves the stream in place.
 */
export function useDeviceVideo(server: ServerVideo | null) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const cacheTriedFor = useRef<string | null>(null);
  const id = server?.id ?? null;
  const remoteUrl = server?.url ?? null;

  // the on-device copy: the only source the editor trusts for captions/export
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void getLocalVideo(id).then((blob) => {
      if (!alive) return;
      if (blob) {
        if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = URL.createObjectURL(blob);
        setLocalUrl(localUrlRef.current);
      }
      setChecked(id);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // a cloud copy is available and this browser has no local copy yet: cache it once per video
  useEffect(() => {
    if (!id || !remoteUrl || cacheTriedFor.current === id) return;
    let alive = true;
    void getLocalVideo(id).then((blob) => {
      if (!alive || blob) return;
      cacheTriedFor.current = id;
      void cacheRemoteVideo(id, remoteUrl).then(async (cached) => {
        if (!alive || !cached) return;
        const fresh = await getLocalVideo(id);
        if (!alive || !fresh) return;
        if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = URL.createObjectURL(fresh);
        setLocalUrl(localUrlRef.current);
      });
    });
    return () => {
      alive = false;
    };
  }, [id, remoteUrl]);

  // the object URL belongs to this video: drop it when the video changes or the editor unmounts
  useEffect(
    () => () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    },
    [id],
  );

  /** the user picked the file again on this device */
  const attach = useCallback(
    async (file: File) => {
      if (!id) return;
      await saveLocalVideo(id, file);
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = URL.createObjectURL(file);
      setLocalUrl(localUrlRef.current);
      setChecked(id);
    },
    [id],
  );

  const status: DeviceVideoStatus = !server ? "none" : checked !== id ? "loading" : localUrl || server.url ? "ready" : "missing";
  const video: ServerVideo | null = server ? { ...server, url: localUrl ?? server.url } : null;
  return { video, status, attach };
}
