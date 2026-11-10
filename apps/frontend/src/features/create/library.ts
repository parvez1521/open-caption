/**
 * Client side of the Creator Studio content library + AI Studio chat storage
 * (server routes: /api/v1/content…, server record: lib/api/content.ts,
 * schema: supabase/migrations/20261110020000_content_library.sql).
 *
 * This replaces the localStorage drafts (drafts.ts) as the persistence story
 * for generated content: items live server-side, scoped to the signed-in
 * user, and chat threads/messages get durable storage of their own.
 *
 * Honest degradation mirrors the server: until the owner applies the
 * database update (supabase/APPLY-CONTENT-LIBRARY.sql) the tables do not
 * exist, list calls resolve with `ready: false` and an empty list instead of
 * throwing, and write calls fail with the server's plain "not set up yet"
 * message. Callers can therefore render a "library pending" state rather
 * than an error screen.
 */
import { apiClient } from "@/services/api-client";

export type ContentKind =
  | "idea"
  | "hook"
  | "caption"
  | "script"
  | "repurpose"
  | "shot-list"
  | "calendar"
  | "carousel"
  | "hashtag-group"
  | "chat-output"
  | "analysis"
  | "weekly-plan";

export const CONTENT_KINDS: readonly ContentKind[] = [
  "idea",
  "hook",
  "caption",
  "script",
  "repurpose",
  "shot-list",
  "calendar",
  "carousel",
  "hashtag-group",
  "chat-output",
  "analysis",
  "weekly-plan",
];

export interface ContentItem {
  id: string;
  kind: ContentKind;
  title: string;
  /** The per-kind payload. Typed loosely at this boundary; narrow it with `contentBodyAs`. */
  body: Record<string, unknown>;
  source: string;
  folder: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  contextItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: Record<string, unknown>;
  source: string | null;
  createdAt: string;
}

export interface ContentList {
  ready: boolean;
  items: ContentItem[];
}

export interface ChatThreadList {
  ready: boolean;
  threads: ChatThread[];
}

export interface ChatThreadDetail {
  ready: boolean;
  thread: ChatThread | null;
  messages: ChatMessage[];
}

export interface CreateContentItemInput {
  kind: ContentKind;
  title?: string;
  body?: Record<string, unknown>;
  source?: string;
  folder?: string | null;
  projectId?: string | null;
}

export interface UpdateContentItemPatch {
  title?: string;
  body?: Record<string, unknown>;
  folder?: string | null;
  projectId?: string | null;
}

export interface AppendChatMessageInput {
  role: "user" | "assistant";
  content: Record<string, unknown>;
  source?: string | null;
}

// ---------------------------------------------------------------------------
// Response mapping (pure — unit-tested). The wire shapes are already the API
// shapes (lib/api/content.ts maps DB rows), so these functions are the one
// defensive pass at the boundary: unknown kinds are dropped rather than
// smuggled into the typed union, and non-object bodies become {}.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const isContentKind = (value: unknown): value is ContentKind =>
  typeof value === "string" && (CONTENT_KINDS as readonly string[]).includes(value);

export function mapContentItem(raw: unknown): ContentItem | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !isContentKind(raw.kind)) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    title: typeof raw.title === "string" ? raw.title : "",
    body: asRecord(raw.body),
    source: typeof raw.source === "string" ? raw.source : "template",
    folder: typeof raw.folder === "string" ? raw.folder : null,
    projectId: typeof raw.projectId === "string" ? raw.projectId : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export function mapChatThread(raw: unknown): ChatThread | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "Untitled chat",
    contextItemId: typeof raw.contextItemId === "string" ? raw.contextItemId : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export function mapChatMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.threadId !== "string") return null;
  if (raw.role !== "user" && raw.role !== "assistant") return null;
  return {
    id: raw.id,
    threadId: raw.threadId,
    role: raw.role,
    content: asRecord(raw.content),
    source: typeof raw.source === "string" ? raw.source : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

export function mapContentList(raw: unknown): ContentList {
  if (!isRecord(raw)) return { ready: false, items: [] };
  const items = Array.isArray(raw.items)
    ? raw.items.map(mapContentItem).filter((x): x is ContentItem => x !== null)
    : [];
  return { ready: raw.ready === true, items };
}

export function mapChatThreadList(raw: unknown): ChatThreadList {
  if (!isRecord(raw)) return { ready: false, threads: [] };
  const threads = Array.isArray(raw.threads)
    ? raw.threads.map(mapChatThread).filter((x): x is ChatThread => x !== null)
    : [];
  return { ready: raw.ready === true, threads };
}

export function mapChatThreadDetail(raw: unknown): ChatThreadDetail {
  if (!isRecord(raw)) return { ready: false, thread: null, messages: [] };
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(mapChatMessage).filter((x): x is ChatMessage => x !== null)
    : [];
  return { ready: raw.ready === true, thread: mapChatThread(raw.thread), messages };
}

/** Narrow an item's loose body to the caller's per-kind shape: `contentBodyAs<MyShape>(item)`. */
export function contentBodyAs<T>(item: ContentItem): T {
  return item.body as unknown as T;
}

// ---------------------------------------------------------------------------
// Fetch helpers — all go through apiClient (authenticated, standard envelope).
// ---------------------------------------------------------------------------

export async function fetchContentItems(kind?: ContentKind): Promise<ContentList> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return mapContentList(await apiClient.get<unknown>(`/content${query}`));
}

export async function createContentItem(input: CreateContentItemInput): Promise<ContentItem> {
  const raw = await apiClient.post<unknown>("/content", { json: input });
  const item = mapContentItem(raw);
  if (!item) throw new Error("The server returned an unexpected content item.");
  return item;
}

export async function updateContentItem(id: string, patch: UpdateContentItemPatch): Promise<ContentItem> {
  const raw = await apiClient.patch<unknown>(`/content/${encodeURIComponent(id)}`, { json: patch });
  const item = mapContentItem(raw);
  if (!item) throw new Error("The server returned an unexpected content item.");
  return item;
}

export async function deleteContentItem(id: string): Promise<void> {
  await apiClient.delete(`/content/${encodeURIComponent(id)}`);
}

export async function fetchChatThreads(): Promise<ChatThreadList> {
  return mapChatThreadList(await apiClient.get<unknown>("/content/threads"));
}

export async function createChatThread(title?: string, contextItemId?: string | null): Promise<ChatThread> {
  const raw = await apiClient.post<unknown>("/content/threads", {
    json: {
      ...(title !== undefined ? { title } : {}),
      ...(contextItemId !== undefined ? { contextItemId } : {}),
    },
  });
  const thread = mapChatThread(raw);
  if (!thread) throw new Error("The server returned an unexpected chat thread.");
  return thread;
}

export async function fetchChatThread(id: string): Promise<ChatThreadDetail> {
  return mapChatThreadDetail(await apiClient.get<unknown>(`/content/threads/${encodeURIComponent(id)}`));
}

export async function renameChatThread(id: string, title: string): Promise<ChatThread> {
  const raw = await apiClient.patch<unknown>(`/content/threads/${encodeURIComponent(id)}`, { json: { title } });
  const thread = mapChatThread(raw);
  if (!thread) throw new Error("The server returned an unexpected chat thread.");
  return thread;
}

export async function deleteChatThread(id: string): Promise<void> {
  await apiClient.delete(`/content/threads/${encodeURIComponent(id)}`);
}

export async function appendChatMessage(threadId: string, input: AppendChatMessageInput): Promise<ChatMessage> {
  const raw = await apiClient.post<unknown>(`/content/threads/${encodeURIComponent(threadId)}/messages`, {
    json: input,
  });
  const message = mapChatMessage(raw);
  if (!message) throw new Error("The server returned an unexpected chat message.");
  return message;
}
