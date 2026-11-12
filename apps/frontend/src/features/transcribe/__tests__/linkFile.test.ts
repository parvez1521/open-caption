import { describe, expect, it } from "vitest";
import { linkFileName } from "../linkFile";

/** Naming for a fetched link file: the URL's media filename wins, else the served content-type, else a plain name. */
describe("linkFileName", () => {
  it("uses the URL's last segment when it looks like media", () => {
    expect(linkFileName(new URL("https://cdn.example.com/clip.mp4"), "video/mp4")).toBe("clip.mp4");
    expect(linkFileName(new URL("https://cdn.example.com/AUDIO.MP3?x=1"), "audio/mpeg")).toBe("AUDIO.MP3");
  });

  it("names a link with no media filename from its content-type", () => {
    expect(linkFileName(new URL("https://cdn.example.com/download?id=7"), "audio/mpeg")).toBe("transcribed-file.mp3");
    expect(linkFileName(new URL("https://cdn.example.com/download?id=7"), "video/webm; codecs=vp9")).toBe("transcribed-file.webm");
  });

  it("falls back to a plain mp4 name with no filename and no known type", () => {
    expect(linkFileName(new URL("https://cdn.example.com/download"), null)).toBe("transcribed-file.mp4");
    expect(linkFileName(new URL("https://cdn.example.com/download"), "application/octet-stream")).toBe("transcribed-file.mp4");
  });
});
