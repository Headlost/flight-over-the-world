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
  reset() { this.seconds = 0; this.frames = 0; this.scale = 1; }
  sample(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.5) return false;
    this.seconds += dt; this.frames++;
    if (this.seconds < 3) return false;
    const fps = this.frames / this.seconds;
    const previous = this.scale;
    if (fps < 42) this.scale = Math.max(0.5, this.scale - 0.1);
    else if (fps > 57) this.scale = Math.min(1, this.scale + 0.05);
    this.seconds = 0; this.frames = 0;
    return previous !== this.scale;
  }
}
