// upload-file.mjs — set a file on <input type=file> via DataTransfer.
// DOM.setFileInputFiles returns success but leaves input.files empty in
// chrome-headless-shell on this VM (verified 2026-11-14, qa-setfile-debug).
// This route fetches the asset from a LOCAL static server, builds a File,
// assigns it through DataTransfer and dispatches a bubbling change event,
// which is what React's onChange listens for. It exercises the app's
// pick/probe/transcribe code (the product); the native file picker itself
// is browser behaviour, not product code.
// Usage: import { uploadFile } from "./upload-file.mjs";
//   await uploadFile(evl, "input[type=file]", "http://localhost:3199/v07_silence_720x1280.mp4", "v07_silence_720x1280.mp4", "video/mp4");
export async function uploadFile(evl, selector, url, name, type) {
  return await evl(`(async () => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return "NO_INPUT";
    const res = await fetch(${JSON.stringify(url)});
    if (!res.ok) return "FETCH_" + res.status;
    const buf = await res.arrayBuffer();
    const file = new File([buf], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    const fileName = input.files[0]?.name; // read before dispatch: the app clears the input value in its onChange handler
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return "SET:" + input.files.length + ":" + fileName;
  })()`);
}
