"use client";

/**
 * Generation deps for the Growth Studio weekly plan.
 *
 * This deliberately duplicates the small assembly in
 * features/studio/panels/ClipCreateControls.tsx (useClipTitleDeps):
 * importing a studio panel file into the growth page would tangle the
 * feature folders, and the assembly is tiny — cloud runner only when the
 * site reports its free AI configured, on-device model only when the
 * user opted in and it is ready.
 */
import { useEffect, useState } from "react";
import { fetchCloudAiStatus, runCloudModel } from "@/features/create/cloudAi";
import { onModelState, runLocalModel } from "@/features/create/localModel";
import type { GenerationDeps } from "@/features/create/service";

export function usePlanDeps(): GenerationDeps {
  const [cloudOn, setCloudOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchCloudAiStatus().then((status) => {
      if (alive) setCloudOn(!!status?.configured);
    });
    const off = onModelState((s) => setModelReady(s.status === "ready"));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return { runCloud: cloudOn ? runCloudModel : undefined, modelEnabled: modelReady, runModel: runLocalModel };
}
