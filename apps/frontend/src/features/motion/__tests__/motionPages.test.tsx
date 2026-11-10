/**
 * Motion Studio surfaces (Wave 2): discovery page, customize page, homepage section.
 *
 * Discovery: renders one live-preview card per registry template, search + category filters
 * actually narrow the grid (through the registry helpers), and the empty state offers a
 * working clear-search. Customize (a text+colour+image template): the controls are generated
 * from the registry fields, duration is clamped to the schema bounds, maxLines is enforced,
 * presets save/apply/delete through localStorage, and Add-to-project calls the real insertion
 * helper with the configured config and navigates to the project.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_TEMPLATES } from "@capseasy/motion";

const h = vi.hoisted(() => ({
  templateId: "subscribe-banner",
  push: vi.fn(),
  addMotionToProject: vi.fn(async () => ({ id: "ov-new" })),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ templateId: h.templateId }),
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
}));
vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { projects: [{ id: "proj-1", title: "Demo project", status: "CREATED", created_at: "2026-01-01", updated_at: "2026-01-01" }], total: 1, limit: 100, offset: 0, orgReady: true },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/features/studio/useMediaAssets", () => ({
  useMediaAssets: () => ({ assets: [], importing: false, importFiles: vi.fn(async () => []), remove: vi.fn(async () => undefined), refresh: vi.fn(async () => undefined) }),
}));
vi.mock("@/features/studio/mediaStore", () => ({
  listProjectAssets: vi.fn(async () => []),
  listAllAssets: vi.fn(async () => []),
  deleteAsset: vi.fn(async () => undefined),
  saveAsset: vi.fn(async () => undefined),
}));
vi.mock("@/features/motion/addToProject", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return { ...orig, addMotionToProject: h.addMotionToProject, MOTION_STAGING_PROJECT_ID: "motion-studio" };
});

import MotionDiscoveryPage from "@/app/(dashboard)/motion/page";
import MotionCustomizeRoute from "@/app/(dashboard)/motion/[templateId]/page";
import { MotionStudioSection } from "@/components/home/Sections";
import { MOTION_PRESETS_KEY } from "../presets";

/** IntersectionObserver / ResizeObserver fakes (previews stay on their poster frame). */
class FakeIO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class FakeRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setup() {
  const g = globalThis as unknown as Record<string, unknown>;
  g["IntersectionObserver"] = FakeIO;
  g["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 320; } });
  localStorage.clear();
  h.push.mockClear();
  h.addMotionToProject.mockClear();
}

const cardLinks = (root: HTMLElement) => [...root.querySelectorAll('a[aria-label^="Customise "]')];

beforeEach(setup);

describe("Motion Studio discovery page", () => {
  it("renders one live-preview card per registry template", () => {
    const view = render(<MotionDiscoveryPage />);
    expect(cardLinks(view.container)).toHaveLength(MOTION_TEMPLATES.length);
    expect(view.container.querySelectorAll('[data-testid="motion-preview"]')).toHaveLength(MOTION_TEMPLATES.length);
    expect(view.container.textContent).toContain(`Showing ${MOTION_TEMPLATES.length} of ${MOTION_TEMPLATES.length} templates`);
    view.unmount();
  });

  it("search filters the grid", () => {
    const view = render(<MotionDiscoveryPage />);
    fireEvent.change(screen.getByLabelText("Search motion templates"), { target: { value: "counter" } });
    const cards = cardLinks(view.container);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.getAttribute("href")).toBe("/motion/counter");
    view.unmount();
  });

  it("category chips filter by registry category, with counts from the registry", () => {
    const view = render(<MotionDiscoveryPage />);
    const chip = screen.getByRole("button", { name: "Youtube (3)" });
    fireEvent.click(chip);
    const hrefs = cardLinks(view.container).map((a) => a.getAttribute("href")).sort();
    expect(hrefs).toEqual(["/motion/notification-pop", "/motion/subscribe-banner", "/motion/subscribe-pill"]);
    view.unmount();
  });

  it("empty state shows for a search with no matches, and Clear search restores the grid", () => {
    const view = render(<MotionDiscoveryPage />);
    fireEvent.change(screen.getByLabelText("Search motion templates"), { target: { value: "zzzz-nothing" } });
    expect(view.container.textContent).toContain("No templates match that search.");
    expect(cardLinks(view.container)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(cardLinks(view.container)).toHaveLength(MOTION_TEMPLATES.length);
    view.unmount();
  });
});

describe("Motion Studio customize page (subscribe-banner: text + colour + image)", () => {
  it("generates its controls from the registry fields, with registry defaults", () => {
    const view = render(<MotionCustomizeRoute />);
    const text = screen.getByLabelText("Text lines") as HTMLTextAreaElement;
    expect(text.value).toBe("Your Channel\nNew videos every week\nSubscribe\nSubscribed");
    // colour field: a hex text input carrying the registry default colour
    expect(view.container.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe("#ff4d2e");
    // image field: an upload control is offered
    expect(screen.getByRole("button", { name: "Upload avatar image" })).toBeTruthy();
    // duration starts at the registry default and is labelled in ms
    expect((screen.getByLabelText("Duration value in milliseconds") as HTMLInputElement).value).toBe("4000");
    // the live stage is mounted
    expect(view.container.querySelector('[data-testid="motion-preview"]')).toBeTruthy();
    view.unmount();
  });

  it("enforces the text field's maxLines (4 for subscribe-banner)", () => {
    render(<MotionCustomizeRoute />);
    const text = screen.getByLabelText("Text lines") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: "one\ntwo\nthree\nfour\nfive\nsix" } });
    expect(text.value).toBe("one\ntwo\nthree\nfour");
  });

  it("clamps duration to the schema bounds (400–30000 ms)", () => {
    render(<MotionCustomizeRoute />);
    const num = screen.getByLabelText("Duration value in milliseconds") as HTMLInputElement;
    fireEvent.change(num, { target: { value: "99999" } });
    expect(num.value).toBe("30000");
    fireEvent.change(num, { target: { value: "10" } });
    expect(num.value).toBe("400");
  });

  it("preset save / apply / delete round-trips through localStorage", async () => {
    render(<MotionCustomizeRoute />);
    const text = screen.getByLabelText("Text lines") as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: "My Channel\nWeekly videos\nSubscribe\nSubscribed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    fireEvent.change(screen.getByLabelText("Preset name"), { target: { value: "Channel default" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Channel default")).toBeTruthy());
    const stored = JSON.parse(localStorage.getItem(MOTION_PRESETS_KEY) ?? "{}") as Record<string, Array<{ name: string; text: string }>>;
    expect(stored["subscribe-banner"]?.[0]).toMatchObject({ name: "Channel default", text: "My Channel\nWeekly videos\nSubscribe\nSubscribed" });
    // change the text, then Apply restores the preset
    fireEvent.change(text, { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(text.value).toBe("My Channel\nWeekly videos\nSubscribe\nSubscribed");
    // Delete removes it from the list and from storage
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Channel default")).toBeNull());
    const after = JSON.parse(localStorage.getItem(MOTION_PRESETS_KEY) ?? "{}") as Record<string, unknown[]>;
    expect(after["subscribe-banner"] ?? []).toHaveLength(0);
  });

  it("Add to project inserts via addMotionToProject with the configured config and opens the project", async () => {
    render(<MotionCustomizeRoute />);
    fireEvent.click(screen.getByRole("button", { name: "Add to this project" }));
    await waitFor(() => expect(h.addMotionToProject).toHaveBeenCalledTimes(1));
    expect(h.addMotionToProject).toHaveBeenCalledWith("proj-1", {
      config: expect.objectContaining({ variant: "subscribe-banner", color: "#FF4D2E", durationMs: 4000 }),
      assetId: null,
    });
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/projects/proj-1"));
  });

  it("an unknown template id gets the plain not-found state, not a crash", () => {
    h.templateId = "no-such-template";
    const view = render(<MotionCustomizeRoute />);
    expect(view.container.textContent).toContain("That template does not exist.");
    h.templateId = "subscribe-banner";
    view.unmount();
  });
});

describe("homepage Motion Studio section", () => {
  it("renders the heading, four featured template cards and the /motion link", () => {
    const view = render(<MotionStudioSection />);
    expect(view.container.querySelector("#motion, section#motion")).toBeTruthy();
    expect(view.container.textContent).toContain("Motion Studio");
    const open = screen.getByRole("link", { name: /Open Motion Studio/ });
    expect(open.getAttribute("href")).toBe("/motion");
    const featured = MOTION_TEMPLATES.filter((t) => t.featured).slice(0, 4);
    expect(cardLinks(view.container)).toHaveLength(4);
    for (const t of featured) {
      expect(view.container.querySelector(`a[href="/motion/${t.id}"]`)).toBeTruthy();
      expect(view.container.textContent).toContain(t.title);
    }
    view.unmount();
  });
});
