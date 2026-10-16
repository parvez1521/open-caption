/**
 * captionseasy CLI. Human-friendly by default; every command takes --json for agents (one JSON document on stdout,
 * progress and notes on stderr, exit code 1 on error with {"error": {code, message}}).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, type Command } from "./args";
import { errorJson, isCaptionsEasyError } from "./errors";
import { describeLook, listLooks } from "./looks";
import { loadAddon } from "./addons";
import { buildCaptions } from "./captions";
import { VERSION } from "./version";
import { readWordsFile } from "./words-file";

const HELP = `captionseasy ${VERSION}: designed, animated captions. Bring your words, get styled captions.

Usage
  captionseasy looks [query] [--tag <tag>] [--section <id>]   list the 99 caption looks
  captionseasy look <number|id>                             one look: defaults + the controls it honours
  captionseasy build --words <words.json> --look <n|id> [--set key=value ...] [--out props.json]
                                                            validated props for the CaptionedVideo composition
  captionseasy mcp                                          run as an MCP server (stdio)

With the add-on captionseasy-render (npm i captionseasy-render):
  captionseasy <video> --look <number|id> [options]         caption a video (burn in, or --overlay)
With the add-on captionseasy-transcribe (npm i captionseasy-transcribe):
  captionseasy transcribe <video> [--language en|hinglish|auto] [--out words.json]
  (and a <video> given without --words is transcribed first)

Caption options
  --look, -l <n|id>        look number (e.g. 12) or id (e.g. hormozi_box)
  --words <file.json>      words to caption ([{text,startMs,endMs}] or {words:[...]})
  --language <lang>        en (default), hinglish, auto (when transcribing)
  --set key=value          change the look (repeatable): --set active.color=#FF3366 --set maxWordsPerCard=2
  --overlay                transparent captions only (no video): ProRes 4444 .mov
  --format mov|webm        overlay container (webm = VP9 with alpha); implies --overlay
  --out, -o <path>         output file (default: next to the video)
  --concurrency <n>        frames rendered in parallel
  --json                   machine-readable output

Examples
  npx captionseasy looks bold
  npx captionseasy look 12
  npx captionseasy build --words talk.words.json --look 12 --set active.boxColor=#FF3366 --out props.json
  npx -p captionseasy -p captionseasy-render captionseasy talk.mp4 --look 12 --words talk.words.json
`;

const isTTY = process.stderr.isTTY;
function progressLine(label: string) {
  let last = -1;
  return (f: number) => {
    const pct = Math.floor(f * 100);
    if (pct === last) return;
    if (!isTTY && pct % 10 !== 0 && pct !== 100) return;
    last = pct;
    process.stderr.write(isTTY ? `\r${label} ${pct}%${pct === 100 ? "\n" : ""}` : `${label} ${pct}%\n`);
  };
}

const print = (json: boolean, data: unknown, human: () => string) => {
  process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${human()}\n`);
};

async function run(c: Command): Promise<void> {
  switch (c.cmd) {
    case "help":
      process.stdout.write(HELP);
      return;
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return;
    case "mcp": {
      const { startMcpServer } = await import("./mcp");
      await startMcpServer();
      return;
    }
    case "looks": {
      const looks = listLooks({ query: c.query, tags: c.tags, section: c.section });
      print(c.json, looks, () =>
        looks.length
          ? looks.map((l) => `${String(l.number).padStart(3)}  ${l.name.padEnd(28)} ${l.id.padEnd(26)} ${l.tags.join(", ")}`).join("\n") + `\n\n${looks.length} looks. Details: captionseasy look <number>`
          : "No look matches. Try a broader query.",
      );
      return;
    }
    case "look": {
      const d = describeLook(c.ref);
      print(c.json, d, () => {
        const ctl = d.controls.map((x) => {
          const range = x.type === "number" ? ` (${x.min}..${x.max})` : x.type === "enum" ? ` [${x.options?.join("|")}]` : x.type === "font" ? " [font]" : "";
          return `  ${x.key.padEnd(24)} ${String(JSON.stringify(x.default)).padEnd(14)} ${x.label}${range}${x.dependsOn ? `  needs ${x.dependsOn}` : ""}`;
        });
        const st = d.settings.map((x) => `  ${x.key.padEnd(24)} ${String(JSON.stringify(x.default)).padEnd(14)} ${x.label}${x.type === "number" ? ` (${x.min}..${x.max})` : x.options ? ` [${x.options.join("|")}]` : ""}`);
        return [`#${d.number} ${d.name}  (${d.id})${d.retired ? "  [retired]" : ""}`, d.description, `tags: ${d.tags.join(", ")} · layout: ${d.layout} · ${d.wordsPerCard} word(s) per card`, "", "Style (--set key=value):", ...ctl, "", "Pacing (--set key=value):", ...st].join("\n");
      });
      return;
    }
    case "build": {
      const given = readWordsFile(c.words);
      const props = buildCaptions({ words: given.words, look: c.look, overrides: c.style, settings: c.settings, language: c.language ?? given.language });
      for (const w of props.warnings) process.stderr.write(`note: ${w}\n`);
      if (c.out) writeFileSync(resolve(c.out), JSON.stringify(props, null, 2));
      if (c.out && !c.json) process.stdout.write(`${props.look.name} (#${props.look.number}) · ${props.doc.words.length} words -> ${resolve(c.out)}\n`);
      else process.stdout.write(`${JSON.stringify(c.out ? { out: resolve(c.out), look: props.look, words: props.doc.words.length, warnings: props.warnings } : props, null, 2)}\n`);
      return;
    }
    case "transcribe": {
      const t = await (await loadAddon("transcribe")).transcribe(c.video, { language: c.language, onProgress: c.json ? undefined : progressLine("transcribing") });
      if (c.out) writeFileSync(resolve(c.out), JSON.stringify(t, null, 2));
      print(c.json, c.out ? { ...t, out: resolve(c.out) } : t, () =>
        c.out ? `${t.words.length} words (${(t.durationMs / 1000).toFixed(1)} s of video) in ${(t.elapsedMs / 1000).toFixed(1)} s -> ${resolve(c.out)}` : t.words.map((w) => w.text).join(" "),
      );
      return;
    }
    case "caption": {
      const given = c.words ? readWordsFile(c.words) : undefined;
      const r = await (await loadAddon("render")).render({
        video: c.video,
        words: given?.words,
        transcript: given,
        language: c.language,
        look: c.look,
        overrides: c.style,
        settings: c.settings,
        mode: c.overlay ? "overlay" : "burn",
        overlayFormat: c.format,
        out: c.out,
        concurrency: c.concurrency,
        onProgress: c.json ? undefined : (() => {
          const t = progressLine("transcribing");
          const r = progressLine("rendering");
          return (f: number, stage: "transcribe" | "render") => (stage === "render" ? r(f) : t(f));
        })(),
      });
      for (const w of r.warnings) process.stderr.write(`note: ${w}\n`);
      print(c.json, r, () => `${r.mode === "burn" ? "Captioned video" : "Caption overlay"}: ${r.out}\n${r.look.name} (#${r.look.number}) · ${r.words} words · ${r.width}x${r.height} · ${(r.durationMs / 1000).toFixed(1)} s · rendered in ${(r.renderMs / 1000).toFixed(1)} s`);
      return;
    }
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const json = argv.includes("--json");
  try {
    await run(parseArgs(argv));
    return 0;
  } catch (e) {
    if (json) process.stdout.write(`${JSON.stringify(errorJson(e), null, 2)}\n`);
    else process.stderr.write(`captionseasy: ${isCaptionsEasyError(e) ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    return 1;
  }
}
