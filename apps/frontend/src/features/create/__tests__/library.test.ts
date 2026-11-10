import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from "@/services/api-client";
import {
  appendChatMessage,
  createChatThread,
  createContentItem,
  fetchChatThread,
  fetchContentItems,
  mapChatMessage,
  mapChatThreadDetail,
  mapContentItem,
  mapContentList,
} from "../library";

const getMock = vi.mocked(apiClient.get);
const postMock = vi.mocked(apiClient.post);
const patchMock = vi.mocked(apiClient.patch);
const deleteMock = vi.mocked(apiClient.delete);

beforeEach(() => {
  vi.clearAllMocks();
});

const wireItem = {
  id: "item-1",
  kind: "hook",
  title: "A hook",
  body: { text: "Stop scrolling" },
  source: "cloud",
  folder: null,
  projectId: null,
  createdAt: "2026-11-10T05:00:00.000Z",
  updatedAt: "2026-11-10T05:00:00.000Z",
};

describe("mapContentItem / mapContentList (response mapping)", () => {
  it("maps a well-formed wire item through unchanged", () => {
    expect(mapContentItem(wireItem)).toEqual({
      id: "item-1",
      kind: "hook",
      title: "A hook",
      body: { text: "Stop scrolling" },
      source: "cloud",
      folder: null,
      projectId: null,
      createdAt: "2026-11-10T05:00:00.000Z",
      updatedAt: "2026-11-10T05:00:00.000Z",
    });
  });

  it("drops items whose kind is outside the ContentKind union instead of smuggling them in", () => {
    expect(mapContentItem({ ...wireItem, kind: "bogus" })).toBeNull();
    const list = mapContentList({ ready: true, items: [wireItem, { ...wireItem, id: "x", kind: "bogus" }] });
    expect(list.ready).toBe(true);
    expect(list.items.map((i) => i.id)).toEqual(["item-1"]);
  });

  it("coerces a non-object body to {} and defaults a missing ready flag to false", () => {
    expect(mapContentItem({ ...wireItem, body: "text" })!.body).toEqual({});
    expect(mapContentList({ items: [] })).toEqual({ ready: false, items: [] });
    expect(mapContentList(null)).toEqual({ ready: false, items: [] });
    expect(mapContentList("junk")).toEqual({ ready: false, items: [] });
  });
});

describe("chat mapping", () => {
  it("drops messages with a role outside user|assistant", () => {
    expect(mapChatMessage({ id: "m", threadId: "t", role: "system", content: {}, source: null, createdAt: "" })).toBeNull();
    expect(mapChatMessage({ id: "m", threadId: "t", role: "user", content: { text: "hi" }, source: null, createdAt: "" })).toMatchObject({
      role: "user",
      content: { text: "hi" },
    });
  });

  it("maps a thread detail, tolerating a missing thread", () => {
    const detail = mapChatThreadDetail({ ready: false, thread: null, messages: [] });
    expect(detail).toEqual({ ready: false, thread: null, messages: [] });
  });
});

describe("fetch helpers", () => {
  it("fetchContentItems passes the kind filter and maps the list (ready flag preserved)", async () => {
    getMock.mockResolvedValue({ ready: false, items: [] });
    await expect(fetchContentItems("hook")).resolves.toEqual({ ready: false, items: [] });
    expect(getMock).toHaveBeenCalledWith("/content?kind=hook");
  });

  it("fetchContentItems without a kind hits the bare list route", async () => {
    getMock.mockResolvedValue({ ready: true, items: [wireItem] });
    const list = await fetchContentItems();
    expect(getMock).toHaveBeenCalledWith("/content");
    expect(list.items).toHaveLength(1);
  });

  it("createContentItem posts the input and maps the created item", async () => {
    postMock.mockResolvedValue(wireItem);
    await expect(createContentItem({ kind: "hook", title: "A hook" })).resolves.toMatchObject({ id: "item-1", kind: "hook" });
    expect(postMock).toHaveBeenCalledWith("/content", { json: { kind: "hook", title: "A hook" } });
  });

  it("createChatThread omits undefined fields so server defaults apply", async () => {
    postMock.mockResolvedValue({ id: "t1", title: "Untitled chat", contextItemId: null, createdAt: "", updatedAt: "" });
    await createChatThread();
    expect(postMock).toHaveBeenCalledWith("/content/threads", { json: {} });
  });

  it("fetchChatThread maps thread + messages from the detail route", async () => {
    getMock.mockResolvedValue({
      ready: true,
      thread: { id: "t1", title: "Chat", contextItemId: null, createdAt: "", updatedAt: "" },
      messages: [{ id: "m1", threadId: "t1", role: "user", content: { text: "hi" }, source: null, createdAt: "" }],
    });
    const detail = await fetchChatThread("t1");
    expect(getMock).toHaveBeenCalledWith("/content/threads/t1");
    expect(detail.thread?.title).toBe("Chat");
    expect(detail.messages).toHaveLength(1);
  });

  it("appendChatMessage posts to the nested messages route", async () => {
    postMock.mockResolvedValue({ id: "m1", threadId: "t1", role: "assistant", content: { text: "ok" }, source: "cloud", createdAt: "" });
    await expect(appendChatMessage("t1", { role: "assistant", content: { text: "ok" }, source: "cloud" })).resolves.toMatchObject({
      id: "m1",
      source: "cloud",
    });
    expect(postMock).toHaveBeenCalledWith("/content/threads/t1/messages", {
      json: { role: "assistant", content: { text: "ok" }, source: "cloud" },
    });
  });

  it("uses patch/delete on the item routes (smoke: mocks are wired)", async () => {
    patchMock.mockResolvedValue(wireItem);
    deleteMock.mockResolvedValue(undefined);
    const { updateContentItem, deleteContentItem } = await import("../library");
    await updateContentItem("item-1", { title: "New" });
    expect(patchMock).toHaveBeenCalledWith("/content/item-1", { json: { title: "New" } });
    await deleteContentItem("item-1");
    expect(deleteMock).toHaveBeenCalledWith("/content/item-1");
  });
});
