import React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * AI Generator component tests. window.puter is mocked — no real Puter
 * account, no network, no sign-in is ever performed here. The mocks mirror
 * the documented SDK shapes: chat resolves with message.content, txt2img
 * with an HTMLImageElement, txt2vid with an HTMLVideoElement carrying src.
 */

import AiGenerator from "../AiGenerator";
import type { PuterGlobal } from "../puter";

interface MockPuter {
  ai: { chat: Mock; txt2img: Mock; txt2vid: Mock };
  auth: { isSignedIn: () => boolean; signIn: Mock };
}

function mockPuter(overrides: Partial<MockPuter["ai"]> & Partial<MockPuter["auth"]> = {}): MockPuter {
  const chat =
    overrides.chat ??
    vi.fn(async () => ({ message: { content: "Hello from Puter" } }));
  const txt2img =
    overrides.txt2img ??
    vi.fn(async () => {
      const img = document.createElement("img");
      img.src = "blob:https://example.test/generated-image";
      return img;
    });
  const txt2vid =
    overrides.txt2vid ??
    vi.fn(async () => {
      const video = document.createElement("video");
      video.src = "https://example.test/clip.mp4";
      return video;
    });
  const signIn = overrides.signIn ?? vi.fn(async () => undefined);
  const isSignedIn = overrides.isSignedIn ?? (() => false);
  const puter: MockPuter = { ai: { chat, txt2img, txt2vid }, auth: { isSignedIn, signIn } };
  window.puter = puter as unknown as PuterGlobal;
  return puter;
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
});

afterEach(() => {
  delete window.puter;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AiGenerator", () => {
  it("renders all three modes as toggle buttons, Text first, with a prompt and Generate button", () => {
    mockPuter();
    render(<AiGenerator />);
    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Image" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Video" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText(/What should it write\?/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate text" })).toBeTruthy();
  });

  it("text mode: generates, shows the reply and copies it", async () => {
    const puter = mockPuter();
    render(<AiGenerator />);
    fireEvent.change(screen.getByLabelText(/What should it write\?/), { target: { value: "Write a hook" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate text" }));
    expect(await screen.findByText("Hello from Puter")).toBeTruthy();
    expect(puter.ai.chat).toHaveBeenCalledWith("Write a hook", { normalize: true });
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello from Puter");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("text mode: handles the array content shape", async () => {
    mockPuter({
      chat: vi.fn(async () => ({
        message: { content: [{ type: "text", text: "Part one. " }, { type: "text", text: "Part two." }] },
      })),
    });
    render(<AiGenerator />);
    fireEvent.change(screen.getByLabelText(/What should it write\?/), { target: { value: "Say something" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate text" }));
    expect(await screen.findByText("Part one. Part two.")).toBeTruthy();
  });

  it("image mode: generates and shows the image with a download link", async () => {
    const puter = mockPuter();
    render(<AiGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(screen.getByLabelText(/What should it draw\?/), { target: { value: "A red robot" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate image" }));
    const img = (await screen.findByAltText("Image generated from your prompt")) as HTMLImageElement;
    expect(img.src).toContain("blob:https://example.test/generated-image");
    expect(puter.ai.txt2img).toHaveBeenCalledWith("A red robot", { model: "qwen/qwen-image" });
    const download = screen.getByRole("link", { name: "Download image" });
    expect(download).toHaveAttribute("href", "blob:https://example.test/generated-image");
    expect(download).toHaveAttribute("download", "captionit-ai-image.png");
  });

  it("video mode: warns about allowance, calls txt2vid with modest defaults, shows the clip with controls and download", async () => {
    const puter = mockPuter();
    render(<AiGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    expect(screen.getByText(/Video uses much more of your Puter allowance than text or images/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/What should the clip show\?/), { target: { value: "A forest at sunrise" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    await screen.findByText(/Download video/);
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.src).toContain("https://example.test/clip.mp4");
    expect(video.controls).toBe(true);
    // Modest defaults: 5 seconds at 720P — the documented Wan 2.7 defaults,
    // so a visitor's free allowance lasts. No model name is hardcoded.
    expect(puter.ai.txt2vid).toHaveBeenCalledWith("A forest at sunrise", { seconds: 5, size: "720P" });
    expect(puter.ai.txt2vid.mock.calls[0]?.[1]).not.toHaveProperty("model");
    const download = screen.getByRole("link", { name: "Download video" });
    expect(download).toHaveAttribute("href", "https://example.test/clip.mp4");
    expect(download).toHaveAttribute("download", "captionit-ai-video.mp4");
    // Honest waiting state: no fake progress bar anywhere on the page.
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("video mode: a failed generation shows the real error with a retry button", async () => {
    const puter = mockPuter();
    puter.ai.txt2vid.mockRejectedValueOnce({ message: "Provider timed out", code: "upstream_timeout" });
    render(<AiGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    fireEvent.change(screen.getByLabelText(/What should the clip show\?/), { target: { value: "A forest" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    expect(await screen.findByText("Provider timed out (upstream_timeout)")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    expect(await screen.findByText(/Download video/)).toBeTruthy();
    expect(puter.ai.txt2vid).toHaveBeenCalledTimes(2);
  });

  it("shows a sign-in affordance when signed out and signs in from the click", async () => {
    const puter = mockPuter();
    render(<AiGenerator />);
    const signInButton = await screen.findByRole("button", { name: "Sign in with Puter" });
    expect(signInButton).toBeTruthy();
    expect(screen.getByText(/press Generate below/)).toBeTruthy();
    fireEvent.click(signInButton);
    expect(puter.auth.signIn).toHaveBeenCalledTimes(1);
  });

  it("blank prompt is refused client-side and never calls the SDK", () => {
    const puter = mockPuter();
    render(<AiGenerator />);
    fireEvent.click(screen.getByRole("button", { name: "Generate text" }));
    expect(screen.getByText("Describe what you want first.")).toBeTruthy();
    expect(puter.ai.chat).not.toHaveBeenCalled();
  });

  it("a failed text generation shows the real error with a retry button", async () => {
    const puter = mockPuter();
    puter.ai.chat.mockRejectedValueOnce(new Error("sign-in cancelled"));
    render(<AiGenerator />);
    fireEvent.change(screen.getByLabelText(/What should it write\?/), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate text" }));
    expect(await screen.findByText("sign-in cancelled")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Hello from Puter")).toBeTruthy();
  });

  it("SDK-unreachable state when Puter.js never appears", async () => {
    // No window.puter and no script load: the component polls for the SDK
    // and, after 10 s with nothing, says so honestly instead of spinning —
    // with a retry that waits again instead of leaving the page dead.
    vi.useFakeTimers();
    render(<AiGenerator />);
    expect(document.querySelector('script[src="https://js.puter.com/v2/"]')).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(11000);
    });
    expect(screen.getByText(/Puter\.js could not be loaded — check your connection and try again\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try loading again" }));
    expect(screen.getByText("Loading Puter.js…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(11000);
    });
    vi.useRealTimers();
    expect(screen.getByText(/Puter\.js could not be loaded — check your connection and try again\./)).toBeTruthy();
  });

  it("never renders mock output or an 'unlimited free' claim", () => {
    mockPuter();
    render(<AiGenerator />);
    expect(document.body.textContent?.toLowerCase()).not.toContain("unlimited");
    expect(document.body.textContent).not.toContain("sample");
  });
});
