import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { getAdmin } from "@/lib/supabase/admin";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Project studio",
  description: "Edit captions and export your video in the Captionit studio.",
  path: "/projects",
  index: false,
});

/**
 * D-5: an unknown project id used to return HTTP 200 with the studio
 * shell (the "could not be found" state only rendered client-side, after
 * hydration, via the studio API 404). Same family as D-1, but projects
 * are database rows, not a static registry — so there is no
 * generateStaticParams / dynamicParams=false to lean on. Instead the
 * server checks bare existence first and calls notFound() for an id with
 * no row, which renders the real 404 at the route level.
 *
 * The check lives HERE, in the layout, as well as in the proxy
 * (src/proxy.ts) — the two halves do different jobs. The proxy runs
 * before any rendering and is what sets the real 404 status for document
 * requests. This layout check renders the app's 404 UI for client-side
 * (RSC) navigations, which the proxy lets through untouched. A notFound()
 * in the PAGE was tried first and does not work here: the page sits
 * inside Next's streaming boundary, so a notFound() there only swaps
 * the body — the shell (and its 200 status) has already flushed before
 * the check resolves (verified live: page-level notFound rendered the
 * 404 UI at status 200, and the same holds for this layout — TTFB
 * ~40 ms against a 2 s-delayed database stub). Do not move this check
 * into the page, and do not remove the proxy.
 *
 * The check is bare existence, not ownership: the session lives in
 * localStorage (CAP-S08), so the server cannot know the requesting user
 * here, and an RLS-scoped read without a token would match nothing. A
 * project that exists but belongs to someone else still renders the
 * shell; the client StudioPage then 404s via the (owner-scoped) studio
 * API, so no project data leaks. The only signal is existence of an
 * unguessable UUID. A non-UUID id 404s without touching the database
 * (Postgres would reject it as invalid uuid syntax).
 *
 * Fail-open: if the database check itself errors (or the env is missing),
 * the shell renders as before instead of 404ing real projects.
 *
 * There is deliberately NO loading.tsx in this segment: it would wrap
 * the page in a Suspense boundary (the trap above), and the page itself
 * never suspends server-side, so the skeleton it would show never
 * renders anyway.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (UUID_RE.test(id)) {
    // Capture the outcome inside the try: notFound() works by throwing,
    // so calling it inside try/catch would swallow it and render the
    // shell for an unknown id (the D-5 bug all over again).
    let exists: boolean | null = null;
    try {
      const { data, error } = await getAdmin()
        .from("projects")
        .select("id")
        .eq("id", id)
        .is("deleted_at", null)
        .limit(1);
      // A query error is not "no such project": fail open (null), so a
      // database problem never 404s real projects. Only a clean empty
      // result is a genuine miss (false).
      exists = error ? null : !!data && data.length > 0;
    } catch {
      exists = null;
    }
    if (exists === false) notFound();
  } else {
    notFound();
  }
  return children;
}
