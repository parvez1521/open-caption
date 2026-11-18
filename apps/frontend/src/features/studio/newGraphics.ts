import { NEW_GRAPHICS_FAMILIES, NEW_GRAPHICS_REGISTRY, getNewGraphic } from "@capseasy/compositions";
import type { NewGraphicEntry, NewGraphicFamily } from "@capseasy/compositions";

/**
 * 300 NEW motion graphics (2026-11-18, Studio panels revision): the panel-facing
 * registry. The single source of truth is NEW_GRAPHICS_REGISTRY in
 * @capseasy/compositions (packages/compositions/src/newGraphics.tsx) — this file
 * only groups it into the 15 families the panel renders as sections, and re-exports
 * the lookup the panel and its tests use. No MOTION_TEMPLATES entry is reused:
 * every id is `ng-<family>-<variant>`.
 */
export interface NewGraphicsGroup {
  id: string;
  title: string;
  ids: string[];
}

export const NEW_GRAPHICS_GROUPS: NewGraphicsGroup[] = NEW_GRAPHICS_FAMILIES.map((f: NewGraphicFamily) => ({
  id: f.id,
  title: f.title,
  ids: f.ids,
}));

/** The registry entries for one panel group, in the group's own order. */
export function newGraphicsTemplates(group: NewGraphicsGroup): NewGraphicEntry[] {
  return group.ids
    .map((id) => getNewGraphic(id))
    .filter((t): t is NewGraphicEntry => t !== undefined);
}

/** Every new-graphic id, in group order. */
export function newGraphicsTemplateIds(): string[] {
  return NEW_GRAPHICS_GROUPS.flatMap((g) => g.ids);
}

export { NEW_GRAPHICS_REGISTRY, getNewGraphic };
export type { NewGraphicEntry };
