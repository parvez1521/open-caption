import { notFound } from "next/navigation";
import { MOTION_TEMPLATES, getMotionTemplate } from "@capseasy/motion";
import { MotionCustomizeClient } from "./MotionCustomizeClient";

/**
 * D-1: only the 50 registry ids exist. With `dynamicParams = false`, an
 * unknown id 404s at the route level (real HTTP 404) instead of reaching
 * the page's `notFound()` call — which the (dashboard) layout's client-side
 * auth gate kept out of the initial HTML, so the shell streamed at 200
 * (soft 404: the 404 UI only appeared after client hydration, via flight
 * data). The `notFound()` below stays as the defence for a direct render.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return MOTION_TEMPLATES.map((t) => ({ templateId: t.id }));
}

/**
 * Motion Studio customize route, server half (D-1): the template id is
 * resolved here, and an unknown id 404s with a real HTTP 404 instead of
 * rendering the customize shell with a "does not exist" message at 200.
 * The client component only ever receives a real template.
 */
export default async function MotionCustomizeRoute({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const template = getMotionTemplate(templateId);
  if (!template) notFound();
  return <MotionCustomizeClient template={template} />;
}
