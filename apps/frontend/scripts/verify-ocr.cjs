/**
 * OCR verification for the Image Elements Editor (NOT shipped to the browser).
 * Separate process from the SAM check: Tesseract.js is heavy, and the sandbox
 * OOM-killed the combined run. Run from apps/frontend:
 *   node scripts/verify-ocr.cjs
 */
const path = require("path");

async function main() {
  const { createWorker } = require("tesseract.js");
  const poster = path.join(__dirname, "..", "docs", "verification", "sample-poster.png");
  console.log("running Tesseract.js OCR on the poster…");
  const t0 = Date.now();
  const worker = await createWorker("eng");
  // tesseract.js v6 returns only `text` by default — word boxes need { blocks: true }.
  const { data } = await worker.recognize(poster, {}, { blocks: true });
  const words = [];
  for (const b of data.blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        for (const w of l.words || []) {
          if (w.text.trim()) words.push({ text: w.text, bbox: w.bbox, conf: Math.round(w.confidence) });
        }
      }
    }
  }
  console.log(`OCR done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("OCR words:", JSON.stringify(words));
  await worker.terminate();
  const found = words.map((w) => w.text.toUpperCase());
  for (const want of ["SALE", "50%", "TODAY"]) {
    if (!found.some((t) => t.includes(want))) throw new Error(`OCR missed expected word: ${want}`);
  }
  console.log("OCR VERIFICATION PASSED");
}

main().catch((e) => {
  console.error("OCR VERIFICATION FAILED:", e);
  process.exit(1);
});
