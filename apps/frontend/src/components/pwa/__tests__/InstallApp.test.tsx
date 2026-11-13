import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InstallApp } from "../InstallApp";
import type { InstallPromptEvent } from "@/features/pwa/installPrompt";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function setBrowser(userAgent: string, standalone: boolean) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: 0,
    configurable: true,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function installPromptEvent(outcome: "accepted" | "dismissed"): InstallPromptEvent {
  const event = new Event("beforeinstallprompt") as InstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InstallApp", () => {
  it("renders nothing on desktop with no install prompt", () => {
    setBrowser(DESKTOP_UA, false);
    const { container } = render(<InstallApp />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when already installed (standalone mode)", () => {
    setBrowser(IPHONE_UA, true);
    const { container } = render(<InstallApp />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows iOS Add to Home Screen instructions on iPhone Safari", () => {
    setBrowser(IPHONE_UA, false);
    render(<InstallApp />);
    expect(screen.getByText("Install on iPhone")).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText("Install app")).not.toBeInTheDocument();
  });

  it("shows the Install button on beforeinstallprompt and hides it once accepted", async () => {
    setBrowser(DESKTOP_UA, false);
    render(<InstallApp />);
    const event = installPromptEvent("accepted");
    fireEvent(window, event);
    const button = await screen.findByText("Install app");
    expect(button).toBeInTheDocument();
    expect(screen.getByText(/Works offline once loaded/)).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByText("Install app")).not.toBeInTheDocument());
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it("hides the button again when the user dismisses the prompt", async () => {
    setBrowser(DESKTOP_UA, false);
    render(<InstallApp />);
    fireEvent(window, installPromptEvent("dismissed"));
    const button = await screen.findByText("Install app");
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByText("Install app")).not.toBeInTheDocument());
  });
});
