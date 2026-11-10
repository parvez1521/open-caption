import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  CHAT_MESSAGE_COLUMNS,
  throwIfMissingTable,
  toApiChatMessage,
  type ChatMessageRow,
} from "@/lib/api/content";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";

/**
 * Append one message to a chat thread. The thread must be the caller's
 * (checked first — another user's thread is a 404, and nothing is written).
 * Appending also touches the thread's updated_at, so thread lists ordered by
 * recency reflect activity, not just creation. The touch is best-effort: the
 * message is the record that matters, so a failed touch never fails the append.
 */

const AppendBody = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.record(z.unknown()),
  source: z.string().trim().max(20).nullable().optional(),
});

export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = await parseBody(req, AppendBody);

  const { data: thread, error: threadError } = await user.db
    .from("chat_threads")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  throwIfMissingTable(threadError);
  if (threadError) throw new ApiFailure("INTERNAL", "Could not check the chat", threadError.message);
  if (!thread) throw notFound("Chat thread");

  const { data, error } = await user.db
    .from("chat_messages")
    .insert({
      thread_id: id,
      owner_id: user.id,
      role: body.role,
      content: body.content,
      source: body.source ?? null,
    })
    .select(CHAT_MESSAGE_COLUMNS)
    .single();
  throwIfMissingTable(error);
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not save the message", error?.message);

  await user.db
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);

  return ok(toApiChatMessage(data as ChatMessageRow), 201);
});
