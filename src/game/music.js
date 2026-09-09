const BACKGROUND_GAIN = 0.22;
const BLACK_HOLE_GAIN = 0.48;

const background = document.getElementById("bgm");
const blackHoleScore = document.getElementById("black-hole-score");
let lastRetry = 0;
let blackHoleProximity = 0;
let blackHoleTransit = false;
let blackHoleTransitProgress = 0;
let resetScoreWhenSilent = false;

if (background) {
  background.loop = true;
  background.volume = BACKGROUND_GAIN;
  window.__bgm = background;
  background.play().catch(() => {});
}

if (blackHoleScore) {
  blackHoleScore.loop = false;
  blackHoleScore.volume = 0;
  window.__blackHoleScore = blackHoleScore;
}

function approach(value, target, response = 4.2) {
  return value + (target - value) * Math.min(1, response / 60);
}

function playBlackHoleScore() {
  if (!blackHoleScore || document.hidden) return;
  blackHoleScore.play().catch(() => {});
}

export function setBlackHoleProximity(value) {
  blackHoleProximity = Math.max(0, Math.min(1, Number(value) || 0));
  if (blackHoleProximity > 0.015) {
    resetScoreWhenSilent = false;
    playBlackHoleScore();
  } else if (!blackHoleTransit) {
    resetScoreWhenSilent = true;
  }
}

export function startBlackHoleFinale(totalSeconds = 35) {
  if (!blackHoleScore) return;
  blackHoleTransit = true;
  blackHoleTransitProgress = 0;
  blackHoleProximity = 1;
  resetScoreWhenSilent = false;
  const cueFinale = () => {
    if (!Number.isFinite(blackHoleScore.duration) || blackHoleScore.duration <= 0) return;
    const cue = Math.max(0, blackHoleScore.duration - Math.max(1, totalSeconds) - 0.25);
    if (Math.abs(blackHoleScore.currentTime - cue) > 1.5) {
      blackHoleScore.currentTime = cue;
    }
    playBlackHoleScore();
  };
  if (blackHoleScore.readyState >= 1) cueFinale();
  else blackHoleScore.addEventListener("loadedmetadata", cueFinale, { once: true });
  playBlackHoleScore();
}

export function setBlackHoleTransitProgress(value) {
  blackHoleTransitProgress = Math.max(0, Math.min(1, Number(value) || 0));
}

export function stopBlackHoleScore() {
  blackHoleTransit = false;
  blackHoleTransitProgress = 0;
  blackHoleProximity = 0;
  resetScoreWhenSilent = true;
}

export function updateMusic() {
  const scoreTarget = BLACK_HOLE_GAIN * (blackHoleTransit
    ? 1 + blackHoleTransitProgress * 0.28
    : Math.pow(blackHoleProximity, 0.68));
  if (blackHoleScore) {
    blackHoleScore.volume = approach(blackHoleScore.volume, scoreTarget, scoreTarget > blackHoleScore.volume ? 5.4 : 2.2);
    if (scoreTarget > 0.008 && blackHoleScore.paused) playBlackHoleScore();
    if (resetScoreWhenSilent && blackHoleScore.volume < 0.006) {
      blackHoleScore.pause();
      blackHoleScore.currentTime = 0;
      blackHoleScore.volume = 0;
      resetScoreWhenSilent = false;
    }
  }

  if (!background) return;
  const backgroundTarget = BACKGROUND_GAIN * (1 - Math.min(0.94, Math.max(blackHoleProximity, blackHoleTransit ? 1 : 0)));
  background.volume = approach(background.volume, backgroundTarget, 3.4);
  if (!background.paused || document.hidden) return;
  const now = performance.now();
  if (now - lastRetry < 3000) return;
  lastRetry = now;
  background.play().catch(() => {});
}

export function primeMusic() {
  background?.play().catch(() => {});
  if (blackHoleProximity > 0.015 || blackHoleTransit) playBlackHoleScore();
}

export function musicDebug() {
  return {
    paused: background?.paused ?? null,
    time: background ? Math.round(background.currentTime * 10) / 10 : null,
    gain: background?.volume ?? null,
    blackHole: blackHoleScore ? {
      paused: blackHoleScore.paused,
      time: Math.round(blackHoleScore.currentTime * 10) / 10,
      gain: Math.round(blackHoleScore.volume * 1000) / 1000,
      proximity: Math.round(blackHoleProximity * 1000) / 1000,
      transit: blackHoleTransit,
      transitProgress: Math.round(blackHoleTransitProgress * 1000) / 1000,
    } : null,
  };
}
