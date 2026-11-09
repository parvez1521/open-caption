"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newId } from "@capseasy/shared";
import { validateMediaFile } from "./mediaAssets";
import { probeMediaFile } from "./mediaProbe";
import { deleteAsset, listProjectAssets, saveAsset, type MediaAssetRecord } from "./mediaStore";

export interface ImportError {
  name: string;
  error: string;
}

/**
 * The project's media bin: device-local assets (IndexedDB) with import / delete. Import is
 * per-file fault-tolerant — each file is validated, probed and stored on its own, and a failure
 * lands in `errors` under that file's name while the rest of the batch still imports.
 */
export function useMediaAssets(projectId: string | null) {
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [importing, setImporting] = useState(false);
  const pidRef = useRef(projectId);
  pidRef.current = projectId;

  const refresh = useCallback(async () => {
    if (!projectId) { setAssets([]); return; }
    const list = await listProjectAssets(projectId);
    if (pidRef.current === projectId) setAssets(list);
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const importFiles = useCallback(
    async (files: File[]): Promise<ImportError[]> => {
      if (!projectId || files.length === 0) return [];
      setImporting(true);
      const errors: ImportError[] = [];
      try {
        for (const file of files) {
          const v = validateMediaFile(file);
          if (!v.ok) { errors.push({ name: file.name, error: v.error }); continue; }
          try {
            const probed = await probeMediaFile(file, v.kind);
            await saveAsset({
              id: newId(),
              projectId,
              kind: v.kind,
              name: file.name,
              mime: file.type,
              size: file.size,
              durationMs: probed.durationMs,
              width: probed.width,
              height: probed.height,
              blob: file,
              thumb: probed.thumb,
              peaks: probed.peaks,
              createdAt: Date.now(),
            });
          } catch (e) {
            errors.push({ name: file.name, error: e instanceof Error ? e.message : "Couldn't import that file." });
          }
        }
      } finally {
        setImporting(false);
        await refresh();
      }
      return errors;
    },
    [projectId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteAsset(id);
      await refresh();
    },
    [refresh],
  );

  return { assets, importing, importFiles, remove, refresh };
}
