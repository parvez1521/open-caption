import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * videoSync: the background cloud-copy flow. The server and storage are
 * faked — these pin the orchestration: request → PUT → confirm, and that a
 * failure anywhere leaves the local copy untouched (no confirm after a
 * failed PUT, no PUT after an already-synced answer).
 */

const { requestVideoSync, confirmVideoSync } = vi.hoisted(() => ({
  requestVideoSync: vi.fn(),
  confirmVideoSync: vi.fn(),
}));
const { ensureRoomFor, saveLocalVideo } = vi.hoisted(() => ({
  ensureRoomFor: vi.fn(),
  saveLocalVideo: vi.fn(),
}));

vi.mock("@/services/studio", () => ({ studioService: { requestVideoSync, confirmVideoSync } }));
vi.mock("../localVideos", () => ({ ensureRoomFor, saveLocalVideo }));

import { cacheRemoteVideo, syncStatusFor, syncVideoToCloud, VideoSyncError } from "../videoSync";

const MB = 1024 * 1024;
const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("syncVideoToCloud", () => {
  it("requests a URL, PUTs the bytes, confirms — and only then is the copy recorded", async () => {
    requestVideoSync.mockResolvedValue({ synced: false, videoId: "vid-1", uploadUrl: "https://storage.test/upload/vid-1.mp4", token: "tok-1", syncCapBytes: 50 * MB });
    fetchMock.mockResolvedValue({ ok: true });
    confirmVideoSync.mockResolvedValue({ synced: true, videoId: "vid-1", path: "u/p/cloud/vid-1.mp4" });
    vi.stubGlobal("fetch", fetchMock);
    const file = new Blob(["video-bytes"], { type: "video/mp4" });

    await syncVideoToCloud({ videoId: "vid-1", file });

    expect(requestVideoSync).toHaveBeenCalledWith("vid-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.test/upload/vid-1.mp4",
      expect.objectContaining({ method: "PUT", body: file }),
    );
    expect(confirmVideoSync).toHaveBeenCalledWith("vid-1");
  });

  it("already synced: no PUT, no confirm — the local copy is never re-sent", async () => {
    requestVideoSync.mockResolvedValue({ synced: true, videoId: "vid-1", syncCapBytes: 50 * MB });
    vi.stubGlobal("fetch", fetchMock);

    await syncVideoToCloud({ videoId: "vid-1", file: new Blob(["x"]) });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmVideoSync).not.toHaveBeenCalled();
  });

  it("no upload URL: throws upload-failed and never confirms", async () => {
    requestVideoSync.mockResolvedValue({ synced: false, videoId: "vid-1", uploadUrl: null, syncCapBytes: 50 * MB });
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncVideoToCloud({ videoId: "vid-1", file: new Blob(["x"]) })).rejects.toMatchObject({
      code: "upload-failed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmVideoSync).not.toHaveBeenCalled();
  });

  it("PUT rejected by storage: throws upload-failed and never confirms (local copy untouched)", async () => {
    requestVideoSync.mockResolvedValue({ synced: false, videoId: "vid-1", uploadUrl: "https://storage.test/upload/vid-1.mp4", syncCapBytes: 50 * MB });
    fetchMock.mockResolvedValue({ ok: false, status: 413 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncVideoToCloud({ videoId: "vid-1", file: new Blob(["x"]) })).rejects.toMatchObject({
      code: "upload-failed",
    });
    expect(confirmVideoSync).not.toHaveBeenCalled();
  });

  it("PUT throws (offline): throws upload-failed and never confirms", async () => {
    requestVideoSync.mockResolvedValue({ synced: false, videoId: "vid-1", uploadUrl: "https://storage.test/upload/vid-1.mp4", syncCapBytes: 50 * MB });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncVideoToCloud({ videoId: "vid-1", file: new Blob(["x"]) })).rejects.toMatchObject({
      code: "upload-failed",
    });
    expect(confirmVideoSync).not.toHaveBeenCalled();
  });

  it("confirm fails after a good PUT: throws confirm-failed (the copy can be confirmed by a retry)", async () => {
    requestVideoSync.mockResolvedValue({ synced: false, videoId: "vid-1", uploadUrl: "https://storage.test/upload/vid-1.mp4", syncCapBytes: 50 * MB });
    fetchMock.mockResolvedValue({ ok: true });
    confirmVideoSync.mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncVideoToCloud({ videoId: "vid-1", file: new Blob(["x"]) })).rejects.toMatchObject({
      code: "confirm-failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("VideoSyncError carries its code", () => {
    expect(new VideoSyncError("too-large", "too big").code).toBe("too-large");
  });
});

describe("syncStatusFor", () => {
  it("synced wins; over the cap is too-large; anything else is unsynced", () => {
    expect(syncStatusFor({ cloudSynced: true, size: 60 * MB, syncMaxBytes: 50 * MB })).toBe("synced");
    expect(syncStatusFor({ cloudSynced: false, size: 60 * MB, syncMaxBytes: 50 * MB })).toBe("too-large");
    expect(syncStatusFor({ cloudSynced: false, size: 50 * MB, syncMaxBytes: 50 * MB })).toBe("unsynced");
    expect(syncStatusFor({ cloudSynced: false, size: 10 * MB, syncMaxBytes: 50 * MB })).toBe("unsynced");
    expect(syncStatusFor({})).toBe("unsynced");
  });
});

describe("cacheRemoteVideo", () => {
  it("downloads the cloud copy into IndexedDB and reports success", async () => {
    const blob = new Blob(["remote-bytes"]);
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);

    await expect(cacheRemoteVideo("vid-1", "https://cdn.test/v.mp4")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.test/v.mp4");
    expect(ensureRoomFor).toHaveBeenCalledWith(blob.size);
    expect(saveLocalVideo).toHaveBeenCalledWith("vid-1", blob);
  });

  it("a failed download reports false and saves nothing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(cacheRemoteVideo("vid-1", "https://cdn.test/v.mp4")).resolves.toBe(false);
    expect(saveLocalVideo).not.toHaveBeenCalled();
  });

  it("a failed local save reports false", async () => {
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
    saveLocalVideo.mockRejectedValue(new Error("quota"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cacheRemoteVideo("vid-1", "https://cdn.test/v.mp4")).resolves.toBe(false);
  });
});
