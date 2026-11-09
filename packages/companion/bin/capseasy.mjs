#!/usr/bin/env node
// Dev launcher: runs the TypeScript CLI through tsx. `pnpm companion:pack` will replace this with a built bundle.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
const r = spawnSync(process.execPath, [tsxCli, join(here, "..", "src", "cli.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
