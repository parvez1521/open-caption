import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  CHAT_MESSAGE_COLUMNS,
  CHAT_THREAD_COLUMNS,
  isMissingTableError,
  throwIfMissingTable,
  toApiChatMessage,
  toApiChatThread,
  type ChatMessageRow,
  type ChatThreadRow,
} from "@/lib/api/content";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";

/**
 * One chat thread: read (with its messages, oldest first), rename /
 * re-anchor, delete. Another user's thread is a 404, exactly like a missing
 * one — RLS hides it and the owner filter keeps that true on every path.
 *
 * GET degrades like the list routes (ready:false, no thread, no messages)
 * when the tables are not applied yet — but a thread that truly does not
 * exist on a ready database is still a 404.
 */

export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;

  const { data: thread, error: threadError } = await user.db
    .from("chat_threads")
    .select(CHAT_THREAD_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (threadError) {
    if (isMissingTableError(threadError)) return ok({ ready: false, thread: null, messages: [] });
    throw new ApiFailure("INTERNAL", "Could not load the chat", threadError.message);
  }
  if (!thread) throw notFound("Chat thread");

  const { data: messages, error: messagesError } = await user.db
    .from("chat_messages")
    .select(CHAT_MESSAGE_COLUMNS)
    .eq("thread_id", id)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (messagesError) {
    if (isMissingTableError(messagesError)) return ok({ ready: false, thread: null, messages: [] });
    throw new ApiFailure("INTERNAL", "Could not load the chat messages", messagesError.message);
  }
  return ok({
    ready: true,
    thread: toApiChatThread(thread as ChatThreadRow),
    messages: ((messages ?? []) as ChatMessageRow[]).map(toApiChatMessage),
  });
});

/** Allow-list: title and/or the context anchor; unknown keys are stripped. */
const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    contextItemId: z.string().uuid().nullable(),
  })
  .partial();

export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const patch = await parseBody(req, PatchBody);
  if (Object.keys(patch).length === 0) throw new ApiFailure("VALIDATION", "No editable fields provided");

  if (patch.contextItemId) {
    const { data: item, error: itemError } = await user.db
      .from("content_items")
      .select("id")
      .eq("id", patch.contextItemId)
      .eq("owner_id", user.id)
      .maybeSingle();
    throwIfMissingTable(itemError);
    if (itemError) throw new ApiFailure("INTERNAL", "Could not check the context item", itemError.message);
    if (!item) throw notFound("Content item");
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.contextItemId !== undefined) row.context_item_id = patch.contextItemId;

  const { data, error } = await user.db
    .from("chat_threads")
    .update(row)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(CHAT_THREAD_COLUMNS)
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not save the chat", error.message);
  if (!data) throw notFound("Chat thread");
  return ok(toApiChatThread(data as ChatThreadRow));
});

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  // Messages cascade with the thread (chat_messages.thread_id on delete cascade).
  const { data, error } = await user.db
    .from("chat_threads")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not delete the chat", error.message);
  if (!data) throw notFound("Chat thread");
  return ok({ deleted: true });
});
