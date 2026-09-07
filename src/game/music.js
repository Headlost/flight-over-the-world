const TARGET = 0.22;

const el = document.getElementById("bgm");
if (el) {
  el.loop = true;
  el.volume = TARGET;
  window.__bgm = el;
  el.play().catch(() => {});
}

let lastRetry = 0;
export function updateMusic() {
  if (!el || !el.paused || document.hidden) return;
  const now = performance.now();
  if (now - lastRetry < 3000) return;
  lastRetry = now;
  el.play().catch(() => {});
}

export function primeMusic() {
  if (el) el.play().catch(() => {});
}

export function musicDebug() {
  if (!el) return { paused: null, time: null, gain: null };
  return {
    paused: el.paused,
    time: Math.round(el.currentTime * 10) / 10,
    gain: el.volume,
  };
}
