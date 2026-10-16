import { main } from "./cli";

main().then((code) => {
  // the MCP server keeps running on stdio; everything else exits once stdout is flushed
  if (process.argv[2] === "mcp" && code === 0) return;
  process.stdout.write("", () => process.exit(code));
});
