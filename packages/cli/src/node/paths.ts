import { mkdirSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

const paths = envPaths("captionseasy", { suffix: "" });

/**
 * Per-user cache (speech models, scratch audio). Override with CAPTIONSEASY_CACHE.
 * Windows: %LOCALAPPDATA%\captionseasy\Cache, macOS: ~/Library/Caches/captionseasy, Linux: ~/.cache/captionseasy.
 */
export function cacheDir(): string {
  const dir = process.env.CAPTIONSEASY_CACHE ?? paths.cache;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const modelsDir = () => join(cacheDir(), "models");
