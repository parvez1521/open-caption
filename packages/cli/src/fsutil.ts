import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CaptionsEasyError } from "./errors";

export function existingFile(path: string, what = "file"): string {
  const abs = resolve(path);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new CaptionsEasyError("FILE_NOT_FOUND", `${what} not found: ${abs}`);
  return abs;
}
