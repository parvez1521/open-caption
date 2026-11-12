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

/** Card opacity from facing: front 1, edge-on 0.45, back 0.15. */
export const facingOpacity = (f: number): number => (f >= 0 ? 0.45 + 0.55 * f : 0.15);

/** Dragging by `dx` pixels spins the ring; ~0.22deg/px makes a full swipe a deliberate spin, not a flick. */
export const dragDeltaDeg = (dx: number): number => dx * 0.22;

/** Slow auto-rotation: one full turn per 72 seconds. */
export const AUTO_DEG_PER_MS = 360 / 72_000;

/** Auto-rotation stays paused this long after the visitor last dragged. */
export const RESUME_AFTER_MS = 2_500;
