import { notFound } from "next/navigation";
import { getMotionTemplate } from "@capseasy/motion";
import { MotionCustomizeClient } from "./MotionCustomizeClient";

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
