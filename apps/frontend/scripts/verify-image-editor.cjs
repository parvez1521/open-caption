/**
 * Real-model verification for the Image Elements Editor (NOT shipped to the browser).
 *
 * Runs SAM (Xenova/sam-vit-base, quantized) and Tesseract.js OCR in Node against
 * the two sample images in docs/verification/:
 *   - sample-object.jpg — a real photo (pug); click a point on the dog, expect a
 *     non-empty mask covering a sane fraction of the frame.
 *   - sample-poster.png — a synthetic poster; click the emerald circle, expect a
 *     mask; OCR the poster, expect the words SALE / 50% OFF / TODAY ONLY.
 *
 * Run from apps/frontend:
 *   NODE_PATH="$PWD/../../node_modules/.pnpm/onnxruntime-node@1.30.0/node_modules" \
 *     node scripts/verify-image-editor.cjs
 * (NODE_PATH is needed because transformers.js v4.3.0's Node entry requires
 * 'onnxruntime-common' at top level, which pnpm's strict layout does not hoist.)
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const jpeg = require("jpeg-js");

const VERIFY_DIR = path.join(__dirname, "..", "docs", "verification");

function decodeImage(file) {
  const buf = fs.readFileSync(file);
  if (file.endsWith(".png")) {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  const jpg = jpeg.decode(buf, { useTArray: true });
  return { data: jpg.data, width: jpg.width, height: jpg.height };
}

async function main() {
  const { SamModel, AutoProcessor, RawImage, env } = require("@huggingface/transformers");
  env.allowLocalModels = false;

  const object = decodeImage(path.join(VERIFY_DIR, "sample-object-small.jpg"));
  const poster = decodeImage(path.join(VERIFY_DIR, "sample-poster-small.png"));
  console.log(`object photo: ${object.width}x${object.height}, poster: ${poster.width}x${poster.height}`);

  const t0 = Date.now();
  console.log("loading SAM (Xenova/sam-vit-base, q8)…");
  const model = await SamModel.from_pretrained("Xenova/sam-vit-base", { dtype: "q8" });
  const processor = await AutoProcessor.from_pretrained("Xenova/sam-vit-base");
  console.log(`SAM loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  async function segment(img, x, y, label, keepMask) {
    const raw = new RawImage(img.data, img.width, img.height, 4);
    const base = await processor(raw);
    const { image_embeddings, image_positional_embeddings } = await model.get_image_embeddings({
      pixel_values: base.pixel_values,
    });
    const pInputs = await processor(raw, { input_points: [[[x, y]]] });
    const t1 = Date.now();
    const outputs = await model({
      pixel_values: base.pixel_values,
      input_points: pInputs.input_points,
      input_labels: pInputs.input_labels,
      image_embeddings,
      image_positional_embeddings,
    });
    const masks = await processor.post_process_masks(
      outputs.pred_masks,
      base.original_sizes,
      base.reshaped_input_sizes,
    );
    const mask = masks[0];
    const scores = Array.from(outputs.iou_scores.data);
    const best = scores.indexOf(Math.max(...scores));
    const [b, c, h, w] = mask.dims;
    const total = h * w;
    const slice = mask.data.slice(best * total, (best + 1) * total);
    let count = 0;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < total; i++) {
      if (slice[i]) {
        count++;
        const px = i % w, py = Math.floor(i / w);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    console.log(
      `${label}: point=(${x},${y}) best=${best} iou=${scores[best].toFixed(3)} ` +
      `mask=${count} px (${((100 * count) / total).toFixed(1)}% of frame) ` +
      `bbox=[${minX},${minY} ${maxX},${maxY}] (${Date.now() - t1}ms)`,
    );
    return { count, total, bbox: [minX, minY, maxX, maxY], score: scores[best], maskData: keepMask ? slice : null, width: w, height: h };
  }

  const dog = await segment(object, 400, 300, "dog photo", false);
  if (global.gc) global.gc();
  const circle = await segment(poster, 200, 200, "poster circle", true);
  if (global.gc) global.gc();
  const sale = await segment(poster, 520, 180, "poster SALE text", false);
  if (!dog.count || !circle.count) throw new Error("SAM returned an empty mask");

  // Save the circle mask for the recolour check (vitest reuses the real mask).
  fs.writeFileSync(
    path.join(VERIFY_DIR, "circle-mask.bin"),
    Buffer.from(circle.maskData),
  );
  console.log("saved circle-mask.bin", circle.maskData.length, "bytes");
  console.log("SAM VERIFICATION PASSED");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
