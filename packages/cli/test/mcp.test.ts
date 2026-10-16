import { describe, expect, it } from "vitest";
import { importAddon } from "../src/addons";
import { handle } from "../src/mcp";

const call = async (name: string, args: Record<string, unknown>) => {
  const r = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError?: boolean } };
  return { isError: !!r.result.isError, data: JSON.parse(r.result.content[0]!.text) };
};

describe("MCP server (stdio JSON-RPC)", () => {
  it("initializes and lists the tools", async () => {
    const init = (await handle({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } })) as { result: { protocolVersion: string; capabilities: object; instructions: string } };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(init.result.instructions).toMatch(/build_captions/);
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const list = (await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as { result: { tools: { name: string; inputSchema: { type: string } }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["list_looks", "describe_look", "build_captions", "caption_video", "transcribe"]);
    for (const t of list.result.tools) expect(t.inputSchema.type).toBe("object");
    expect(((await handle({ jsonrpc: "2.0", id: 3, method: "nope" })) as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("runs list_looks, describe_look and build_captions", async () => {
    expect((await call("list_looks", { query: "box" })).data.some((l: { id: string }) => l.id === "hormozi_box")).toBe(true);
    expect((await call("describe_look", { look: 118 })).data.id).toBe("difference_invert");
    const b = await call("build_captions", { look: 12, words: [{ text: "Hi", startMs: 0, endMs: 400 }], overrides: { "active.boxColor": "#FF3366" } });
    expect(b.isError).toBe(false);
    expect(b.data.style.active.boxColor).toBe("#FF3366");
    expect(b.data.doc.words[0].text).toBe("Hi");
  });

  it("returns tool errors as isError results", async () => {
    const e = await call("build_captions", { look: 12, words: [{ text: "Hi", startMs: 0, endMs: 400 }], overrides: { wobble: 1 } });
    expect(e.isError).toBe(true);
    expect(e.data.error.code).toBe("BAD_OVERRIDE");
    expect((await call("describe_look", { look: "nope" })).data.error.code).toBe("UNKNOWN_LOOK");
  });
});

describe("optional add-ons", () => {
  it("a missing add-on is ADDON_MISSING with the install command", async () => {
    await expect(importAddon("captionseasy-not-installed-xyz", "render")).rejects.toMatchObject({ code: "ADDON_MISSING", details: { install: "npm i captionseasy-render" } });
  });
});
