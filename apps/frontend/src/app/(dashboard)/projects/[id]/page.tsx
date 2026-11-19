import StudioPage from "@/features/studio/StudioPage";

/**
 * D-5: the unknown-id 404 lives in the segment layout ([id]/layout.tsx)
 * and in the proxy (src/proxy.ts) — NOT here. The page sits inside
 * Next's streaming boundary, so a notFound() here only swaps the body —
 * the shell (and its 200 status) has already flushed (verified live).
 * The layout check renders the 404 UI for client-side navigations; the
 * proxy sets the real 404 status for document requests. Do not re-add
 * the check here.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioPage projectId={id} />;
}
