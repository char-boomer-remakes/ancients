export const PERFORMANCE_BUDGET = {
  targetFps: 60,
  activeUnits: 30,
  liveProjectilesOrParticles: 200,
  maxPixelRatio: 2,
  shadowMapSize: 2048,
  transientVfxCap: 220
} as const;

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  tier: QualityTier;
  maxPixelRatio: number;
  shadowMapSize: number;
  shadows: boolean;
  shadowType: 'basic' | 'pcf';
  transientVfxCap: number;
  // ---- Dota-look render features (GRAPHICS_SPEC §3, §9.6) ----
  /** PBR environment map for unit/terrain materials. */
  envMap: boolean;
  /** Master switch for the EffectComposer post-processing stack. */
  postFx: boolean;
  /** Bloom pass + its strength/radius. */
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  /** Color-grade + vignette pass. */
  grade: boolean;
  /** Ambient occlusion pass (most expensive). */
  ao: boolean;
  /** Post-AA pass (SMAA) inside the composer. */
  smaa: boolean;
  /** 0..1 density multiplier for ambient weather particles. */
  weatherDensity: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  low: {
    tier: 'low',
    maxPixelRatio: 1,
    shadowMapSize: 512,
    shadows: false,
    shadowType: 'basic',
    transientVfxCap: 100,
    envMap: false,
    postFx: false,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    grade: false,
    ao: false,
    smaa: false,
    weatherDensity: 0
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.5,
    shadowMapSize: 1024,
    shadows: true,
    shadowType: 'basic',
    transientVfxCap: 160,
    envMap: true,
    postFx: true,
    bloom: true,
    bloomStrength: 0.4,
    bloomRadius: 0.45,
    grade: false,
    ao: false,
    smaa: true,
    weatherDensity: 0.4
  },
  high: {
    tier: 'high',
    maxPixelRatio: PERFORMANCE_BUDGET.maxPixelRatio,
    shadowMapSize: PERFORMANCE_BUDGET.shadowMapSize,
    shadows: true,
    shadowType: 'pcf',
    transientVfxCap: PERFORMANCE_BUDGET.transientVfxCap,
    envMap: true,
    postFx: true,
    bloom: true,
    bloomStrength: 0.34,
    bloomRadius: 0.45,
    grade: true,
    ao: false,
    smaa: true,
    weatherDensity: 1
  },
  ultra: {
    tier: 'ultra',
    maxPixelRatio: PERFORMANCE_BUDGET.maxPixelRatio,
    shadowMapSize: 4096,
    shadows: true,
    shadowType: 'pcf',
    transientVfxCap: 260,
    envMap: true,
    postFx: true,
    bloom: true,
    bloomStrength: 0.55,
    bloomRadius: 0.55,
    grade: true,
    ao: true,
    smaa: true,
    weatherDensity: 1
  }
};

export function qualityPreset(tier: QualityTier = 'high'): QualityPreset {
  return QUALITY_PRESETS[tier];
}

export function clampedPixelRatio(devicePixelRatio: number, tier: QualityTier = 'high'): number {
  const preset = qualityPreset(tier);
  return Math.min(preset.maxPixelRatio, Math.max(1, devicePixelRatio || 1));
}
