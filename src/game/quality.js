export const QUALITY = Object.freeze({
  // One adaptive profile gives the tile streamer enough GPU budget for sharp
  // nearby scenery without forcing every display to render a 4K framebuffer.
  performance: { label: 'Adaptive high detail', pixels: 2560 * 1440, dpr: 1.5, error: 7, bytes: 600e6, shadows: false },
});

export function renderRatio(key, width, height, deviceRatio = 1, maxSize = 8192) {
  const q = QUALITY[key] || QUALITY.performance;
  const budget = Math.sqrt(q.pixels / Math.max(1, width * height));
  const desired = Math.min(deviceRatio, q.dpr, budget);
  return Math.max(0.1, Math.min(desired, maxSize / width, maxSize / height));
}

export class AdaptiveQuality {
  constructor() { this.reset(); }
  reset() { this.seconds = 0; this.frames = 0; this.scale = 1; this.lastFps = 60; }
  sample(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.5) return false;
    this.seconds += dt; this.frames++;
    if (this.seconds < 3) return false;
    const fps = this.frames / this.seconds;
    this.lastFps = fps;
    const previous = this.scale;
    if (fps < 42) this.scale = Math.max(0.5, this.scale - 0.1);
    else if (fps > 57) this.scale = Math.min(1, this.scale + 0.05);
    this.seconds = 0; this.frames = 0;
    return previous !== this.scale;
  }
}

/**
 * Streaming budgets for progressive 3D Tiles refinement. The visible camera is
 * always served first; an off-screen sweep is allowed only while FPS and memory
 * have enough headroom.
 */
export function terrainStreamProfile(mode, fps = 60, mobile = false, cacheFull = false) {
  const rate = Number.isFinite(fps) ? Math.max(1, fps) : 60;
  if (mode === 'street') {
    const error = mobile
      ? rate >= 50 ? 4 : rate >= 32 ? 5.25 : 7
      : rate >= 52 ? 2.75 : rate >= 32 ? 4.25 : 6;
    return {
      error,
      errorFalloff: 2,
      maxTilesProcessed: rate < 28 ? 90 : rate < 45 ? 130 : 180,
      cacheTiles: mobile ? 1800 : 3800,
      cacheBytes: mobile ? 300e6 : 700e6,
      gpuBytes: mobile ? 200e6 : 500e6,
      prefetch: !cacheFull && rate >= (mobile ? 55 : 52),
      prefetchWidth: mobile ? 320 : 480,
    };
  }
  if (mode === 'landing') {
    return {
      error: mobile ? 6 : rate < 32 ? 6 : 4,
      errorFalloff: 1.5,
      maxTilesProcessed: rate < 32 ? 100 : 170,
      cacheTiles: mobile ? 1500 : 3200,
      cacheBytes: mobile ? 260e6 : 620e6,
      gpuBytes: mobile ? 180e6 : 440e6,
      prefetch: !cacheFull && rate >= (mobile ? 55 : 52),
      prefetchWidth: mobile ? 300 : 420,
    };
  }
  return {
    error: 7,
    errorFalloff: 1,
    maxTilesProcessed: rate < 32 ? 120 : 250,
    cacheTiles: mobile ? 1200 : 2400,
    cacheBytes: mobile ? 220e6 : 520e6,
    gpuBytes: mobile ? 150e6 : 380e6,
    prefetch: false,
    prefetchWidth: 0,
  };
}
