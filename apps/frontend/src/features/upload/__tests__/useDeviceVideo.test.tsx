import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useDeviceVideo — the second-device path: a video with no local copy but a
 * server URL plays from that URL right away ("ready", not "missing") and the
 * bytes are cached into this browser's IndexedDB once, in the background,
 * so generate-captions and export work here too. A failed cache leaves the
 * stream in place; a video with no URL anywhere still reports "missing".
 */

const { getLocalVideo, saveLocalVideo } = vi.hoisted(() => ({
  getLocalVideo: vi.fn(),
  saveLocalVideo: vi.fn(),
}));
const { cacheRemoteVideo } = vi.hoisted(() => ({ cacheRemoteVideo: vi.fn() }));

vi.mock("../localVideos", () => ({ getLocalVideo, saveLocalVideo }));
vi.mock("../videoSync", () => ({ cacheRemoteVideo }));

import { useDeviceVideo } from "../useDeviceVideo";

const serverVideo = (over: Record<string, unknown> = {}) => ({
  id: "vid-1",
  status: "uploaded",
  url: null as string | null,
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 12000,
  hasAudio: true,
  filename: "reel.mp4",
  size: 10 * 1024 * 1024,
  local: true,
  ...over,
});

const realCreateObjectURL = URL.createObjectURL.bind(URL);
const realRevokeObjectURL = URL.revokeObjectURL.bind(URL);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  vi.clearAllMocks();
});

describe("useDeviceVideo — cloud copy fallback", () => {
  it("a local copy plays from IndexedDB and never triggers a cache", async () => {
    getLocalVideo.mockResolvedValue(new Blob(["local-bytes"]));
    const { result } = renderHook(() => useDeviceVideo(serverVideo()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.video?.url).toBe("blob:mock");
    expect(cacheRemoteVideo).not.toHaveBeenCalled();
  });

  it("no local copy + a server URL: streams from the URL at once, then caches it locally", async () => {
    let cached = false;
    let releaseCache: (() => void) | undefined;
    getLocalVideo.mockImplementation(async () => (cached ? new Blob(["cached-bytes"]) : null));
    cacheRemoteVideo.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseCache = () => {
            cached = true;
            resolve(true);
          };
        }),
    );
    const { result } = renderHook(() => useDeviceVideo(serverVideo({ url: "https://cdn.test/v.mp4" })));

    // playable immediately — the editor must not wait for the download
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.video?.url).toBe("https://cdn.test/v.mp4");
    await waitFor(() => expect(cacheRemoteVideo).toHaveBeenCalledTimes(1));
    expect(cacheRemoteVideo).toHaveBeenCalledWith("vid-1", "https://cdn.test/v.mp4");
    // once the cache lands, the local copy takes over playback
    releaseCache?.();
    await waitFor(() => expect(result.current.video?.url).toBe("blob:mock"));
  });

  it("a failed cache still leaves the server stream playing", async () => {
    getLocalVideo.mockResolvedValue(null);
    cacheRemoteVideo.mockResolvedValue(false);
    const { result } = renderHook(() => useDeviceVideo(serverVideo({ url: "https://cdn.test/v.mp4" })));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.video?.url).toBe("https://cdn.test/v.mp4");
    await waitFor(() => expect(cacheRemoteVideo).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("no local copy and no server URL: still missing, and nothing is fetched", async () => {
    getLocalVideo.mockResolvedValue(null);
    const { result } = renderHook(() => useDeviceVideo(serverVideo()));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.video?.url).toBeNull();
    expect(cacheRemoteVideo).not.toHaveBeenCalled();
  });
});
