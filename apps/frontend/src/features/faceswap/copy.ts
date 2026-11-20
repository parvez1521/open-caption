/**
 * Every user-facing string on the /face-swap page, in one place.
 *
 * Owner rule (2026-11-18): NEVER tell the user a model is downloading.
 * Progress copy stays neutral — "Getting ready…" / "Preparing your
 * swap…" — with a progress indicator, so the user never stares at a
 * silent hang and never reads the words "model download". The copy test
 * (copy.test.ts) enforces this: no string here may contain "model" or
 * "downloading".
 *
 * "Download PNG" is the finished image leaving the tab — that is fine.
 * It says nothing about any model.
 */
export const UI_COPY = {
  preparing: "Getting ready…",
  preparingDetail: "This takes a moment the first time.",
  findingFaces: "Finding faces…",
  swapping: "Swapping your face…",
  finishing: "Finishing up…",
  noFaceInThumbnail: "No face found in this image. Try a thumbnail with a clear, front-facing face.",
  noFaceInSelfie: "No face found in your selfie. Face the camera in good light and try again.",
  tooManyFacesInSelfie: "More than one face in frame. Make sure only you are in front of the camera.",
  noCamera: "A camera is needed for your selfie. Use a device with a camera, or allow camera access and try again.",
  cameraDenied: "Camera access was blocked. Allow the camera in your browser and try again.",
  swapFailed: "The swap could not be finished. Try again — a clear, front-facing photo works best.",
  loadFailed: "Something could not be prepared. Check your connection and try again.",
  limitReached: "You have used your 5 swaps for today. Come back tomorrow.",
  resizedNote: "Resized to fit 1280 px.",
  safetyLine: "Only your own face, only your own thumbnail.",
  qualityNote:
    "Front-facing faces in good light swap best. Side profiles, sunglasses and poor light give poor results, and the swapped face will not be a perfect likeness.",
  swapsLeft: (left: number): string => `${left} of 5 swaps left today`,
  downloadPng: "Download PNG",
} as const;
