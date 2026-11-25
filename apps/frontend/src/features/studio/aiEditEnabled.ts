/**
 * AI Edit kill switch (owner order 2026-11-25: hide AI Edit for now).
 *
 * AI_EDIT_ENABLED = false hides every AI Edit entry point while the
 * feature itself stays intact: the panel, the aiEdit*.ts modules, the
 * blank-project flow and both API routes (/api/v1/ai-edit/plan,
 * /api/v1/ai-edit/generate-image) are untouched and keep working if the
 * flag flips back. Gated surfaces, all in this repo:
 *   - the sidebar nav entry (components/studio/nav.ts),
 *   - the /editor front door (app/(dashboard)/editor/page.tsx redirects
 *     to /dashboard while the flag is off),
 *   - the AI Edit section + create-modal footer (components/workspace/ProjectsList.tsx);
 *     while hidden, AI-Edit-tagged projects list with the caption projects
 *     instead, so no existing project becomes unreachable,
 *   - the Studio "Generate Image/Video" rail section, its panel branch and
 *     the auto-open for blank / server-tagged AI-Edit projects
 *     (features/studio/StudioPage.tsx); an AI-Edit project then opens on
 *     Captions like any other project.
 *
 * To restore AI Edit, flip this one constant to true and re-add its row
 * in the nav test's pinned IA list, the rail test and the editor-page test
 * (each test file says so where it pins the hidden state). No env or
 * deploy change is needed either way.
 */
export const AI_EDIT_ENABLED = false;
