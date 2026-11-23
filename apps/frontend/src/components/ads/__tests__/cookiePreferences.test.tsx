import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConsentBanner } from "../ConsentBanner";
import { CookiePreferencesControl } from "../CookiePreferences";
import { AD_CONSENT_KEY, AD_CONSENT_REOPEN_EVENT, readAdConsent, requestAdConsentReopen } from "@/lib/adConsent";

/**
 * Production-pages audit, cookie preferences: the stored ad-consent choice
 * must be visible and changeable in the product — not only by clearing
 * site data. The control writes the same `captionit-ad-consent` key the
 * banner writes, and the banner re-opens on the reopen event.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("CookiePreferencesControl", () => {
  it("shows no choice yet when nothing is stored", () => {
    render(<CookiePreferencesControl />);
    expect(screen.getByText(/have not made an advertising choice yet/)).toBeTruthy();
  });

  it("Allow persists accepted and shows the current choice", () => {
    render(<CookiePreferencesControl />);
    fireEvent.click(screen.getByRole("button", { name: "Allow ads and analytics" }));
    expect(window.localStorage.getItem(AD_CONSENT_KEY)).toBe("accepted");
    expect(readAdConsent()).toBe("accepted");
    expect(screen.getByText(/current choice: advertising and analytics allowed/)).toBeTruthy();
    expect(screen.getByText("Choice saved.")).toBeTruthy();
  });

  it("Decline persists declined and the round-trip survives a re-render", () => {
    const first = render(<CookiePreferencesControl />);
    fireEvent.click(screen.getByRole("button", { name: "Decline ads and analytics" }));
    expect(window.localStorage.getItem(AD_CONSENT_KEY)).toBe("declined");
    first.unmount();
    render(<CookiePreferencesControl />);
    expect(screen.getByText(/current choice: advertising and analytics declined/)).toBeTruthy();
  });

  it("shows a stored choice on mount", () => {
    window.localStorage.setItem(AD_CONSENT_KEY, "declined");
    render(<CookiePreferencesControl />);
    expect(screen.getByText(/current choice: advertising and analytics declined/)).toBeTruthy();
  });
});

describe("ConsentBanner reopen", () => {
  it("re-opens after a stored choice when the reopen event fires", () => {
    render(<ConsentBanner enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(screen.queryByRole("dialog", { name: "Advertising consent" })).toBeNull();
    expect(window.localStorage.getItem(AD_CONSENT_KEY)).toBe("declined");
    act(() => window.dispatchEvent(new Event(AD_CONSENT_REOPEN_EVENT)));
    expect(screen.getByRole("dialog", { name: "Advertising consent" })).toBeInTheDocument();
  });

  it("requestAdConsentReopen dispatches the reopen event", () => {
    render(<ConsentBanner enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.queryByRole("dialog", { name: "Advertising consent" })).toBeNull();
    act(() => requestAdConsentReopen());
    expect(screen.getByRole("dialog", { name: "Advertising consent" })).toBeInTheDocument();
  });
});
