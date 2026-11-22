/**
 * Pure geometry for the hero cylinder (HeroCylinder.tsx): cards sit on a regular polygon around a
 * vertical axis, each card rotated to face outward. Kept side-effect free so the maths is unit-tested.
 */

/** Degrees between neighbouring cards. */
export const stepDeg = (count: number): number => (count > 0 ? 360 / count : 0);

/**
 * Radius (the translateZ distance) so cards of `cardWidth` sit edge to edge with `gap` px to spare:
 * half the card spans tan(step/2) of the radius.
 */
export const cylinderRadius = (cardWidth: number, count: number, gap = 28): number => {
  if (count < 3 || cardWidth <= 0) return 0;
  return Math.round((cardWidth / 2 + gap / 2) / Math.tan(Math.PI / count));
};

/** This card's own rotation on the ring, before the ring's rotation is applied. */
export const cardTransform = (index: number, count: number, radius: number): string =>
  `translate(-50%, -50%) rotateY(${index * stepDeg(count)}deg) translateZ(${radius}px)`;

/**
 * How front-facing a card is for a given ring rotation: 1 = dead ahead, 0 = edge-on, -1 = facing away.
 * Used to fade the backs of the cylinder so reversed cards never compete with the front ones.
 */
export const facing = (index: number, count: number, rotationDeg: number): number => {
  const deg = (((rotationDeg + index * stepDeg(count)) % 360) + 360) % 360;
  return Math.cos((deg * Math.PI) / 180);
};

/**
 * Which card faces dead ahead for a given ring rotation: the card whose own rotation best
 * cancels the ring's, i.e. (rotationDeg + index * step) nearest 0 mod 360. The hero only
 * mounts the live preview on this one card (HeroCylinder.tsx) — every ring card always
 * intersects the viewport (they rotate in place, never leave it), so letting all of them
 * request slots jammed the shared budget and the front card never went live.
 */
export const frontIndex = (count: number, rotationDeg: number): number => {
  if (count <= 0) return 0;
  const step = stepDeg(count);
  const raw = Math.round(-rotationDeg / step) % count;
  return (raw + count) % count;
};

/** Card opacity from facing: front 1, edge-on 0.45, back 0.15. */
export const facingOpacity = (f: number): number => (f >= 0 ? 0.45 + 0.55 * f : 0.15);

/** Dragging by `dx` pixels spins the ring; ~0.22deg/px makes a full swipe a deliberate spin, not a flick. */
export const dragDeltaDeg = (dx: number): number => dx * 0.22;

/** Slow auto-rotation: one full turn per 72 seconds. */
export const AUTO_DEG_PER_MS = 360 / 72_000;

/** Auto-rotation stays paused this long after the visitor last dragged. */
export const RESUME_AFTER_MS = 2_500;

/**
 * The resume gate for the rotation loop: auto-rotation runs only when nobody is dragging and
 * the last drag ended over RESUME_AFTER_MS ago. Kept pure so the resume rule is unit-tested:
 * a drag that never ends (its up/cancel lost) must be the only way this stays false, which is
 * why the component also ends the drag on lostpointercapture.
 */
export const shouldResumeAutoRotate = (dragging: boolean, nowMs: number, lastDragEndMs: number): boolean =>
  !dragging && nowMs - lastDragEndMs > RESUME_AFTER_MS;
