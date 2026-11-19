// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D-5 (r3): /projects/<unknown-id> must 404 at the route level instead of
 * returning 200 with the studio shell. The segment LAYOUT is a server
 * component that checks bare project existence first; a missing row (or a
 * non-UUID id) calls notFound(). The check lives in the layout, not the
 * page: the page sits inside Next's streaming boundary, so a notFound()
 * there only swaps the body while the shell keeps its 200 status
 * (verified live with curl). A database/env failure fails open to the
 * shell, as before, so an outage never 404s real projects.
 */

const KNOWN_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  notFoundCalls: 0,
  queriedId: null as string | null,
  rows: [] as Array<{ id: string }>,
  dbError: null as { message: string } | null,
  adminThrows: false,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFoundCalls += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => {
    if (state.adminThrows) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return {
      from: () => ({
        select: () => ({
          eq: (_col: string, value: string) => {
            state.queriedId = value;
            return {
              is: () => ({
                limit: async () => ({ data: state.rows, error: state.dbError }),
              }),
            };
          },
        }),
      }),
    };
  },
}));

import Layout from "../layout";

const renderLayout = (id: string) => Layout({ children: "CHILD", params: Promise.resolve({ id }) });

beforeEach(() => {
  state.notFoundCalls = 0;
  state.queriedId = null;
  state.rows = [];
  state.dbError = null;
  state.adminThrows = false;
});

describe("D-5 /projects/[id] server 404", () => {
  it("has no loading.tsx in this segment — the page never suspends server-side, so the skeleton it would show never renders", () => {
    const files = readdirSync(join(process.cwd(), "src/app/(dashboard)/projects/[id]"));
    expect(files).not.toContain("loading.tsx");
  });

  it("the page itself carries no existence check — the layout owns the 404", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(dashboard)/projects/[id]/page.tsx"), "utf8");
    expect(page).not.toContain('from "next/navigation"');
    expect(page).not.toContain("getAdmin");
  });

  it("404s a non-UUID id without touching the database", async () => {
    await expect(renderLayout("does-not-exist-xyz")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFoundCalls).toBe(1);
    expect(state.queriedId).toBeNull();
  });

  it("404s an unknown-but-valid UUID after the existence check", async () => {
    state.rows = [];
    await expect(renderLayout(UNKNOWN_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFoundCalls).toBe(1);
    expect(state.queriedId).toBe(UNKNOWN_ID);
  });

  it("renders children for a known project id", async () => {
    state.rows = [{ id: KNOWN_ID }];
    const out = await renderLayout(KNOWN_ID);
    expect(state.notFoundCalls).toBe(0);
    expect(out).toBe("CHILD");
  });

  it("fails open to the shell when the database check errors", async () => {
    state.dbError = { message: "boom" };
    const out = await renderLayout(UNKNOWN_ID);
    expect(state.notFoundCalls).toBe(0);
    expect(out).toBe("CHILD");
  });

  it("fails open to the shell when the admin client cannot be built (no env)", async () => {
    state.adminThrows = true;
    const out = await renderLayout(UNKNOWN_ID);
    expect(state.notFoundCalls).toBe(0);
    expect(out).toBe("CHILD");
  });
});
