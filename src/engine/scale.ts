// Sim runs in raw Dota units; the renderer divides by WORLD_SCALE (DECISIONS).
export const WORLD_SCALE = 100;

export const toWorld = (v: number): number => v / WORLD_SCALE;

/** Sim (x, y) plane maps to three.js (x, z); y-up. */
export function simToWorld(x: number, y: number): { x: number; z: number } {
  return { x: x / WORLD_SCALE, z: y / WORLD_SCALE };
}

// --- World size bridge (OVERWORLD_PLANNING §2) ---------------------------------
// Meters are the lingua franca; Dota units are an implementation detail. These are
// the only conversions that matter, and they round-trip through WORLD_SCALE.

/** The lifelike yardstick: the standard biped hero stands 1.8 m. */
export const HERO_HEIGHT_M = 1.8;

/** A `SilhouetteSpec.scale` is a multiple of the 1.8 m standard hero. */
export const heightMFromScale = (scale: number): number => HERO_HEIGHT_M * scale;
export const scaleFromHeightM = (heightM: number): number => heightM / HERO_HEIGHT_M;

/** Visual footprint radius (m) <-> sim collision radius (Dota units). */
export const footprintToRadius = (footprintM: number): number => Math.round(footprintM * WORLD_SCALE);
export const radiusToFootprint = (radius: number): number => radius / WORLD_SCALE;

/** Generic meter <-> Dota-unit bridge (e.g. cast ranges, leashes). */
export const worldToDota = (m: number): number => Math.round(m * WORLD_SCALE);
export const dotaToWorld = (units: number): number => units / WORLD_SCALE;
