import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  CHAT_THREAD_COLUMNS,
  isMissingTableError,
  throwIfMissingTable,
  toApiChatThread,
  type ChatThreadRow,
} from "@/lib/api/content";
import { ApiFailure, notFound, ok, parseBody, route } from "@/lib/api/http";

/**
 * AI Studio chat threads (Phase 3). A thread optionally anchors to one
 * library item (contextItemId): that item must belong to the caller, checked
 * explicitly here because the FK alone would happily point at anyone's row
 * when the write goes through a path RLS does not cover.
 *
 * Same honest degradation as the library list: no table yet → GET answers
 * ready:false, POST explains the pending database update.
 */

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const { data, error } = await user.db
    .from("chat_threads")
    .select(CHAT_THREAD_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTableError(error)) return ok({ ready: false, threads: [] });
    throw new ApiFailure("INTERNAL", "Could not load your chats", error.message);
  }
  return ok({ ready: true, threads: ((data ?? []) as ChatThreadRow[]).map(toApiChatThread) });
});

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  contextItemId: z.string().uuid().nullable().optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, CreateBody);

  if (body.contextItemId) {
    const { data: item, error: itemError } = await user.db
      .from("content_items")
      .select("id")
      .eq("id", body.contextItemId)
      .eq("owner_id", user.id)
      .maybeSingle();
    throwIfMissingTable(itemError);
    if (itemError) throw new ApiFailure("INTERNAL", "Could not check the context item", itemError.message);
    if (!item) throw notFound("Content item");
  }

  const { data, error } = await user.db
    .from("chat_threads")
    .insert({
      owner_id: user.id,
      title: body.title ?? "Untitled chat",
      context_item_id: body.contextItemId ?? null,
    })
    .select(CHAT_THREAD_COLUMNS)
    .single();
  throwIfMissingTable(error);
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not create the chat", error?.message);
  return ok(toApiChatThread(data as ChatThreadRow), 201);
});
