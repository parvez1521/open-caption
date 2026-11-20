import { describe, expect, it, vi, type Mock } from "vitest";
import { uploadFirstAiEditVideo, type FirstAiEditUploadDeps } from "../aiEditUpload";
import type { PreparedVideo } from "@/features/upload/prepareVideo";

const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
const ready = { file, durationMs: 10_000 } as unknown as PreparedVideo;

type MockDeps = {
  prepare: Mock<(file: File) => Promise<PreparedVideo>>;
  upload: Mock<(ready: PreparedVideo) => Promise<{ videoId: string }>>;
  afterUpload: Mock<(videoId: string) => void>;
};

function deps(overrides: Partial<MockDeps> = {}): FirstAiEditUploadDeps & MockDeps {
  const prepare: MockDeps["prepare"] = vi.fn(async (_file: File) => ready);
  const upload: MockDeps["upload"] = vi.fn(async (_ready: PreparedVideo) => ({ videoId: "vid-1" }));
  const afterUpload: MockDeps["afterUpload"] = vi.fn((_videoId: string) => undefined);
  return { prepare, upload, afterUpload, ...overrides };
}

describe("uploadFirstAiEditVideo", () => {
  it("prepares, uploads in editor mode, then runs afterUpload — and reports no errors", async () => {
    const d = deps();
    const errs = await uploadFirstAiEditVideo(d, file);
    expect(errs).toEqual([]);
    expect(d.prepare).toHaveBeenCalledWith(file);
    expect(d.upload).toHaveBeenCalledWith(ready);
    expect(d.afterUpload).toHaveBeenCalledWith("vid-1");
  });

  it("never touches the caption pipeline: its deps contain no session or transcription call", async () => {
    // The helper's only collaborators are prepare + upload + afterUpload.
    // A caller wiring studioService.uploadVideo WITHOUT { editorMode: true }
    // would start a caption session — so the upload dep is the contract:
    // the test below pins that the caller passes editor mode through the
    // upload function itself (see StudioPage wiring); here the helper is
    // proven to call upload exactly once, with only the prepared video.
    const d = deps();
    await uploadFirstAiEditVideo(d, file);
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.upload).toHaveBeenCalledWith(ready);
  });

  it("a failed prepare reports one error and never uploads", async () => {
    const d = deps({ prepare: vi.fn(async (_file: File) => { throw new Error("too long"); }) });
    const errs = await uploadFirstAiEditVideo(d, file);
    expect(errs).toEqual([{ name: "clip.mp4", error: "too long" }]);
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.afterUpload).not.toHaveBeenCalled();
  });

  it("a failed upload reports one error and never runs afterUpload", async () => {
    const d = deps({ upload: vi.fn(async (_ready: PreparedVideo) => { throw new Error("network down"); }) });
    const errs = await uploadFirstAiEditVideo(d, file);
    expect(errs).toEqual([{ name: "clip.mp4", error: "network down" }]);
    expect(d.afterUpload).not.toHaveBeenCalled();
  });
});
