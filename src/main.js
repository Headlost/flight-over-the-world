import { settings, setupSettings } from './game/settings.js';
import { disposeModel } from './game/dispose.js';
import { QUALITY, renderRatio, AdaptiveQuality, terrainStreamProfile } from './game/quality.js';
import { geocodeCity, setupLocationPicker } from './game/location.js';
import { validMessage, escapeHtml } from './game/protocol.js';
import { attributionSignature, renderAttributions } from './game/attribution.js';
import {
  WGS84_ELLIPSOID,
  CAMERA_FRAME,
  TilesRenderer,
} from "3d-tiles-renderer";
import {
  TilesFadePlugin,
  UpdateOnChangePlugin,
  TileCompressionPlugin,
  UnloadTilesPlugin,
  GLTFExtensionsPlugin,
  CesiumIonAuthPlugin,
} from "3d-tiles-renderer/plugins";
import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  Raycaster,
  Vector3,
  Matrix4,
  Color,
  Clock,
  FogExp2,
  Quaternion,
  TextureLoader,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  Box3,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
} from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { setLoader, hideLoader } from "./game/hud.js";
import { createPlaneMesh, PlaneController } from "./game/plane.js";
import {
  createParachutistModel,
  ParachutistController,
  setParachutistFirstPerson,
  setParachutistState,
  updateParachutistModel,
} from "./game/paraglider.js";
import { applyRotorState, spinRotors } from "./game/rotors.js";
import { createCarousel } from "./game/menuPreview.js";
import { createSky, SUN_DIR } from "./game/sky.js";
import { drawAirspeed, drawAltimeter, drawCompass } from "./game/instruments.js";
import { asset } from "./game/asset.js";
import {
  createExplosion,
  playExplosionSound,
  primeAudio,
} from "./game/explosion.js";
import { updateEngineSound, engineDebug } from "./game/engineSound.js";
import {
  updateMusic,
  primeMusic,
  musicDebug,
  isMusicMuted,
  toggleMusic,
  setBlackHoleProximity,
  setBlackHoleTransitProgress,
  startBlackHoleFinale,
  stopBlackHoleScore,
} from "./game/music.js";
import { streetViewUrl } from "./game/streetview.js";
import { createSolarSystem, SPACE_BODIES, SpaceFlightController } from "./game/space.js";
import {
  ContactConfirmation,
  parachutistCameraClimbAssist,
  raycastTerrain,
  raycastVisibleTerrain,
  rocketLaunchCameraPhase,
  updateChaseOffset,
} from "./game/flightSafety.js";

// rakieta stoi pionowo (+Y) — połóż ją nosem do przodu (-Z, konwencja lotu)
function prepareRocket(model) {
  model.rotation.x = -Math.PI / 2;
  return model;
}

function createRocketPlume() {
  const plume = new Group();
  plume.name = "rocket-engine-plume";
  plume.rotation.x = Math.PI / 2;
  const outerMaterial = new MeshBasicMaterial({
    color: 0xffa11f,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const coreMaterial = new MeshBasicMaterial({
    color: 0xfff1a3,
    transparent: true,
    opacity: 0.92,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const outer = new Mesh(new ConeGeometry(0.62, 5.8, 18, 1, true), outerMaterial);
  outer.position.y = 2.9;
  const core = new Mesh(new ConeGeometry(0.25, 3.8, 14, 1, true), coreMaterial);
  core.position.y = 1.9;
  plume.add(outer, core);
  plume.visible = false;
  plume.userData.outer = outer;
  plume.userData.core = core;
  plume.userData.outerMaterial = outerMaterial;
  plume.userData.coreMaterial = coreMaterial;
  plume.userData.space = false;
  return plume;
}

function attachRocketPlume(wrapper, model) {
  const box = new Box3().setFromObject(model);
  const plume = createRocketPlume();
  plume.position.set(0, 0, box.max.z + 0.04);
  wrapper.add(plume);
  wrapper.userData.rocketPlume = plume;
}

function updateRocketPlume(root, active, intensity = 1, space = false, elapsed = 0) {
  const plume = root?.userData?.rocketPlume;
  if (!plume) return;
  const power = Math.max(0.15, Math.min(1.35, Number(intensity) || 0));
  plume.visible = !!active;
  plume.userData.space = !!space;
  if (!active) return;
  const flicker = 0.92 + Math.sin(elapsed * 47) * 0.055 + Math.sin(elapsed * 83) * 0.025;
  plume.scale.set(0.82 + power * 0.18, (0.68 + power * 0.5) * flicker, 0.82 + power * 0.18);
  plume.userData.outerMaterial.color.setHex(space ? 0x147cff : 0xffa21a);
  plume.userData.coreMaterial.color.setHex(space ? 0xb8f4ff : 0xfff0a0);
  plume.userData.outerMaterial.opacity = space ? 0.72 : 0.7;
  plume.userData.coreMaterial.opacity = space ? 0.88 : 0.94;
}

// myśliwiec w GLB ma nos w +Z, a lot idzie w -Z
function prepareJet(model) {
  model.rotation.y = Math.PI;
  return model;
}

function createFirstPersonArms() {
  const rig = new Group();
  const sleeve = new MeshStandardMaterial({ color: 0x4b5d3b, roughness: 0.88 });
  const glove = new MeshStandardMaterial({ color: 0x1b2024, roughness: 0.72 });
  const strap = new MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.75 });
  const arms = [];
  const lines = [];
  for (const side of [-1, 1]) {
    const upper = new Mesh(new CylinderGeometry(0.095, 0.12, 0.58, 10), sleeve);
    upper.position.set(side * 0.29, -0.28, -0.48);
    upper.rotation.set(-1.02, 0, -side * 0.22);
    const forearm = new Mesh(new CylinderGeometry(0.075, 0.095, 0.55, 10), sleeve);
    forearm.position.set(side * 0.31, -0.4, -0.84);
    forearm.rotation.set(-1.24, 0, -side * 0.1);
    const hand = new Mesh(new SphereGeometry(0.105, 12, 8), glove);
    hand.position.set(side * 0.31, -0.48, -1.12);
    const brakeLine = new Mesh(new CylinderGeometry(0.009, 0.009, 1.3, 5), strap);
    brakeLine.position.set(side * 0.31, 0.11, -1.12);
    rig.add(upper, forearm, hand, brakeLine);
    arms.push({ forearm, hand, side });
    lines.push(brakeLine);
  }
  rig.userData.arms = arms;
  rig.userData.lines = lines;
  rig.userData.walkPhase = 0;
  rig.scale.setScalar(0.68);
  rig.position.y = -0.12;
  rig.visible = false;
  return rig;
}

function updateFirstPersonArms(rig, controls, dt, state, speed = 0) {
  if (!rig?.userData?.arms) return;
  const brake = Math.max(0, controls.pitch);
  const walking = state === "grounded" && Math.abs(speed) > 0.15;
  if (walking) rig.userData.walkPhase += Math.min(dt, 0.05) * 7.4 * Math.sign(speed || 1);
  for (const line of rig.userData.lines || []) line.visible = state !== "grounded";
  for (const [index, arm] of rig.userData.arms.entries()) {
    const steering = controls.roll * (index === 0 ? -1 : 1);
    const walkSwing = walking ? Math.sin(rig.userData.walkPhase) * arm.side * 0.42 : 0;
    const target = state === "grounded" ? -1.04 + walkSwing : -1.24 + brake * 0.32 + Math.max(0, steering) * 0.24;
    arm.forearm.rotation.x += (target - arm.forearm.rotation.x) * Math.min(1, dt * 9);
    arm.hand.position.y = state === "grounded" ? -0.43 + Math.abs(walkSwing) * 0.08 : -0.48 - brake * 0.18 - Math.max(0, steering) * 0.12;
    arm.hand.position.z = state === "grounded" ? -1.02 - walkSwing * 0.2 : -1.12;
  }
}
import {
  distanceM,
  offsetPoint,
  createBeacon,
  pickGuessStart,
  drawPolandMap,
  loadCountryGeo,
  loadContinentGeo,
  unprojectCountry,
  unprojectContinent,
  drawEuropeMap,
  loadWorldGeo,
  drawWorldMap,
  unprojectWorld,
} from "./game/modes.js";
import {
  detectLocale,
  getRegionPack,
  setRegionPack,
  regionPayload,
  guessHoldAlt,
} from "./game/regions.js";
import {
  parseRoomFromUrl,
  roomLink,
  hostRoom,
  joinRoom,
  wasHosting,
  rememberHost,
} from "./game/net.js";
import {
  bindVoice,
  ensureMic,
  setTalking,
  isTalking,
  voiceDenied,
  answerCall,
  syncVoiceCalls,
  dropVoicePeer,
  destroyVoice,
} from "./game/voice.js";

// zakresy trybu "Zgadnij region"
const GUESS_SCOPES = {
  pl: {
    load: loadCountryGeo,
    draw: drawPolandMap,
    unproject: unprojectCountry,
    sub: "Click a point on the map of Poland",
    status: "Picking a point in Poland…",
  },
  eu: {
    load: loadContinentGeo,
    draw: drawEuropeMap,
    unproject: unprojectContinent,
    sub: "Click a point on the map of Europe",
    status: "Picking a point in Europe…",
  },
  world: {
    load: loadWorldGeo,
    draw: drawWorldMap,
    unproject: unprojectWorld,
    sub: "Click a point on the world map",
    status: "Picking a point somewhere on Earth…",
  },
};

const ION_KEY = settings.ion;
const TERRAIN_ALT = 120; // przybliżona wysokość elipsoidalna nizin

// Access depends on the provider account, enabled asset, region and quotas.
const ION_GOOGLE_TILES_ASSET = "2275207";

const PLANES = {
  pa28: {
    file: asset("models/pa28.glb"),
    wingspan: 11,
    cruise: 48, boost: 65, brake: 30,
    cam: [0, 5.5, 15],
    name: "Piper PA-28",
    desc: "Light propeller – cruise 173, max 234 km/h",
    sound: "plane",
  },
  q400: {
    file: asset("models/q400.glb"),
    wingspan: 28,
    cruise: 75, boost: 185, brake: 45,
    cam: [0, 9, 32],
    name: "Dash 8 Q400",
    desc: "Regional turboprop – cruise 270, max 670 km/h",
    sound: "plane",
  },
  citation: {
    file: asset("models/citation.glb"),
    wingspan: 16,
    cruise: 92, boost: 250, brake: 55,
    cam: [0, 7, 24],
    name: "Cessna Citation",
    desc: "Business jet – cruise 330, max 900 km/h",
    sound: "jet",
  },
  jet: {
    file: asset("models/jet.glb"),
    wingspan: 10,
    cruise: 150, boost: 420, brake: 80,
    turnRate: 4,
    cam: [0, 6, 19],
    name: "Fighter",
    desc: "Combat jet – cruise 540, max 1510 km/h",
    sound: "jet",
    prepare: prepareJet,
  },
  rocket: {
    file: asset("models/rocket.glb"),
    wingspan: 12,
    cruise: 220, boost: 600, brake: 120,
    steering: 1.2,
    cam: [0, 6, 20],
    name: "Rocket",
    desc: "Space rocket · R vertical launch to orbit · Shift hyperdrive between planets",
    sound: "rocket",
    prepare: prepareRocket,
  },
  parachutist: {
    file: asset("models/parachutist.glb"),
    wingspan: 9.2,
    cruise: 10.5, boost: 15.3, brake: 6.7,
    cam: [0, 3.5, 11],
    name: "Parachutist",
    desc: "Land on roofs or streets · walk, run and relaunch",
    sound: "wind",
    build: createParachutistModel,
  },
};
const PLANE_ORDER = ["pa28", "q400", "citation", "jet", "rocket", "parachutist"];

const HOME_TIME = 600; // 10 min na dolot do domu
const GUESS_TIME = 60; // 1 min na rozpoznanie terenu
const HOME_CAPTURE_M = 600;
const HOME_BEACON_M = 1000;

let camera, detailCameras, scene, renderer, tiles, sun, sky, firstPersonRig;
let planeMesh, plane, beacon;
let solarSystem = null;
let earthFog = null;
let rocketLaunch = null;
let earthReentry = null;
let spaceModeActive = false;
let spaceNotice = "";
let spaceNoticeUntil = 0;
let spaceActionHintContext = "";
let spaceActionHintUntil = 0;
let spaceEnvironmentMessage = "";
let spaceEntryBody = null;
let spaceLandedBody = null;
let spaceEntryTransition = null;
let spaceEntryVisualTimer = null;
let blackHoleSequence = false;
let blackHoleTimer = null;
let blackHolePhaseTimer = null;
let blackHoleEntryTimer = null;
let blackHoleCountdownDelayTimer = null;
let blackHoleCountdownTimer = null;
let blackHolePhase = "idle";
let blackHoleGravity = null;
let blackHoleCaptureStartedAt = 0;
let blackHoleCaptureProgress = 0;
let blackHoleSequenceStartedAt = 0;
let blackHoleTesseractStartedAt = 0;
let tesseractVideoError = "";
let interstellarArrivalPending = false;
let interstellarArrivalStartedAt = 0;
let cooperFarmRocketReady = false;
const spaceFlight = new SpaceFlightController();
let groundAlt = TERRAIN_ALT;
let crashed = false;
let finished = false;
let loaderDismissed = false;
let gameReady = false;
const isMobile =
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && matchMedia("(pointer: coarse)").matches));
const BLACK_HOLE_VOID_MS = navigator.webdriver ? 1000 : 10000;
const BLACK_HOLE_APPROACH_MS = navigator.webdriver ? 500 : 5000;
const BLACK_HOLE_TESSERACT_MS = navigator.webdriver ? 1800 : 8200;
const BLACK_HOLE_COUNTDOWN_DELAY_MS = navigator.webdriver ? 800 : 4000;
const BLACK_HOLE_ENTRY_MS = BLACK_HOLE_VOID_MS + BLACK_HOLE_APPROACH_MS;
const BLACK_HOLE_SEQUENCE_MS = BLACK_HOLE_ENTRY_MS + BLACK_HOLE_TESSERACT_MS;
const BLACK_HOLE_CAPTURE_MS = navigator.webdriver ? 600 : 7000;
const BLACK_HOLE_CAPTURE_DISTANCE = 320;
const EARTH_EXPOSURE = 1.1;
const SPACE_EXPOSURE = 1.14;
const EARTH_CLEAR_COLOR = new Color(0x8ec8e8);
const EARTH_FOG_COLOR = new Color(0x9dd0ea);
const UPPER_ATMOSPHERE_COLOR = new Color(0x01030a);
const PLANET_ENTRY_FX_MS = navigator.webdriver ? 450 : 2600;
const FARM_SNAP_TIMEOUT_MS = navigator.webdriver ? 800 : 8000;
const COOPER_FARM = Object.freeze({
  lat: 50 + 24 / 60 + 23.1 / 3600,
  lon: -(114 + 12 / 60 + 15.4 / 3600),
  fallbackAltitude: 1310,
});
const START_FLAG = "fotw_starting";
const LAST_ERR = "fotw_lasterr";
function markStarting() {
  try { sessionStorage.setItem(START_FLAG, String(Date.now())); } catch { /* ignore */ }
}
function clearStarting() {
  try { sessionStorage.removeItem(START_FLAG); } catch { /* ignore */ }
}
function crashedLastStart() {
  try {
    const t = Number(sessionStorage.getItem(START_FLAG) || 0);
    return t > 0;
  } catch {
    return false;
  }
}
function rememberError(msg) {
  try { sessionStorage.setItem(LAST_ERR, String(msg || "").slice(0, 280)); } catch { /* ignore */ }
}
function lastError() {
  try { return sessionStorage.getItem(LAST_ERR) || ""; } catch { return ""; }
}
function clearError() {
  try { sessionStorage.removeItem(LAST_ERR); } catch { /* ignore */ }
}
const interruptedStartAtBoot = isMobile && (
  crashedLastStart() || lastError().includes("while loading terrain")
);
const reportedDeviceMemory = Number(navigator.deviceMemory || 0);
const memorySafeMode = isMobile && (
  interruptedStartAtBoot || (reportedDeviceMemory > 0 && reportedDeviceMemory <= 4)
);
const liteMode = isMobile;
if (liteMode) document.body.classList.add("lite");
if (memorySafeMode) document.body.classList.add("memory-safe");
let loadError = null;
let frameCount = 0;
let firstPersonActive = false;
let terrainDetailMode = "normal";
let detailCameraRegistered = 0;
let terrainDetailChangedAt = 0;
let terrainStreamingProfile = null;
let terrainStreamingKey = "";
let terrainBaseParseJobs = 1;
let unloadTilesPlugin = null;
let lastSurfaceProbeAt = -Infinity;
let lastWingProbeAt = -Infinity;
let lastCameraProbeAt = -Infinity;
let streetModeActive = false;
let externalStreetWindow = null;
let selectedPlane = "pa28";
let menuOpen = true;
let paused = false;
let pendingSnap = false; // po teleporcie: jednorazowe dosadzenie na właściwą wysokość
let startLat = 52.38871, startLon = 16.60069; // Niepruszewo
let camOffset = PLANES.pa28.cam;

// tryby gry
let mode = "free"; // free | home | guess
let homeTarget = null;
let timeLeft = 0;
let timerActive = false;
let guessOpen = false;
let guessAnswered = false;
let guessScope = "pl"; // pl | world
let awaitingSnap = false; // guess: menu/overlay czeka na pomiar terenu, start od razu na ~350 m
let awaitingSnapSince = 0;
let snapLastGh = null; // dosadzenie dopiero gdy pomiar terenu się ustabilizuje (kafelki się doprecyzują)
let snapStableCount = 0;
let snapFirstAt = 0;
let geoCache = null;
let beaconGrounded = false;
const explosions = [];
let shake = 0;
const matePos = new Vector3();
const mateQuat = new Quaternion();
const mateScale = new Vector3();
const mateUp = new Vector3();
const MATE_MARKER_MS = 10000;
const MATE_INTERP_MS = 130;
const MATE_SEND_MS = 40;
const PLAYER_COLORS = ["#7ec8e3", "#e37e7e", "#9dce6a", "#d4a5f5", "#f0c36e", "#6ec8c1"];
const NAME_ADJ = ["Swift", "Silent", "Red", "Night", "Wild", "White", "Golden", "Sky", "Sharp", "Storm", "Keen", "Bold"];
const NAME_NOUN = ["Eagle", "Falcon", "Wolf", "Fox", "Hawk", "Lynx", "Raven", "Badger", "Gnat", "Stag", "Puma", "Shark"];

function randomUsername() {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${a} ${n}`;
}

function uniquePlayerName(base) {
  const taken = new Set([mp.myName, ...[...mp.players.values()].map((p) => p.name)].filter(Boolean));
  if (base && !taken.has(base)) return base;
  for (let i = 0; i < 40; i++) {
    const next = randomUsername();
    if (!taken.has(next)) return next;
  }
  return base || randomUsername();
}

const mp = {
  active: false,
  host: false,
  roomId: "",
  myId: "",
  net: null,
  myName: "Host",
  myReady: false,
  myScore: 0,
  waiting: false,
  inRound: false,
  roundActive: false,
  players: new Map(),
  guesses: new Map(),
  poses: new Map(),
  mates: new Map(),
  seats: {},
  snapped: new Set(),
  goSent: false,
  waitingGo: false,
  truth: null,
  lastPoseAt: 0,
  poseSeq: 0,
  snapInfo: new Map(),
  rematch: new Set(),
  launching: false,
  goAt: 0,
  talkers: new Set(),
};

const ctrl = { roll: 0, pitch: 0, throttle: 0, cameraClimb: 0 };
const keys = new Set();
const raycaster = new Raycaster();
raycaster.firstHitOnly = true;
const cameraRaycaster = new Raycaster();
cameraRaycaster.firstHitOnly = true;
const cameraCollisionDir = new Vector3();
let cameraObstacleDistance = null;
const groundContact = new ContactConfirmation(2);
const wingContact = new ContactConfirmation(2);
const clock = new Clock();

const el = {
  gSpeed: document.getElementById("g-speed"),
  gAlt: document.getElementById("g-alt"),
  gHdg: document.getElementById("g-hdg"),
  banner: document.getElementById("f-banner"),
  bannerRetry: document.getElementById("banner-retry"),
  bannerMenu: document.getElementById("banner-menu"),
  menu: document.getElementById("menu"),
  city: document.getElementById("city-input"),
  start: document.getElementById("start-btn"),
  menuError: document.getElementById("menu-error"),
  modeDesc: document.getElementById("mode-desc"),
  pause: document.getElementById("pause"),
  resume: document.getElementById("btn-resume"),
  restart: document.getElementById("btn-restart"),
  carCanvas: document.getElementById("carousel-canvas"),
  carPrev: document.getElementById("car-prev"),
  carNext: document.getElementById("car-next"),
  carName: document.getElementById("car-name"),
  carDesc: document.getElementById("car-desc"),
  timerBox: document.getElementById("f-timer-box"),
  timer: document.getElementById("f-timer"),
  distBox: document.getElementById("f-dist-box"),
  dist: document.getElementById("f-dist"),
  guessmap: document.getElementById("guessmap"),
  gmCanvas: document.getElementById("gm-canvas"),
  gmResult: document.getElementById("gm-result"),
  gmClose: document.getElementById("gm-close"),
  gmRetry: document.getElementById("gm-retry"),
  gmSub: document.getElementById("gm-sub"),
  gmScoreLeft: document.getElementById("gm-score-left"),
  gmScoreRight: document.getElementById("gm-score-right"),
  mpWait: document.getElementById("mp-wait"),
  mpWaitText: document.getElementById("mp-wait-text"),
  guessScope: document.getElementById("guess-scope"),
  landing: document.getElementById("landing"),
  lobby: document.getElementById("lobby"),
  btnSolo: document.getElementById("btn-solo"),
  btnMulti: document.getElementById("btn-multi"),
  menuBack: document.getElementById("menu-back"),
  lobbyBack: document.getElementById("lobby-back"),
  lobbyPlayers: document.getElementById("lobby-players"),
  lobbyLink: document.getElementById("lobby-link"),
  lobbyCopy: document.getElementById("lobby-copy"),
  lobbyStart: document.getElementById("lobby-start"),
  lobbyStatus: document.getElementById("lobby-status"),
  lobbyScopes: document.getElementById("lobby-scopes"),
  lobbyModeDesc: document.getElementById("lobby-mode-desc"),
  lobbyCity: document.getElementById("lobby-city"),
  voiceInd: document.getElementById("voice-ind"),
  touch: document.getElementById("touch"),
  touchPause: document.getElementById("touch-pause"),
  stick: document.getElementById("stick"),
  stickKnob: document.getElementById("stick-knob"),
  touchBoost: document.getElementById("touch-boost"),
  touchBrake: document.getElementById("touch-brake"),
  touchCamera: document.getElementById("touch-camera"),
  touchTalk: document.getElementById("touch-talk"),
  touchAction: document.getElementById("touch-action"),
  touchSpecial: document.getElementById("touch-special"),
  touchEnter: document.getElementById("touch-enter"),
  gameTools: document.getElementById("game-tools"),
  musicMenuToggle: document.getElementById("music-menu-toggle"),
  musicLobbyToggle: document.getElementById("music-lobby-toggle"),
  musicGameToggle: document.getElementById("music-game-toggle"),
  landscapeToggle: document.getElementById("landscape-toggle"),
  rotateHint: document.getElementById("rotate-hint"),
  rotateLandscape: document.getElementById("rotate-landscape"),
  rotateDismiss: document.getElementById("rotate-dismiss"),
  spaceNav: document.getElementById("space-nav"),
  spaceModeLabel: document.getElementById("space-mode-label"),
  spaceTargetInfo: document.getElementById("space-target-info"),
  spaceEnter: document.getElementById("space-enter"),
  spaceActionHint: document.getElementById("space-action-hint"),
  spaceActionKey: document.getElementById("space-action-key"),
  spaceActionCopy: document.getElementById("space-action-copy"),
  planetEntry: document.getElementById("planet-entry"),
  planetEntryTitle: document.getElementById("planet-entry-title"),
  planetEntryDetail: document.getElementById("planet-entry-detail"),
  interstellar: document.getElementById("interstellar"),
  transitStatus: document.getElementById("transit-status"),
  transitCountdown: document.getElementById("transit-countdown"),
  tesseractVideo: document.getElementById("tesseract-video"),
  locationArrival: document.getElementById("location-arrival"),
  lobbyCarCanvas: document.getElementById("lobby-carousel-canvas"),
  lobbyCarPrev: document.getElementById("lobby-car-prev"),
  lobbyCarNext: document.getElementById("lobby-car-next"),
  lobbyCarName: document.getElementById("lobby-car-name"),
  lobbyCarDesc: document.getElementById("lobby-car-desc"),
  fatal: document.getElementById("fatal"),
  fatalText: document.getElementById("fatal-text"),
  fatalOk: document.getElementById("fatal-ok"),
  crashNote: document.getElementById("crash-note"),
  streetMode: document.getElementById("street-mode"),
  streetView: document.getElementById("streetview"),
  streetModeStatus: document.getElementById("street-mode-status"),
  streetReturn: document.getElementById("street-return"),
  streetPrompt: document.getElementById("street-prompt"),
  streetPromptCopy: document.getElementById("street-prompt-copy"),
  streetPromptNote: document.getElementById("street-prompt-note"),
  streetEnter: document.getElementById("street-enter"),
};

// karuzela pojazdów — jeden duży podgląd, strzałki w bok
const planePreviewItems = PLANE_ORDER.map((k) => ({
  key: k,
  file: PLANES[k].file,
  wingspan: PLANES[k].wingspan,
  prepare: PLANES[k].prepare,
  build: PLANES[k].build,
  update: k === "parachutist" ? (model, dt) => updateParachutistModel(model, "airborne", 0, dt) : null,
  ...(k === "parachutist" ? {
    previewYaw: Math.PI,
    previewSweep: 0.22,
    previewDistance: 1.55,
    previewHeight: 0.27,
    previewTargetY: 0,
  } : {}),
}));
const carousel = createCarousel(el.carCanvas, planePreviewItems, { mobile: isMobile });
let lobbyCarousel = createCarousel(el.lobbyCarCanvas, planePreviewItems, {
  lite: isMobile,
  mobile: isMobile,
});
let lobbyCarouselLive = !isMobile;

function ensureLobbyCarousel() {
  if (lobbyCarouselLive) return;
  lobbyCarousel.dispose();
  lobbyCarousel = createCarousel(el.lobbyCarCanvas, planePreviewItems, { mobile: true });
  lobbyCarouselLive = true;
  lobbyCarousel.show(selectedPlane, 0);
}
let planeIdx = 0;
function selectPlane(i, dir, silent = false) {
  planeIdx = (i + PLANE_ORDER.length) % PLANE_ORDER.length;
  selectedPlane = PLANE_ORDER[planeIdx];
  carousel.show(selectedPlane, dir);
  lobbyCarousel.show(selectedPlane, dir);
  const spec = PLANES[selectedPlane];
  el.carName.textContent = spec.name;
  el.carDesc.textContent = spec.desc;
  el.lobbyCarName.textContent = spec.name;
  el.lobbyCarDesc.textContent = spec.desc;
  document.body.classList.toggle("parachutist-selected", selectedPlane === "parachutist");
  document.body.classList.toggle("rocket-selected", selectedPlane === "rocket");
  if (!silent && mp.active && mp.net) {
    mp.net.send({ t: "plane", plane: selectedPlane, from: mp.myId });
    renderLobby();
  }
}
el.carPrev.addEventListener("click", () => selectPlane(planeIdx - 1, -1));
el.carNext.addEventListener("click", () => selectPlane(planeIdx + 1, 1));
el.lobbyCarPrev.addEventListener("click", () => selectPlane(planeIdx - 1, -1));
el.lobbyCarNext.addEventListener("click", () => selectPlane(planeIdx + 1, 1));
selectPlane(0, 0, true);
carousel.setActive(false);
lobbyCarousel.setActive(false);

// wybór trybu — same przyciski, instrukcja pokazuje się dopiero pod spodem
const MODE_PLACEHOLDERS = {
  free: "Starting city… e.g. Paris",
  home: "Your address… e.g. 5th Avenue, New York",
  guess: "",
};
const MODE_DESCS = {
  free: "Pick a starting city and fly with no time limit.",
  home: "We drop you ~30 km from home. You have 10 minutes to find your way back.",
  guess: "You have one minute in the air to get your bearings, then mark on the map where you are.",
};
function selectMode(m) {
  m = "free";
  mode = m;
  document.querySelectorAll("#menu .mode-card").forEach((b) =>
    b.classList.toggle("selected", b.dataset.mode === m)
  );
  el.modeDesc.textContent = MODE_DESCS[m];
  el.city.placeholder = MODE_PLACEHOLDERS[m];
  el.city.style.display = m === "guess" ? "none" : "";
  el.guessScope.style.display = m === "guess" ? "" : "none";
  el.menuError.textContent = "";
}
document.querySelectorAll("#menu .mode-card").forEach((btn) => {
  btn.addEventListener("click", () => selectMode(btn.dataset.mode));
});
document.querySelectorAll("#menu .scope-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    guessScope = btn.dataset.scope;
    document.querySelectorAll("#menu .scope-btn").forEach((b) =>
      b.classList.toggle("selected", b === btn)
    );
  });
});
selectMode("free");
detectLocale();
applyRegionLabels();

function applyRegionLabels() {
  const { country, continent } = getRegionPack();
  document.querySelectorAll('[data-scope="pl"]').forEach((b) => {
    b.textContent = `${country.flag} ${country.name}`;
  });
  document.querySelectorAll('[data-scope="eu"]').forEach((b) => {
    b.textContent = `${continent.flag} ${continent.name}`;
  });
  GUESS_SCOPES.pl.sub = `Click a point on the map of ${country.name}`;
  GUESS_SCOPES.pl.status = `Picking a point in ${country.name}…`;
  GUESS_SCOPES.eu.sub = `Click a point on the map of ${continent.name}`;
  GUESS_SCOPES.eu.status = `Picking a point in ${continent.name}…`;
}

function applyRemoteRegion(data) {
  if (!data || (!data.country && !data.continent)) return;
  setRegionPack(data.country, data.continent);
  geoCache = null;
  applyRegionLabels();
}

function showFatal(msg) {
  const text = msg || "Could not start on this phone.";
  rememberError(text);
  if (el.fatalText) el.fatalText.textContent = text;
  if (el.fatal) el.fatal.classList.remove("hidden");
  if (el.crashNote) {
    el.crashNote.hidden = false;
    el.crashNote.textContent = text;
  }
  if (el.menuError) el.menuError.textContent = text;
}

function hideFatal() {
  if (el.fatal) el.fatal.classList.add("hidden");
}

let crashHintShown = false;
function showCrashHints() {
  if (crashHintShown) return;
  const prev = lastError();
  if (!interruptedStartAtBoot && !prev) return;
  crashHintShown = true;
  const text = interruptedStartAtBoot
    ? "The previous terrain load was interrupted. Memory-safe mode is active — choose Single player and start again."
    : prev;
  if (el.crashNote) {
    el.crashNote.hidden = false;
    el.crashNote.textContent = text;
  }
  if (el.menuError) el.menuError.textContent = text;
  clearError();
}

el.fatalOk?.addEventListener("click", () => hideFatal());
showCrashHints();

function showLanding() {
  closeRoom();
  mp.active = false;
  menuOpen = true;
  el.landing.classList.remove("hidden");
  el.menu.classList.add("hidden");
  el.lobby.classList.add("hidden");
  carousel.setActive(false);
  lobbyCarousel.setActive(false);
  rememberHost("");
  history.replaceState(null, "", location.pathname + location.search);
}

function showSoloMenu() {
  mp.active = false;
  menuOpen = true;
  el.landing.classList.add("hidden");
  el.lobby.classList.add("hidden");
  el.menu.classList.remove("hidden");
  carousel.setActive(true);
  lobbyCarousel.setActive(false);
}

function showLobby() {
  menuOpen = true;
  el.landing.classList.add("hidden");
  el.menu.classList.add("hidden");
  el.lobby.classList.remove("hidden");
  carousel.setActive(false);
  ensureLobbyCarousel();
  lobbyCarousel.setActive(true);
  applyLobbySetup();
  renderLobby();
  updateVoiceUi();
}

function setLobbyStatus(msg, isErr = false) {
  el.lobbyStatus.textContent = msg;
  el.lobbyStatus.classList.toggle("err", isErr);
}

function otherPlayers() {
  return [...mp.players.values()];
}

function playablePlayers() {
  const list = [];
  if (!mp.waiting) list.push({ id: mp.myId });
  for (const p of mp.players.values()) if (!p.waiting) list.push(p);
  return list;
}

function inRoundPlayers() {
  const list = [];
  if (mp.inRound) list.push({ id: mp.myId, name: mp.myName });
  for (const p of mp.players.values()) if (p.inRound) list.push(p);
  return list;
}

function playerColor(id) {
  const ids = [mp.myId, ...mp.players.keys()];
  const i = Math.max(0, ids.indexOf(id));
  return PLAYER_COLORS[i % PLAYER_COLORS.length];
}

function playerName(id) {
  if (id === mp.myId) return "You";
  return mp.players.get(id)?.name || "Player";
}

function rosterPayload() {
  return [
    {
      id: mp.myId,
      name: mp.myName,
      plane: selectedPlane,
      ready: mp.myReady,
      score: mp.myScore,
      waiting: false,
      inRound: mp.inRound,
    },
    ...otherPlayers().map((p) => ({
      id: p.id,
      name: p.name,
      plane: p.plane,
      ready: p.ready,
      score: p.score,
      waiting: !!p.waiting,
      inRound: !!p.inRound,
    })),
  ];
}

function applyRoster(list = []) {
  const keep = new Set();
  for (const p of list) {
    if (p.id === mp.myId) {
      mp.myScore = p.score ?? mp.myScore;
      mp.waiting = !!p.waiting;
      mp.inRound = !!p.inRound;
      continue;
    }
    keep.add(p.id);
    const prev = mp.players.get(p.id) || {};
    mp.players.set(p.id, { ...prev, ...p });
  }
  for (const id of [...mp.players.keys()]) {
    if (!keep.has(id)) {
      mp.players.delete(id);
      disposeMate(id);
    }
  }
}

function broadcastRoster() {
  if (!mp.host || !mp.net) return;
  mp.net.send({
    t: "roster",
    players: rosterPayload(),
    roundActive: mp.roundActive,
    mode,
    scope: guessScope,
    city: el.lobbyCity.value,
    ...regionPayload(),
  });
}

function renderLobby() {
  const rows = [
    playerRow({
      name: mp.myName,
      plane: selectedPlane,
      ready: mp.myReady,
      score: mp.myScore,
      waiting: mp.waiting,
      inRound: mp.inRound && mp.roundActive,
    }, true),
  ];
  for (const p of otherPlayers()) rows.push(playerRow(p, false));
  if (mp.players.size === 0) {
    rows.push(`<div class="player-row empty">Waiting for players… send the link</div>`);
  }
  el.lobbyPlayers.innerHTML = rows.join("");
  el.lobbyScopes.classList.toggle("locked", !mp.host);
  document.querySelector(".lobby-modes")?.classList.toggle("locked", !mp.host);
  el.lobbyCity.classList.toggle("locked", !mp.host);
  el.lobbyCity.readOnly = !mp.host;
  if (mp.roomId) el.lobbyLink.value = roomLink(mp.roomId);

  const queued = mp.waiting || (mp.roundActive && !mp.inRound);
  el.lobbyStart.disabled = queued;
  el.lobbyStart.textContent = queued
    ? "Wait for next round"
    : mp.myReady
      ? "Cancel ready"
      : "Start";

  const playable = playablePlayers().length;
  const readyN = (mp.myReady && !mp.waiting ? 1 : 0) + otherPlayers().filter((p) => !p.waiting && p.ready).length;
  if (queued) setLobbyStatus("Round in progress – you will join the next one");
  else if (playable < 2) setLobbyStatus("Send the link to friends – everyone in the room must press Start");
  else if (mp.myReady && readyN === playable) setLobbyStatus("Starting…");
  else if (mp.myReady) setLobbyStatus(`Waiting for everyone to press Start (${readyN}/${playable})`);
  else setLobbyStatus(`Everyone press Start (${playable} players)`);
}

function playerRow(p, isSelf) {
  const plane = PLANES[p.plane]?.name || "";
  const pts = p.score ? ` · ${p.score} pts` : "";
  let badge = "WAITING";
  let cls = "";
  if (p.waiting) {
    badge = "QUEUED";
    cls = " waiting";
  } else if (p.inRound) {
    badge = "IN FLIGHT";
    cls = " ingame";
  } else if (p.ready) {
    badge = "READY";
    cls = " ready";
  }
  return `<div class="player-row${cls}"><div class="p-meta"><span>${escapeHtml(p.name)}${isSelf ? " (You)" : ""}</span><span class="p-plane">${escapeHtml(plane)}${escapeHtml(pts)}</span></div><span class="p-ready">${badge}</span></div>`;
}

function applyLobbySetup() {
  document.querySelectorAll("#lobby .mode-card").forEach((b) =>
    b.classList.toggle("selected", b.dataset.mode === mode)
  );
  el.lobbyModeDesc.textContent = MODE_DESCS[mode] || "";
  el.lobbyScopes.style.display = mode === "guess" ? "flex" : "none";
  el.lobbyCity.style.display = mode === "guess" ? "none" : "block";
  el.lobbyCity.placeholder = MODE_PLACEHOLDERS[mode] || "";
}

function selectLobbyMode(m, broadcast = false) {
  m = "free";
  mode = m;
  applyLobbySetup();
  if (broadcast && mp.host && mp.net) {
    mp.myReady = false;
    for (const p of mp.players.values()) p.ready = false;
    mp.net.send({ t: "mode", mode: m, city: el.lobbyCity.value, scope: guessScope, ...regionPayload() });
    broadcastRoster();
  }
  renderLobby();
}

function attachNet(api) {
  mp.net = api;
  bindVoice(api);
}

function voiceTargets() {
  const ids = [];
  if (!mp.host && mp.roomId) ids.push(mp.roomId);
  for (const id of mp.players.keys()) ids.push(id);
  return ids;
}

function refreshVoice() {
  if (!mp.active || !mp.net) return;
  syncVoiceCalls(voiceTargets());
}

let wantTalk = false;

async function startTalk() {
  if (!mp.active) return;
  wantTalk = true;
  if (isTalking()) return;
  unlockAudio();
  const mic = await ensureMic();
  if (!mic) {
    wantTalk = false;
    updateVoiceUi();
    return;
  }
  if (!wantTalk) return;
  refreshVoice();
  setTalking(true);
  mp.net?.send({ t: "talk", on: true, from: mp.myId });
  updateVoiceUi();
}

function stopTalk() {
  wantTalk = false;
  if (!isTalking()) return;
  setTalking(false);
  if (mp.active) mp.net?.send({ t: "talk", on: false, from: mp.myId });
  updateVoiceUi();
}

function updateVoiceUi() {
  const box = el.voiceInd;
  if (!box) return;
  if (!mp.active || !mp.net) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.classList.toggle("live", isTalking());
  if (voiceDenied()) {
    box.textContent = "Microphone blocked – allow access in the browser";
    return;
  }
  if (isTalking()) {
    box.textContent = "Talking…";
    return;
  }
  const who = [...mp.talkers].map((id) => playerName(id)).filter(Boolean);
  box.textContent = who.length
    ? `${who.join(", ")} talking…`
    : "Hold T to talk";
}

async function handleVoiceCall(call) {
  if (!call) return;
  if (!mp.active || !mp.players.has(call.peer)) { call.close(); return; }
  answerCall(call);
  refreshVoice();
}

function handleNetData(data, fromId) {
  if (!validMessage(data, mp.host && !!fromId)) return;
  if (mp.host && fromId && data.t !== "hello" && !mp.players.has(fromId)) return;
  if (mp.host && fromId) {
    data = { ...data, from: fromId };
    if (data.t !== "hello") mp.net.sendExcept(fromId, data);
  }

  if (data.t === "hello") {
    if (!mp.host || !fromId) return;
    const waiting = mp.roundActive;
    const name = uniquePlayerName(data.name);
    mp.players.set(fromId, {
      id: fromId,
      name,
      plane: data.plane || "pa28",
      ready: false,
      score: 0,
      waiting,
      inRound: false,
    });
    mp.net.sendTo(fromId, {
      t: "welcome",
      id: fromId,
      name,
      roster: rosterPayload(),
      roundActive: mp.roundActive,
      mode,
      scope: guessScope,
      city: el.lobbyCity.value,
      ...regionPayload(),
    });
    broadcastRoster();
    renderLobby();
    refreshVoice();
  } else if (data.t === "welcome") {
    if (data.id) mp.myId = data.id;
    if (data.name) mp.myName = data.name;
    mp.roundActive = !!data.roundActive;
    mp.waiting = !!data.roundActive;
    applyRemoteRegion(data);
    if (data.scope) setLobbyScope(data.scope);
    if (data.mode) selectLobbyMode(data.mode);
    if (data.city != null) el.lobbyCity.value = data.city;
    applyRoster(data.roster);
    applyLobbySetup();
    renderLobby();
    refreshVoice();
  } else if (data.t === "roster") {
    mp.roundActive = !!data.roundActive;
    applyRemoteRegion(data);
    if (data.scope) setLobbyScope(data.scope);
    if (data.mode) selectLobbyMode(data.mode);
    if (data.city != null) el.lobbyCity.value = data.city;
    applyRoster(data.players);
    applyLobbySetup();
    renderLobby();
    refreshVoice();
  } else if (data.t === "scope") {
    applyRemoteRegion(data);
    setLobbyScope(data.scope);
  } else if (data.t === "mode") {
    applyRemoteRegion(data);
    if (data.scope) setLobbyScope(data.scope);
    if (data.city != null) el.lobbyCity.value = data.city;
    mp.myReady = false;
    for (const p of mp.players.values()) p.ready = false;
    selectLobbyMode(data.mode);
  } else if (data.t === "city") {
    el.lobbyCity.value = data.city || "";
  } else if (data.t === "plane") {
    const id = data.from;
    if (id && mp.players.has(id)) mp.players.get(id).plane = data.plane || "pa28";
    renderLobby();
  } else if (data.t === "ready") {
    const id = data.from;
    if (id && mp.players.has(id)) mp.players.get(id).ready = !!data.ready;
    renderLobby();
    tryStartMp();
  } else if (data.t === "talk") {
    if (data.from && data.from !== mp.myId) {
      if (data.on) mp.talkers.add(data.from);
      else mp.talkers.delete(data.from);
      updateVoiceUi();
    }
  } else if (data.t === "snapped") {
    if (data.from) {
      mp.snapInfo.set(data.from, {
        h: data.h,
        gh: data.gh,
        heading: data.heading ?? 0,
        probed: data.probed !== false,
      });
      mp.snapped.add(data.from);
    }
    if (mp.host) tryReleaseGo();
  } else if (data.t === "go") {
    applyGo(data);
  } else if (data.t === "rematch") {
    if (data.from) mp.rematch.add(data.from);
    updateRematchWait();
    if (mp.host) tryLaunchRematch();
  } else if (data.t === "start") {
    if (data.seats && mp.myId && !Object.hasOwn(data.seats, mp.myId)) {
      mp.roundActive = true;
      mp.waiting = true;
      mp.inRound = false;
      renderLobby();
      return;
    }
    applyRemoteRegion(data);
    startMpFlight(data);
  } else if (data.t === "pose") {
    const id = data.from;
    if (!id || id === mp.myId) return;
    pushMatePose(id, data);
    loadMate(id, data.plane || "pa28");
  } else if (data.t === "guess") {
    const id = data.from;
    if (!id || id === mp.myId) return;
    mp.guesses.set(id, { lat: data.lat, lon: data.lon });
    if (guessOpen) maybeRevealGuesses();
  } else if (data.t === "done") {
    const id = data.from;
    if (id && mp.players.has(id)) mp.players.get(id).inRound = false;
    if (mp.host) {
      if (mp.rematch.size) abortRematchToLobby();
      else checkRoundClear();
    }
    renderLobby();
  } else if (data.t === "roundEnd") {
    const waitingRematch = mp.rematch.has(mp.myId) || !el.mpWait.classList.contains("hidden");
    finishRoomRound();
    hideMpWait();
    if (waitingRematch || guessOpen) {
      el.guessmap.classList.remove("show");
      guessOpen = false;
      showLobby();
    }
    renderLobby();
  }
}

function handlePeerJoined() {
  if (mp.host) return;
  mp.net?.send({ t: "hello", name: mp.myName, plane: selectedPlane });
}

function handlePeerLeft(peerId) {
  if (peerId) {
    dropVoicePeer(peerId);
    mp.talkers.delete(peerId);
    updateVoiceUi();
  }
  if (!peerId) {
    disposeAllMates();
    mp.players.clear();
    mp.roundActive = false;
    mp.inRound = false;
    mp.waiting = false;
    if (!menuOpen) backToLobby();
    else renderLobby();
    setLobbyStatus("Host left – the room closed", true);
    return;
  }
  const gone = mp.players.get(peerId);
  mp.players.delete(peerId);
  mp.poses.delete(peerId);
  mp.guesses.delete(peerId);
  disposeMate(peerId);
  if (mp.host) {
    checkRoundClear();
    broadcastRoster();
  }
  if (guessOpen) maybeRevealGuesses();
  renderLobby();
  if (gone) setLobbyStatus(`${gone.name} left the room`);
}

function handleNetError(err) {
  if (err?.type === "unavailable-id" && mp.host && mp.roomId) {
    openGuestLobby(mp.roomId);
    return;
  }
  const msg = err?.type === "peer-unavailable"
    ? "Host not found – they should open Multiplayer and not refresh, then open the link again"
    : err?.type === "unavailable-id"
      ? "This room is taken – joining as a guest…"
      : "Connection error – check your network and open the link again";
  setLobbyStatus(msg, true);
}

function closeRoom() {
  mp.net?.destroy();
  mp.net = null;
  mp.roomId = "";
  mp.myId = "";
  mp.host = false;
  mp.myReady = false;
  mp.myScore = 0;
  mp.waiting = false;
  mp.inRound = false;
  mp.roundActive = false;
  mp.players.clear();
  mp.guesses.clear();
  mp.poses.clear();
  mp.seats = {};
  mp.snapInfo.clear();
  mp.rematch.clear();
  mp.launching = false;
  hideMpWait();
  mp.talkers.clear();
  destroyVoice();
  updateVoiceUi();
  disposeAllMates();
}

function openHostLobby(existingId) {
  closeRoom();
  mp.active = true;
  mp.host = true;
  mp.myName = "Host";
  if (existingId) mp.roomId = existingId;
  selectLobbyMode("free");
  showLobby();
  setLobbyStatus("Creating room…");
  const api = hostRoom({
    onOpen(id) {
      mp.roomId = id;
      mp.myId = id;
      rememberHost(id);
      history.replaceState(null, "", `#r=${id}`);
      el.lobbyLink.value = roomLink(id);
      renderLobby();
    },
    onPeer: handlePeerJoined,
    onData: handleNetData,
    onCall: handleVoiceCall,
    onLeft: handlePeerLeft,
    onError: handleNetError,
  }, existingId);
  attachNet(api);
}

function openGuestLobby(id) {
  closeRoom();
  mp.active = true;
  mp.host = false;
  mp.myName = randomUsername();
  mp.roomId = id;
  showLobby();
  el.lobbyLink.value = roomLink(id);
  setLobbyStatus("Joining room…");
  history.replaceState(null, "", `#r=${id}`);
  const api = joinRoom(id, {
    onStatus(msg) {
      setLobbyStatus(msg);
    },
    onOpen(_hostId, myId) {
      if (myId) mp.myId = myId;
      renderLobby();
    },
    onPeer: handlePeerJoined,
    onData: handleNetData,
    onCall: handleVoiceCall,
    onLeft: handlePeerLeft,
    onError: handleNetError,
  });
  attachNet(api);
}

function tryStartMp() {
  if (!mp.host || !mp.myReady || mp.roundActive) return;
  const others = otherPlayers().filter((p) => !p.waiting);
  if (!others.length || others.some((p) => !p.ready)) return;
  launchMpRound();
}

async function launchMpRound() {
  if (mp.launching) return;
  mp.launching = true;
  el.lobbyStart.disabled = true;
  showMpWait(mode === "guess" ? "Picking a new point…" : "Preparing the flight…");
  try {
    if (mode === "guess") {
      const scope = GUESS_SCOPES[guessScope];
      setLobbyStatus(scope.status);
      const p = pickGuessStart(guessScope);
      const msg = { t: "start", mode, lat: p.lat, lon: p.lon, scope: guessScope, seats: buildSeats(), ...regionPayload() };
      mp.net?.send(msg);
      startMpFlight(msg);
    } else if (mode === "home") {
      const addr = el.lobbyCity.value.trim();
      if (!addr) {
        mp.launching = false;
        hideMpWait();
        setLobbyStatus("Enter your home address", true);
        el.lobbyStart.disabled = false;
        return;
      }
      setLobbyStatus("Looking up address…");
      const loc = await geocodeCity(addr);
      if (!loc) {
        mp.launching = false;
        hideMpWait();
        setLobbyStatus("Could not find that address", true);
        el.lobbyStart.disabled = false;
        return;
      }
      const start = offsetPoint(loc.lat, loc.lon, 20 + Math.random() * 10);
      const msg = {
        t: "start",
        mode,
        lat: start.lat,
        lon: start.lon,
        homeLat: loc.lat,
        homeLon: loc.lon,
        seats: buildSeats(),
      };
      mp.net?.send(msg);
      startMpFlight(msg);
    } else {
      const city = el.lobbyCity.value.trim() || "Niepruszewo";
      setLobbyStatus(`Looking up: ${city}…`);
      const loc = await geocodeCity(city);
      if (!loc) {
        mp.launching = false;
        hideMpWait();
        setLobbyStatus(`Could not find “${city}”`, true);
        el.lobbyStart.disabled = false;
        return;
      }
      const msg = { t: "start", mode, lat: loc.lat, lon: loc.lon, seats: buildSeats() };
      mp.net?.send(msg);
      startMpFlight(msg);
    }
  } catch {
    mp.launching = false;
    hideMpWait();
    setLobbyStatus("Error – check your network and try again", true);
    el.lobbyStart.disabled = false;
  }
}

function buildSeats() {
  const seats = {};
  let i = 0;
  seats[mp.myId] = i++;
  for (const p of otherPlayers()) {
    if (!p.waiting) seats[p.id] = i++;
  }
  return seats;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function pushMatePose(id, data) {
  const seq = data.seq ?? 0;
  let track = mp.poses.get(id);
  if (!track) {
    track = { seq: -1, samples: [], clockOff: null, plane: data.plane };
    mp.poses.set(id, track);
  }
  if (seq && seq <= track.seq) return;
  if (seq) track.seq = seq;
  if (data.plane) track.plane = data.plane;
  const localNow = performance.now();
  const senderAt = typeof data.at === "number" ? data.at : localNow;
  if (track.clockOff == null) track.clockOff = localNow - senderAt;
  else track.clockOff += (localNow - senderAt - track.clockOff) * 0.04;
  const last = track.samples[track.samples.length - 1];
  const at = Math.max(senderAt + track.clockOff, last ? last.at + 1 : 0);
  track.samples.push({
    at,
    lat: data.lat,
    lon: data.lon,
    h: data.h,
    heading: data.heading,
    pitch: data.pitch,
    roll: data.roll,
    state: data.state || "airborne",
    motion: data.motion || 0,
  });
  if (track.samples.length > 24) track.samples.splice(0, track.samples.length - 24);
}

function seedMatePose(id, lat, lon, h, planeKey) {
  if (!id || id === mp.myId) return;
  loadMate(id, planeKey || "pa28");
  mp.poses.set(id, {
    seq: -1,
    samples: [{ at: performance.now(), lat, lon, h, heading: 0, pitch: 0, roll: 0, state: "airborne", motion: 0 }],
    clockOff: null,
    plane: planeKey,
  });
}

function seedAllMates(h) {
  const lat0 = mp.truth?.lat;
  const lon0 = mp.truth?.lon;
  if (lat0 == null || lon0 == null) return;
  const total = Object.keys(mp.seats).length || 1;
  for (const [id, seat] of Object.entries(mp.seats)) {
    if (id === mp.myId) continue;
    const spawn = offsetByIndex(lat0, lon0, Number(seat), total);
    seedMatePose(id, spawn.lat, spawn.lon, h, mp.players.get(id)?.plane || "pa28");
  }
}

function offsetByIndex(lat, lon, index, total) {
  if (total <= 1) return { lat, lon };
  const spacingM = 12;
  const dE = (index - (total - 1) / 2) * spacingM;
  const R = 6378137;
  return {
    lat,
    lon: lon + (dE / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI),
  };
}

function markRoundStarted(seats) {
  mp.roundActive = true;
  mp.inRound = !!(seats && seats[mp.myId] != null);
  mp.waiting = !mp.inRound;
  mp.myReady = false;
  for (const p of mp.players.values()) {
    p.ready = false;
    p.inRound = !!(seats && seats[p.id] != null);
  }
}

async function startMpFlight(msg) {
  mode = "free";
  guessScope = msg.scope || guessScope;
  mp.active = true;
  mp.guesses.clear();
  mp.poses.clear();
  mp.poseSeq = 0;
  mp.truth = { lat: msg.lat, lon: msg.lon };
  mp.seats = msg.seats || {};
  mp.snapped = new Set();
  mp.snapInfo.clear();
  mp.rematch.clear();
  mp.goSent = false;
  mp.waitingGo = false;
  mp.launching = false;
  mp.goAt = 0;
  markRoundStarted(mp.seats);
  homeTarget = msg.homeLat != null ? { lat: msg.homeLat, lon: msg.homeLon } : null;
  timeLeft = mode === "guess" ? GUESS_TIME : mode === "home" ? HOME_TIME : 0;
  timerActive = false;
  menuOpen = true;
  guessOpen = false;
  crashed = false;
  finished = false;
  el.guessmap.classList.remove("show");
  el.lobby.classList.add("hidden");
  hideBanner();
  el.lobbyStart.disabled = false;
  setLobbyStatus("Loading terrain… waiting for everyone");
  showMpWait("Loading terrain… waiting for everyone");
  const seat = mp.seats[mp.myId] ?? 0;
  const total = Object.keys(mp.seats).length || 1;
  const spawn = offsetByIndex(msg.lat, msg.lon, seat, total);
  if (selectedPlane !== planeMesh?.userData?.key) loadPlane(selectedPlane);
  beginFlight(spawn.lat, spawn.lon);
  seedAllMates(plane.height);
  if (mode === "home" && homeTarget) placeBeaconAt(homeTarget.lat, homeTarget.lon);
  if (mp.host) {
    broadcastRoster();
    const releaseIfSnapped = () => {
      if (!mp.host || !mp.roundActive || mp.goSent) return;
      if ([...mp.snapInfo.values()].some(isTerrainSnap)) applyGo();
    };
    setTimeout(releaseIfSnapped, 12000);
    setTimeout(releaseIfSnapped, 22000);
  }
}

function reportSnapped() {
  if (!mp.active || !mp.inRound || mp.goSent || mp.waitingGo) return;
  mp.waitingGo = true;
  setLobbyStatus("Waiting until everyone is ready…");
  showMpWait("Waiting until everyone is ready…");
  const info = {
    h: plane.height,
    gh: groundAlt,
    heading: 0,
    probed: snapLastGh !== null,
  };
  mp.snapInfo.set(mp.myId, info);
  mp.net?.send({ t: "snapped", from: mp.myId, ...info });
  if (mp.host) {
    mp.snapped.add(mp.myId);
    tryReleaseGo();
  }
}

function tryReleaseGo() {
  if (!mp.host || mp.goSent) return;
  const need = Object.keys(mp.seats || {});
  if (!need.length || !need.every((id) => mp.snapped.has(id))) return;
  if (![...mp.snapInfo.values()].some(isTerrainSnap)) return;
  applyGo();
}

function snapAgl() {
  if (mode === "guess") return 350;
  return selectedPlane === "parachutist" ? 140 : 320;
}

function spawnHoldAlt() {
  if (mode === "guess") return guessHoldAlt(guessScope);
  return 6000;
}

function isTerrainSnap(s) {
  if (!s || !Number.isFinite(s.h) || !Number.isFinite(s.gh)) return false;
  if (s.probed === false) return false;
  const agl = s.h - s.gh;
  if (agl < 60 || agl > 500) return false;
  if (Math.abs(s.h - spawnHoldAlt()) < 300) return false;
  return true;
}

function buildGoPayload() {
  const snaps = [...mp.snapInfo.values()].filter(isTerrainSnap);
  if (!snaps.length) return null;
  const ghs = snaps.map((s) => s.gh).sort((a, b) => a - b);
  const gh = ghs[Math.floor(ghs.length / 2)];
  return { h: gh + snapAgl(), gh, heading: 0 };
}

function applyGo(msg) {
  if (mp.goSent) return;
  const payload = msg && Number.isFinite(msg.h)
    ? { h: msg.h, gh: msg.gh, heading: msg.heading ?? 0 }
    : buildGoPayload();
  if (!payload) return;
  mp.goSent = true;
  mp.waitingGo = false;
  if (mp.host) mp.net?.send({ t: "go", ...payload });
  pendingSnap = false;
  awaitingSnap = false;
  if (plane && payload.h != null) {
    plane.height = payload.h;
    plane.heading = payload.heading ?? 0;
    plane.pitch = 0;
    plane.roll = 0;
    ctrl.roll = 0;
    ctrl.pitch = 0;
    groundAlt = payload.gh ?? payload.h - snapAgl();
    if (plane instanceof ParachutistController) {
      plane.state = "airborne";
      plane.verticalSpeed = -1.2;
    }
  }
  camInit = false;
  mp.goAt = performance.now();
  mp.lastPoseAt = 0;
  seedAllMates(payload.h ?? plane.height);
  hideMpWait();
  finishSnapStart();
}

function leaveRound() {
  const wasIn = mp.inRound;
  mp.inRound = false;
  mp.myReady = false;
  if (wasIn) mp.net?.send({ t: "done", from: mp.myId });
  if (mp.host) {
    if (mp.rematch.size) abortRematchToLobby();
    else checkRoundClear();
  }
}

function checkRoundClear() {
  if (!mp.host) return;
  if (mp.inRound || otherPlayers().some((p) => p.inRound)) return;
  finishRoomRound();
  mp.net?.send({ t: "roundEnd" });
  broadcastRoster();
}

function finishRoomRound() {
  mp.roundActive = false;
  mp.inRound = false;
  mp.waiting = false;
  mp.myReady = false;
  for (const p of mp.players.values()) {
    p.waiting = false;
    p.inRound = false;
    p.ready = false;
  }
  mp.guesses.clear();
  mp.poses.clear();
  mp.snapInfo.clear();
  mp.rematch.clear();
  mp.launching = false;
  hideAllMates();
}

function showMpWait(text) {
  if (text) el.mpWaitText.textContent = text;
  el.mpWait.classList.remove("hidden");
}

function hideMpWait() {
  el.mpWait.classList.add("hidden");
}

function rematchNeeded() {
  return inRoundPlayers().map((p) => p.id);
}

function updateRematchWait() {
  if (!mp.rematch.has(mp.myId)) return;
  const need = rematchNeeded();
  const n = need.filter((id) => mp.rematch.has(id)).length;
  showMpWait(`Waiting for everyone to click… ${n}/${need.length || 1}`);
}

function requestRematch() {
  if (!mp.active || mp.rematch.has(mp.myId) || mp.launching) return;
  mp.rematch.add(mp.myId);
  mp.net?.send({ t: "rematch", from: mp.myId });
  hideBanner();
  el.gmRetry.style.display = "none";
  el.gmClose.style.display = "none";
  updateRematchWait();
  if (mp.host) tryLaunchRematch();
}

function tryLaunchRematch() {
  if (!mp.host || mp.launching) return;
  const need = rematchNeeded();
  if (!need.length || need.some((id) => !mp.rematch.has(id))) return;
  launchMpRound();
}

function abortRematchToLobby() {
  if (!mp.host) return;
  finishRoomRound();
  mp.net?.send({ t: "roundEnd" });
  broadcastRoster();
}

function backToLobby() {
  releaseLandscapeView();
  hideBanner();
  menuOpen = true;
  timerActive = false;
  guessOpen = false;
  awaitingSnap = false;
  crashed = false;
  finished = false;
  beacon.visible = false;
  el.guessmap.classList.remove("show");
  leaveRound();
  if (planeMesh) planeMesh.visible = true;
  showLobby();
}

function setLobbyScope(scope, broadcast = false) {
  guessScope = scope;
  document.querySelectorAll("#lobby-scopes .scope-btn").forEach((b) =>
    b.classList.toggle("selected", b.dataset.scope === scope)
  );
  if (broadcast && mp.host && mp.net) mp.net.send({ t: "scope", scope, ...regionPayload() });
}
document.querySelectorAll("#lobby-scopes .scope-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!mp.host) return;
    setLobbyScope(btn.dataset.scope, true);
  });
});
document.querySelectorAll("#lobby .mode-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!mp.host) return;
    selectLobbyMode(btn.dataset.mode, true);
  });
});
el.lobbyCity.addEventListener("input", () => {
  if (mp.host && mp.net) mp.net.send({ t: "city", city: el.lobbyCity.value });
});

function init() {
  if (!ION_KEY) {
    hideLoader();
    showFatal('Terrain is temporarily unavailable. Please try again later.');
    return;
  }
  setLoader("Start…", 0.4);

  try {
  scene = new Scene();
  scene.background = new Color(0x8ec8e8);
  earthFog = new FogExp2(0x9dd0ea, 0.00007);
  scene.fog = earthFog;

  renderer = new WebGLRenderer({
    antialias: !isMobile,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setClearColor(0x8ec8e8);
  renderer.outputColorSpace = SRGBColorSpace;
  applyPixelRatio();
  const initialViewport = gameViewportSize();
  renderer.setSize(initialViewport.width, initialViewport.height);
  renderer.toneMapping = 4;
  renderer.toneMappingExposure = EARTH_EXPOSURE;
  renderer.shadowMap.enabled = QUALITY[settings.quality].shadows;
  renderer.shadowMap.type = 2; // PCFSoft
  renderer.domElement.id = "game-canvas";
  document.body.appendChild(renderer.domElement);

  scene.add(new HemisphereLight(0xbfd8ee, 0x5a7048, 1.15));
  sun = new DirectionalLight(0xfff2dd, 2.0);
  sun.castShadow = QUALITY[settings.quality].shadows;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2500;
  sun.shadow.camera.left = -450;
  sun.shadow.camera.right = 450;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 2.0;
  scene.add(sun);
  scene.add(sun.target);

  camera = new PerspectiveCamera(70, initialViewport.width / initialViewport.height, 1, 2e6);
  // One low-resolution camera sweeps off-screen directions progressively. This
  // leaves bandwidth and GPU time for the player's visible view first.
  detailCameras = [new PerspectiveCamera(84, 16 / 9, 0.1, 1400)];
  firstPersonRig = createFirstPersonArms();
  camera.add(firstPersonRig);
  scene.add(camera);

  tiles = new TilesRenderer();
  if (ION_KEY) {
    tiles.registerPlugin(
      new CesiumIonAuthPlugin({
        apiToken: ION_KEY,
        assetId: ION_GOOGLE_TILES_ASSET,
        autoRefreshToken: true,
        useRecommendedSettings: false,
      })
    );
  }
  // Keep texture mipmaps: anisotropic filtering needs them for crisp oblique
  // roofs and facades. Index compression still reduces geometry memory.
  tiles.registerPlugin(new TileCompressionPlugin({ disableMipmaps: false }));
  tiles.registerPlugin(new UpdateOnChangePlugin());
  unloadTilesPlugin = new UnloadTilesPlugin({
    delay: memorySafeMode ? 1200 : isMobile ? 2500 : 12000,
    bytesTarget: memorySafeMode ? 72e6 : isMobile ? 110e6 : 380e6,
  });
  tiles.registerPlugin(unloadTilesPlugin);
  tiles.registerPlugin(new TilesFadePlugin({
    fadeDuration: 120,
    maximumFadeOutTiles: memorySafeMode ? 8 : isMobile ? 16 : 24,
  }));
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  const cpuThreads = navigator.hardwareConcurrency || 4;
  terrainBaseParseJobs = memorySafeMode ? 1 : isMobile ? 2 : Math.max(2, Math.min(3, Math.floor(cpuThreads / 2)));
  tiles.parseQueue.maxJobs = terrainBaseParseJobs;
  tiles.downloadQueue.maxJobsPerOrigin = memorySafeMode ? 3 : isMobile ? 4 : 8;
  tiles.errorFalloffDensity = 1e-3;
  tiles.group.rotation.x = -Math.PI / 2;
  tiles.group.visible = false;
  scene.add(tiles.group);
  tiles.setResolutionFromRenderer(camera, renderer);
  tiles.setCamera(camera);
  applyQuality();
  tiles.addEventListener('load-model', ({ scene: model }) => {
    const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.map) { material.map.anisotropy = anisotropy; material.map.needsUpdate = true; }
      }
    });
  });
  if (isMobile) tiles.loadSiblings = false;

  tiles.addEventListener('load-error', () => {
    loadError = 'Terrain could not load. Check your connection and try another departure or try again later.';
    flightStatus.textContent = loadError;
  });
  tiles.addEventListener('load-model', () => { loadError = null; });

  // niebo — proceduralna kopuła (gradient + słońce + chmury FBM),
  // horyzont = dokładnie kolor mgły, więc nie ma przerwy ani poświaty
  sky = createSky(0x9dd0ea);
  scene.add(sky.mesh);

  if (!isMobile) {
    new TextureLoader().load(asset("textures/sky_day.jpg"), (tex) => {
      tex.mapping = EquirectangularReflectionMapping;
      tex.colorSpace = SRGBColorSpace;
      scene.environment = tex;
    });
  }

  beacon = createBeacon();
  beacon.visible = false;
  scene.add(beacon);

  loadPlane(selectedPlane);
  resetFlight(startLat, startLon);
  if (planeMesh) planeMesh.visible = false;
  loaderDismissed = true;
  hideLoader();

  window.addEventListener("resize", onResize);
  bindOrbit(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    window.__ctxLost = true;
    showFatal("The graphics context was lost. Select Performance in Settings, then reload the page.");
  });
  window.__game = { get planeMesh() { return planeMesh; }, get plane() { return plane; }, get camera() { return camera; } };
  window.__scene = scene;
  gameReady = true;
  showCrashHints();
  } catch (err) {
    console.error(err);
    const msg = "The 3D engine could not start. Check WebGL support and hardware acceleration.";
    setLoader(msg, 0);
    showFatal(err?.message ? `${msg} (${err.message})` : msg);
  }
}

function loadPlane(key) {
  const spec = PLANES[key];
  camOffset = spec.cam;
  disposeModel(planeMesh);
  planeMesh = createPlaneMesh(); // fallback na czas ładowania
  planeMesh.userData.key = key;
  applyRotorState(planeMesh, true);
  scene.add(planeMesh);
  const placeholder = planeMesh;

  new GLTFLoader().load(spec.file, (gltf) => {
    if (planeMesh !== placeholder) { disposeModel(gltf.scene); return; }
    const model = spec.build ? spec.build(gltf) : gltf.scene;
    if (spec.prepare) spec.prepare(model);
    if (!spec.build) {
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3());
      model.scale.setScalar(spec.wingspan / Math.max(size.x, size.y, size.z));
      box.setFromObject(model);
      model.position.sub(box.getCenter(new Vector3()));
    }
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.metalness = 0.15;
        o.material.roughness = 0.65;
        o.castShadow = true;
      }
    });
    const wrapper = spec.build ? model : new Group();
    if (!spec.build) wrapper.add(model);
    wrapper.userData.prop = null;
    wrapper.userData.key = key;
    if (key === "rocket") attachRocketPlume(wrapper, model);
    applyRotorState(wrapper, true);
    wrapper.visible = planeMesh.visible;
    disposeModel(planeMesh);
    planeMesh = wrapper;
    scene.add(planeMesh);
    if (key === "parachutist" && plane) setParachutistState(planeMesh, plane.state, Math.abs(plane.speed), true);
  });
}

function disposeMate(id) {
  const mate = mp.mates.get(id);
  disposeModel(mate?.mesh);
  disposeModel(mate?.marker);
  mp.mates.delete(id);
}

function disposeAllMates() {
  for (const id of [...mp.mates.keys()]) disposeMate(id);
}

function hideAllMates() {
  for (const mate of mp.mates.values()) {
    if (mate.mesh) mate.mesh.visible = false;
    if (mate.marker) mate.marker.visible = false;
  }
}

function createMateMarker() {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: 0xffd34d, depthTest: false });
  const shaft = new Mesh(new CylinderGeometry(0.45, 0.45, 9, 7), mat);
  shaft.position.y = 6;
  const head = new Mesh(new ConeGeometry(2.6, 5.5, 7), mat);
  head.rotation.x = Math.PI;
  head.position.y = -1.2;
  g.add(shaft, head);
  g.visible = false;
  g.renderOrder = 10;
  scene.add(g);
  return g;
}

function ensureMateMarker(mate) {
  if (!mate.marker && scene) mate.marker = createMateMarker();
  return mate.marker;
}

function loadMate(id, key) {
  if (!id || !key || !PLANES[key] || !scene) return;
  const prev = mp.mates.get(id);
  if (prev?.key === key && prev.mesh) return;
  disposeMate(id);
  const spec = PLANES[key];
  const placeholder = createPlaneMesh();
  applyRotorState(placeholder, true);
  placeholder.visible = false;
  scene.add(placeholder);
  mp.mates.set(id, { mesh: placeholder, key });
  new GLTFLoader().load(spec.file, (gltf) => {
    const cur = mp.mates.get(id);
    if (!cur || cur.mesh !== placeholder) { disposeModel(gltf.scene); return; }
    const model = spec.build ? spec.build(gltf) : gltf.scene;
    if (spec.prepare) spec.prepare(model);
    if (!spec.build) {
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3());
      model.scale.setScalar(spec.wingspan / Math.max(size.x, size.y, size.z));
      box.setFromObject(model);
      model.position.sub(box.getCenter(new Vector3()));
    }
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.metalness = 0.15;
        o.material.roughness = 0.65;
        o.castShadow = true;
      }
    });
    const wrapper = spec.build ? model : new Group();
    if (!spec.build) wrapper.add(model);
    wrapper.userData.key = key;
    wrapper.visible = cur.mesh.visible;
    applyRotorState(wrapper, true);
    disposeModel(cur.mesh);
    scene.add(wrapper);
    mp.mates.set(id, { mesh: wrapper, key, marker: cur.marker });
  });
}

function resetFlight(latDeg, lonDeg) {
  leaveSpaceFlight();
  const spec = PLANES[selectedPlane];
  startLat = latDeg;
  startLon = lonDeg;
  // wysoki spawn poza nizinną Polską, żeby nie trafić w góry zanim teren się zmierzy
  // (menu i tak zostaje do czasu dosadzenia — spawn jest niewidoczny)
  const spawnAlt = mode === "guess" ? guessHoldAlt(guessScope) : 6000;
  plane = selectedPlane === "parachutist"
    ? new ParachutistController(latDeg, lonDeg, spawnAlt, 0)
    : new PlaneController(latDeg, lonDeg, spawnAlt, 0, spec);
  groundAlt = TERRAIN_ALT;
  pendingSnap = true; // udany, ustabilizowany pomiar terenu dosadzi samolot na właściwą wysokość
  snapLastGh = null;
  snapStableCount = 0;
  snapFirstAt = 0;
  crashed = false;
  finished = false;
  shake = 0;
  ctrl.roll = 0;
  ctrl.pitch = 0;
  ctrl.cameraClimb = 0;
  lastSurfaceProbeAt = -Infinity;
  lastWingProbeAt = -Infinity;
  lastCameraProbeAt = -Infinity;
  groundContact.reset();
  wingContact.reset();
  camInit = false;
  if (planeMesh) planeMesh.visible = true;
  hideBanner();
}

function applyPixelRatio() {
  if (!renderer) return;
  const gl = renderer.getContext();
  const size = Math.min(renderer.capabilities.maxTextureSize, ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  const viewport = gameViewportSize();
  renderer.setPixelRatio(renderRatio(settings.quality, viewport.width, viewport.height, devicePixelRatio || 1, size) * (settings.adaptive ? adaptiveQuality.scale : 1));
}

function gameViewportSize() {
  return document.documentElement.classList.contains("virtual-landscape")
    ? { width: innerHeight, height: innerWidth }
    : { width: innerWidth, height: innerHeight };
}

function onResize() {
  if (!camera || !renderer) return;
  syncVirtualLandscape();
  const viewport = gameViewportSize();
  camera.aspect = viewport.width / viewport.height;
  camera.updateProjectionMatrix();
  applyPixelRatio();
  renderer.setSize(viewport.width, viewport.height);
}

function frameAt(lat, lon, height, az, elv, roll, target = new Matrix4()) {
  WGS84_ELLIPSOID.getObjectFrame(lat, lon, height, az, elv, roll, target, CAMERA_FRAME);
  target.premultiply(tiles.group.matrixWorld);
  return target;
}

const _beaconFrame = new Matrix4();
const _groundOrigin = new Vector3();
const _groundDown = new Vector3();
const _groundPoint = new Vector3();
function probeGround(lat, lon, refHeight) {
  WGS84_ELLIPSOID.getCartographicToPosition(lat, lon, refHeight + 100, _groundOrigin);
  _groundOrigin.applyMatrix4(tiles.group.matrixWorld);
  _groundDown.copy(_groundOrigin).normalize().negate();
  raycaster.set(_groundOrigin, _groundDown);
  raycaster.far = refHeight + 1200; // musi sięgnąć poziomu morza nawet z wysokiego spawnu
  const hit = raycastTerrain(tiles, raycaster);
  if (hit) {
    const lla = {};
    _groundPoint.copy(hit.point).applyMatrix4(tiles.group.matrixWorldInverse);
    WGS84_ELLIPSOID.getPositionToCartographic(_groundPoint, lla);
    return lla.height;
  }
  return null;
}

// czy punkt w świecie (np. końcówka skrzydła) jest w/bardzo blisko terenu
const _rayOrigin = new Vector3();
const _rayDown = new Vector3();
function hitTerrainAt(worldPos, margin) {
  _rayDown.copy(worldPos).normalize().negate(); // radialnie w dół
  _rayOrigin.copy(worldPos).addScaledVector(_rayDown, -600);
  raycaster.set(_rayOrigin, _rayDown);
  raycaster.far = 1200;
  const hit = raycastTerrain(tiles, raycaster);
  if (!hit) return false;
  // AGL punktu = dystans promienia - 600; kraksa gdy punkt jest <= margin nad terenem
  return hit.distance - 600 < margin;
}

const _rightWing = new Vector3();
const _wingTip = new Vector3();
function wingHit() {
  const half = PLANES[selectedPlane].wingspan * 0.45;
  _rightWing.set(1, 0, 0).applyQuaternion(planeQuat);
  for (const s of [-1, 1]) {
    _wingTip.copy(planePos).addScaledVector(_rightWing, s * half);
    if (hitTerrainAt(_wingTip, 1.5)) return true;
  }
  return false;
}

function crash() {
  crashed = true;
  explosions.push(createExplosion(scene, planePos.clone()));
  playExplosionSound();
  shake = 1;
  if (planeMesh) planeMesh.visible = false;
  if (mp.active && mode === "guess") return; // runda trwa — po minucie i tak zgadujecie
  timerActive = false;
  setTimeout(() => showBanner("YOU CRASHED"), 900);
}

function placeBeaconAt(latDeg, lonDeg) {
  const gh = probeGround(latDeg * (Math.PI / 180), lonDeg * (Math.PI / 180), TERRAIN_ALT + 200);
  const base = gh !== null ? gh : TERRAIN_ALT;
  beaconGrounded = gh !== null;
  const m = frameAt(latDeg * (Math.PI / 180), lonDeg * (Math.PI / 180), base, 0, 0, 0, _beaconFrame);
  m.decompose(beacon.position, beacon.quaternion, beacon.scale);
}

// --- start gry ---
async function startGame() {
  if (!ION_KEY) { return menuFail('Terrain is temporarily unavailable. Please try again later.'); }
  if (!gameReady || !tiles || !plane) {
    return menuFail("Still loading – tap Start again in a moment");
  }
  el.start.disabled = true;
  el.menuError.textContent = "";
  try {
    if (mode === "free") {
      const city = el.city.value.trim() || "Niepruszewo";
      el.menuError.textContent = `Looking up: ${city}…`;
      const loc = await geocodeCity(city);
      if (!loc) return menuFail(`Could not find “${city}”`);
      beginFlight(loc.lat, loc.lon);
    } else if (mode === "home") {
      const addr = el.city.value.trim();
      if (!addr) return menuFail("Enter your address");
      el.menuError.textContent = "Looking up address…";
      const loc = await geocodeCity(addr);
      if (!loc) return menuFail("Could not find that address");
      homeTarget = loc;
      const start = offsetPoint(loc.lat, loc.lon, 20 + Math.random() * 10);
      timeLeft = HOME_TIME;
      timerActive = false; // włączy się po dosadzeniu (finishSnapStart)
      beginFlight(start.lat, start.lon);
      placeBeaconAt(loc.lat, loc.lon);
    } else {
      const p = pickGuessStart(guessScope);
      timeLeft = GUESS_TIME;
      timerActive = false; // włączy się po dosadzeniu (finishSnapStart)
      beginFlight(p.lat, p.lon);
    }
  } catch (err) {
    console.error(err);
    menuFail(err.message || "Could not start. Try again.");
  }
}

function menuFail(msg) {
  el.menuError.textContent = msg;
  el.start.disabled = false;
  rememberError(msg);
}

function sleepPreviews() {
  carousel.setActive(false);
  lobbyCarousel.setActive(false);
}

function beginFlight(lat, lon) {
  loadError = null;
  tiles.resetFailedTiles();
  markStarting();
  sleepPreviews();
  el.menuError.textContent = "Loading terrain…";
  if (selectedPlane !== planeMesh?.userData?.key) loadPlane(selectedPlane);
  resetFlight(lat, lon);
  el.timerBox.classList.toggle("show", mode !== "free");
  el.distBox.classList.remove("show");
  // menu zostaje we wszystkich trybach — gracz nie widzi wysokiego spawnu,
  // a samolot nie jest szarpany dosadzeniem w trakcie sterowania
  awaitingSnap = true;
  awaitingSnapSince = performance.now();
}

// wywoływane gdy teren zmierzony — właściwy start gry
function finishSnapStart() {
  menuOpen = false;
  guessOpen = false;
  guessAnswered = false;
  el.menu.classList.add("hidden");
  el.landing.classList.add("hidden");
  el.lobby.classList.add("hidden");
  el.guessmap.classList.remove("show");
  el.menuError.textContent = "";
  carousel.setActive(false);
  hideMpWait();
  timerActive = mode !== "free";
  clearError();
  setTimeout(clearStarting, 2500);
}

function unlockAudio() {
  try {
    primeAudio();
    primeMusic();
  } catch {
    /* iOS can reject AudioContext; flight still works */
  }
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

const musicButtons = [el.musicMenuToggle, el.musicLobbyToggle, el.musicGameToggle].filter(Boolean);
function syncMusicButtons() {
  const muted = isMusicMuted();
  for (const button of musicButtons) {
    button.textContent = muted ? "🔇 Music off" : "🔊 Music on";
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? "Turn music on" : "Turn music off");
  }
}
function handleMusicToggle() {
  toggleMusic();
  syncMusicButtons();
}
for (const button of musicButtons) button.addEventListener("click", handleMusicToggle);
syncMusicButtons();

el.start.addEventListener("click", () => {
  unlockAudio();
  startGame();
});
el.city.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

el.btnSolo.addEventListener("click", () => {
  unlockAudio();
  showSoloMenu();
});
el.btnMulti.addEventListener("click", () => {
  unlockAudio();
  openHostLobby();
});
el.menuBack.addEventListener("click", () => showLanding());
el.lobbyBack.addEventListener("click", () => showLanding());
el.lobbyCopy.addEventListener("click", async () => {
  const link = el.lobbyLink.value;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    el.lobbyCopy.textContent = "Copied";
    setTimeout(() => { el.lobbyCopy.textContent = "Copy link"; }, 1600);
  } catch {
    el.lobbyLink.select();
  }
});
el.lobbyStart.addEventListener("click", () => {
  if (!gameReady) { setLobbyStatus('Terrain is not ready. Please try again in a moment.', true); return; }
  unlockAudio();
  if (mp.waiting || (mp.roundActive && !mp.inRound)) {
    setLobbyStatus("Round in progress – you will join the next one");
    return;
  }
  if (playablePlayers().length < 2) {
    setLobbyStatus("Wait until someone joins from the link first", true);
    return;
  }
  mp.myReady = !mp.myReady;
  mp.net?.send({ t: "ready", ready: mp.myReady, from: mp.myId });
  renderLobby();
  tryStartMp();
});

const joinId = parseRoomFromUrl();
if (joinId) {
  if (wasHosting(joinId)) openHostLobby(joinId);
  else openGuestLobby(joinId);
}

// --- pauza (ESC) ---
function setPaused(v) {
  paused = v;
  keys.clear();
  resetStick(); touch.boost = false; touch.brake = false;
  el.pause.classList.toggle("show", v);
}

el.resume.addEventListener("click", () => setPaused(false));
el.restart.addEventListener("click", () => {
  setPaused(false);
  if (mp.active) backToLobby();
  else backToMenu();
});

function backToMenu() {
  releaseLandscapeView();
  leaveSpaceFlight();
  hideBanner();
  menuOpen = true;
  timerActive = false;
  guessOpen = false;
  awaitingSnap = false;
  beacon.visible = false;
  el.guessmap.classList.remove("show");
  el.start.disabled = false;
  el.menuError.textContent = "";
  el.landing.classList.add("hidden");
  el.lobby.classList.add("hidden");
  el.menu.classList.remove("hidden");
  carousel.setActive(true);
}

// --- mapa zgadywania ---
function drawGuessMap(marks = []) {
  if (!geoCache) return;
  GUESS_SCOPES[guessScope].draw(el.gmCanvas, geoCache, marks);
}

function openGuessMap() {
  guessOpen = true;
  guessAnswered = false;
  keys.clear();
  el.gmResult.textContent = "";
  updateGuessScores();
  el.gmClose.style.display = "none";
  el.gmRetry.style.display = "none";
  el.gmClose.textContent = mp.active ? "Back to room" : "Back to menu";
  el.gmRetry.textContent = mp.active ? "Another round" : "Try again";
  el.gmSub.textContent = mp.active
    ? "Click where you were dropped – closest guess wins"
    : GUESS_SCOPES[guessScope].sub;
  el.guessmap.classList.add("show");
  const draw = () => requestAnimationFrame(() => drawGuessMap());
  if (geoCache) {
    draw();
    return;
  }
  el.gmSub.textContent = "Loading map…";
  GUESS_SCOPES[guessScope].load()
    .then((g) => {
      geoCache = g;
      el.gmSub.textContent = mp.active
        ? "Click where you were dropped – closest guess wins"
        : GUESS_SCOPES[guessScope].sub;
      draw();
    })
    .catch(() => {
      el.gmResult.textContent = "Could not load the map";
    });
}

function maybeRevealGuesses() {
  const need = inRoundPlayers().length;
  if (!need || mp.guesses.size < need) {
    if (guessOpen) {
      el.gmResult.textContent = `Waiting for guesses… ${mp.guesses.size}/${need}`;
    }
    return;
  }
  revealMpGuesses();
}

function revealMpGuesses() {
  if (!mp.truth || guessAnswered) return;
  if (mp.guesses.size < inRoundPlayers().length) return;
  guessAnswered = true;
  const marks = [
    { lat: mp.truth.lat, lon: mp.truth.lon, color: "#d8a24a", label: "You were here", truth: true },
  ];
  const results = [];
  for (const [id, g] of mp.guesses) {
    const err = distanceM(g.lat, g.lon, mp.truth.lat, mp.truth.lon) / 1000;
    results.push({ id, err, name: playerName(id) });
    marks.push({ lat: g.lat, lon: g.lon, color: playerColor(id), label: playerName(id) });
  }
  drawGuessMap(marks);
  results.sort((a, b) => a.err - b.err);
  const best = results[0]?.err ?? 0;
  const winners = results.filter((r) => r.err - best < 0.5);
  if (winners.length === 1) {
    const w = winners[0];
    if (w.id === mp.myId) mp.myScore += 1;
    else if (mp.players.has(w.id)) mp.players.get(w.id).score += 1;
  }
  const line = results.map((r) => `${r.name} ${Math.round(r.err)} km`).join(" · ");
  el.gmResult.textContent =
    winners.length > 1
      ? `Tie – ${line}`
      : winners[0]?.id === mp.myId
        ? `You win – ${line}`
        : `${winners[0]?.name} wins – ${line}`;
  updateGuessScores();
  el.gmClose.style.display = "";
  el.gmRetry.style.display = "";
  if (mp.host) broadcastRoster();
}

function updateGuessScores() {
  if (!el.gmScoreLeft || !el.gmScoreRight) return;
  if (!mp.active) {
    el.gmScoreLeft.textContent = "";
    el.gmScoreRight.textContent = "";
    return;
  }
  el.gmScoreLeft.textContent = `You ${mp.myScore}`;
  el.gmScoreRight.textContent = otherPlayers()
    .map((p) => `${p.name} ${p.score ?? 0}`)
    .join("  ");
}

el.gmCanvas.addEventListener("click", (e) => {
  if (guessAnswered) return;
  const rect = el.gmCanvas.getBoundingClientRect();
  const { lon, lat } = GUESS_SCOPES[guessScope].unproject(
    e.clientX - rect.left,
    e.clientY - rect.top,
    rect.width,
    rect.height
  );
  if (mp.active) {
    if (mp.guesses.has(mp.myId)) return;
    mp.guesses.set(mp.myId, { lat, lon });
    mp.net?.send({ t: "guess", lat, lon, from: mp.myId });
    const marks = [...mp.guesses].map(([id, g]) => ({
      lat: g.lat,
      lon: g.lon,
      color: playerColor(id),
      label: playerName(id),
    }));
    drawGuessMap(marks);
    maybeRevealGuesses();
    return;
  }
  const errKm = distanceM(lat, lon, plane.latDeg, plane.lonDeg) / 1000;
  guessAnswered = true;
  drawGuessMap([
    { lat: plane.latDeg, lon: plane.lonDeg, color: "#d8a24a", label: "You were here", truth: true },
    { lat, lon, color: "#f3ead6", label: "Your guess" },
  ]);
  el.gmResult.textContent = `Off by ${Math.round(errKm)} km`;
  el.gmClose.style.display = "";
  el.gmRetry.style.display = "";
});

el.gmClose.addEventListener("click", () => {
  el.guessmap.classList.remove("show");
  if (mp.active) backToLobby();
  else backToMenu();
});

el.bannerRetry.addEventListener("click", () => {
  if (mp.active) {
    hideBanner();
    backToLobby();
  } else restartMode();
});
el.bannerMenu.addEventListener("click", () => {
  hideBanner();
  if (mp.active) backToLobby();
  else backToMenu();
});

el.gmRetry.addEventListener("click", () => {
  if (mp.active) {
    requestRematch();
    return;
  }
  el.gmResult.textContent = "Picking a new point…";
  el.gmRetry.style.display = "none";
  el.gmClose.style.display = "none";
  restartMode();
});

function resetCameraView() {
  orbit.yaw = 0;
  orbit.pitch = 0.25;
  orbit.zoom = 1;
  camInit = false;
}

window.addEventListener("keydown", (e) => {
  if (streetModeActive && (e.key === "Escape" || e.key === " ")) {
    e.preventDefault();
    leaveStreetView();
    return;
  }
  if (e.key === "Escape") {
    if (el.streetPrompt?.open) return;
    if (!menuOpen && !guessOpen) setPaused(!paused);
    return;
  }
  if (e.target?.closest("input, textarea, select, [contenteditable], dialog")) return;
  const k = e.key.toLowerCase();
  if (k === "t" && mp.active) {
    if (!e.repeat) startTalk();
    return;
  }
  if (menuOpen || paused || guessOpen) return;
  if (["arrowup","arrowdown","arrowleft","arrowright"," ","control"].includes(k)) e.preventDefault();
  if (spaceModeActive && /^[1-9]$/.test(k)) {
    selectSpaceTarget(["Mercury", "Venus", "Earth", "Moon", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"][Number(k) - 1]);
    return;
  }
  if (spaceModeActive && k === "0") {
    selectSpaceTarget("Galactic Core");
    return;
  }
  if (spaceModeActive && k === "-") {
    selectSpaceTarget("Sun");
    return;
  }
  if (spaceModeActive && k === "e" && !e.repeat) {
    handleSpaceEntryAction();
    return;
  }
  if (k === "c" && !e.repeat) resetCameraView();
  if (k === " " && !e.repeat) tryParachutistLaunch("gentle");
  if (k === "r" && !e.repeat && !crashed && !finished) {
    if (selectedPlane === "rocket") handleRocketAction();
    else tryParachutistLaunch("rocket");
  }
  keys.add(k);
  if (k === "r" && (crashed || finished)) restartMode();
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "t") stopTalk();
  keys.delete(k);
});
window.addEventListener('blur', clearFlightInput);
window.addEventListener('focus', () => {
  if (streetModeActive && externalStreetWindow?.closed) leaveStreetView();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearFlightInput();
  else if (streetModeActive && externalStreetWindow?.closed) leaveStreetView();
});
function clearFlightInput() {
  keys.clear(); ctrl.roll = 0; ctrl.pitch = 0; ctrl.throttle = 0; ctrl.cameraClimb = 0;
  resetStick(); touch.boost = false; touch.brake = false; stopTalk();
  if (!menuOpen && !guessOpen && !streetModeActive) setPaused(true);
}

const touch = { roll: 0, pitch: 0, boost: false, brake: false, pid: null };
const ROTATE_HINT_KEY = "fotw-rotate-hint-dismissed";
let rotateHintDismissed = false;
let landscapeRequested = false;
let orientationFullscreenOwned = false;
try { rotateHintDismissed = sessionStorage.getItem(ROTATE_HINT_KEY) === "1"; } catch { /* optional */ }

function syncLandscapeButtons() {
  if (el.landscapeToggle) {
    el.landscapeToggle.textContent = landscapeRequested ? "↶ Portrait" : "↻ Landscape";
    el.landscapeToggle.setAttribute("aria-pressed", String(landscapeRequested));
    el.landscapeToggle.setAttribute("aria-label", landscapeRequested ? "Return to portrait view" : "Switch to landscape view");
  }
}

function syncVirtualLandscape() {
  const useFallback = landscapeRequested && innerHeight > innerWidth;
  document.documentElement.classList.toggle("virtual-landscape", useFallback);
  syncLandscapeButtons();
}

async function requestLandscapeView() {
  if (!isMobile || landscapeRequested) return;
  if (el.rotateLandscape) {
    el.rotateLandscape.disabled = true;
    el.rotateLandscape.textContent = "Rotating…";
  }
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      orientationFullscreenOwned = true;
    }
  } catch { /* fullscreen is optional; CSS fallback still works */ }
  try {
    if (screen.orientation?.lock) await screen.orientation.lock("landscape");
  } catch { /* iOS and some browsers do not expose orientation locking */ }
  landscapeRequested = true;
  rotateHintDismissed = true;
  try { sessionStorage.setItem(ROTATE_HINT_KEY, "1"); } catch { /* optional */ }
  syncVirtualLandscape();
  onResize();
  el.rotateHint?.classList.remove("show");
  if (el.rotateLandscape) {
    el.rotateLandscape.disabled = false;
    el.rotateLandscape.textContent = "Play horizontally";
  }
}

async function releaseLandscapeView() {
  if (!landscapeRequested && !document.documentElement.classList.contains("virtual-landscape")) return;
  landscapeRequested = false;
  try { screen.orientation?.unlock?.(); } catch { /* optional */ }
  document.documentElement.classList.remove("virtual-landscape");
  syncLandscapeButtons();
  onResize();
  if (orientationFullscreenOwned && document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen(); } catch { /* optional */ }
  }
  orientationFullscreenOwned = false;
}

function resetStick() {
  touch.roll = 0;
  touch.pitch = 0;
  touch.pid = null;
  if (el.stickKnob) el.stickKnob.style.transform = "";
}

function moveStick(clientX, clientY) {
  if (!el.stick) return;
  const r = el.stick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = r.width * 0.42;
  const mag = Math.hypot(dx, dy);
  if (mag > max) {
    dx = (dx / mag) * max;
    dy = (dy / mag) * max;
  }
  const nx = dx / max;
  const ny = dy / max;
  const dead = 0.12;
  touch.roll = Math.abs(nx) < dead ? 0 : nx;
  touch.pitch = Math.abs(ny) < dead ? 0 : ny;
  if (el.stickKnob) el.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function bindHold(btn, down, up) {
  if (!btn) return;
  const start = (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add("held");
    down();
  };
  const end = (e) => {
    e.preventDefault();
    btn.classList.remove("held");
    up();
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
}

if (el.stick) {
  el.stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    touch.pid = e.pointerId;
    el.stick.setPointerCapture(e.pointerId);
    moveStick(e.clientX, e.clientY);
  });
  el.stick.addEventListener("pointermove", (e) => {
    if (touch.pid !== e.pointerId) return;
    moveStick(e.clientX, e.clientY);
  });
  const endStick = (e) => {
    if (touch.pid != null && e.pointerId !== touch.pid) return;
    resetStick();
  };
  el.stick.addEventListener("pointerup", endStick);
  el.stick.addEventListener("pointercancel", endStick);
}
bindHold(el.touchBoost, () => { touch.boost = true; }, () => { touch.boost = false; });
bindHold(el.touchBrake, () => { touch.brake = true; }, () => { touch.brake = false; });
bindHold(el.touchTalk, () => startTalk(), () => stopTalk());
el.touchAction?.addEventListener("click", () => {
  if (selectedPlane === "rocket") handleRocketAction();
  else tryParachutistLaunch("gentle");
});
el.touchSpecial?.addEventListener("click", () => tryParachutistLaunch("rocket"));
el.touchEnter?.addEventListener("click", handleSpaceEntryAction);
el.touchCamera?.addEventListener("click", resetCameraView);
el.touchPause?.addEventListener("click", () => setPaused(true));
el.rotateLandscape?.addEventListener("click", requestLandscapeView);
el.landscapeToggle?.addEventListener("click", () => {
  if (landscapeRequested) releaseLandscapeView();
  else requestLandscapeView();
});
el.rotateDismiss?.addEventListener("click", () => {
  rotateHintDismissed = true;
  el.rotateHint?.classList.remove("show");
  try { sessionStorage.setItem(ROTATE_HINT_KEY, "1"); } catch { /* optional */ }
});
el.stick?.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

function syncTouchUi() {
  if (!el.touch) return;
  const show = !menuOpen && !paused && !guessOpen && !crashed && !finished && !streetModeActive;
  if (el.gameTools) el.gameTools.hidden = menuOpen || guessOpen || crashed || finished || streetModeActive;
  const nearestSpaceBody = spaceModeActive ? spaceFlight.nearestBody() : null;
  const orbitBody = spaceFlight.orbitBody ? spaceFlight.bodies.get(spaceFlight.orbitBody) : null;
  const canEnterOrbit = !!nearestSpaceBody
    && !nearestSpaceBody.body.hazard
    && nearestSpaceBody.distance <= SPACE_ORBIT_HINT_DISTANCE
    && !spaceFlight.orbitBody
    && !spaceFlight.surfaceBody
    && !spaceLandedBody
    && !spaceEntryBody
    && !blackHoleSequence;
  el.touch.classList.toggle("hidden", !show);
  el.touch.classList.toggle("show", show);
  el.touch.classList.toggle("talk", !!(mp.active && mp.net));
  const portraitPhone = isMobile && innerHeight > innerWidth && !landscapeRequested;
  el.rotateHint?.classList.toggle("show", show && portraitPhone && !rotateHintDismissed);
  if (el.touchAction) {
    const isParachutist = selectedPlane === "parachutist";
    const isRocket = selectedPlane === "rocket";
    const canLaunch = isParachutist && plane?.state === "grounded";
    const takingOff = isParachutist && plane?.state === "launching";
    const hideSpaceAction = spaceModeActive && (!!spaceEntryBody || blackHoleSequence);
    el.touchAction.hidden = isParachutist ? !canLaunch && !takingOff : !isRocket || hideSpaceAction;
    el.touchAction.disabled = isParachutist
      ? !canLaunch
      : !isRocket || !!rocketLaunch || !!earthReentry || (spaceModeActive && !spaceFlight.orbitBody && !spaceFlight.surfaceBody && !spaceLandedBody && !canEnterOrbit);
    el.touchAction.textContent = isRocket
      ? spaceModeActive
        ? spaceFlight.surfaceBody || spaceLandedBody
          ? "Return to orbit"
          : spaceFlight.orbitBody
            ? `Release ${spaceFlight.orbitBody} orbit`
            : canEnterOrbit
              ? `Enter ${nearestSpaceBody.body.name} orbit`
              : "Approach a planet"
        : earthReentry ? "Reentering…" : rocketLaunch ? "Launching…" : "Launch to orbit"
      : canLaunch ? "Gentle takeoff" : plane?.state === "launching" ? "Taking off…" : "Land to take off";
  }
  if (el.touchSpecial) {
    const canHighLaunch = selectedPlane === "parachutist" && plane?.state === "grounded";
    el.touchSpecial.hidden = !canHighLaunch;
    el.touchSpecial.disabled = !canHighLaunch;
  }
  if (el.touchEnter) {
    const canEnterPlanet = spaceModeActive && !!orbitBody && !orbitBody.hazard && !blackHoleSequence && !spaceEntryBody;
    el.touchEnter.hidden = !canEnterPlanet;
    el.touchEnter.disabled = !canEnterPlanet;
    el.touchEnter.textContent = orbitBody
      ? orbitBody.name === "Earth"
        ? "Enter Earth atmosphere"
        : `Enter ${orbitBody.name}${orbitBody.gasGiant ? " atmosphere" : ""}`
      : "Enter planet";
  }
  if (el.touchTalk) el.touchTalk.hidden = !(mp.active && mp.net);
  if (!show) {
    resetStick();
    touch.boost = false;
    touch.brake = false;
    el.rotateHint?.classList.remove("show");
  }
}

function tryParachutistLaunch(mode = "gentle") {
  if (selectedPlane !== "parachutist" || !plane || menuOpen || paused || guessOpen) return;
  if (plane.takeOff?.(groundAlt, mode)) {
    setParachutistState(planeMesh, plane.state, plane.speed);
    camInit = false;
  }
}

const spaceDestinations = SPACE_BODIES;
const spaceMatrix = new Matrix4();
const spaceUp = new Vector3();
const spaceRight = new Vector3();
const spaceLook = new Vector3();
const spaceCameraGoal = new Vector3();
const spaceViewOffset = new Vector3();
const spacePositionBefore = new Vector3();
const spaceCameraTravel = new Vector3();
const spaceCtrl = { roll: 0, pitch: 0, throttle: 0 };

function setSpaceNotice(message, duration = 2600) {
  spaceNotice = message;
  spaceNoticeUntil = performance.now() + duration;
}

const SPACE_ORBIT_HINT_DISTANCE = 260;
const SPACE_ACTION_HINT_DURATION = 4000;

function resetSpaceActionHint() {
  spaceActionHintContext = "";
  spaceActionHintUntil = 0;
  if (el.spaceActionHint) el.spaceActionHint.hidden = true;
  el.touchAction?.classList.remove("space-context-ready");
  el.touchEnter?.classList.remove("space-context-ready");
}

function updateSpaceActionHint(nearest, now = performance.now()) {
  let next = null;
  const unavailable = !spaceModeActive || blackHoleSequence || spaceEntryBody || spaceLandedBody || spaceFlight.surfaceBody;
  if (!unavailable && spaceFlight.orbitBody) {
    const body = spaceFlight.bodies.get(spaceFlight.orbitBody);
    if (body && !body.hazard) {
      next = {
        context: `orbit:${body.name}`,
        key: "E",
        copy: body.name === "Earth"
          ? "Return through Earth's atmosphere"
          : `Enter ${body.name}${body.gasGiant ? "'s atmosphere" : ""}`,
      };
    }
  } else if (!unavailable && nearest?.body && !nearest.body.hazard && nearest.distance <= SPACE_ORBIT_HINT_DISTANCE) {
    next = {
      context: `near:${nearest.body.name}`,
      key: "R",
      copy: `Enter ${nearest.body.name} orbit`,
    };
  }

  const nextContext = next?.context || "";
  if (nextContext !== spaceActionHintContext) {
    spaceActionHintContext = nextContext;
    spaceActionHintUntil = next ? now + SPACE_ACTION_HINT_DURATION : 0;
  }

  const visible = !!next && now < spaceActionHintUntil;
  if (el.spaceActionHint) el.spaceActionHint.hidden = !visible;
  if (visible) {
    if (el.spaceActionKey) el.spaceActionKey.textContent = next.key;
    if (el.spaceActionCopy) el.spaceActionCopy.textContent = next.copy;
  }
  el.touchAction?.classList.toggle("space-context-ready", visible && next?.key === "R");
  el.touchEnter?.classList.toggle("space-context-ready", visible && next?.key === "E");
  return visible ? next : null;
}

function selectSpaceTarget(indexOrName) {
  const body = typeof indexOrName === "number"
    ? spaceDestinations[indexOrName]
    : spaceDestinations.find((entry) => entry.name === indexOrName);
  if (!body || !spaceFlight.setTarget(body.name, true)) return;
  spaceEntryBody = null;
  spaceLandedBody = null;
  spaceEntryTransition = null;
  hidePlanetEntryVisual();
  document.querySelectorAll("#space-targets button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.body === body.name);
  });
  setSpaceNotice(`Course set for ${body.name}. Hold Shift for hyperdrive.`);
}

document.querySelectorAll("#space-targets button").forEach((button) => {
  button.addEventListener("click", () => selectSpaceTarget(button.dataset.body));
});
el.spaceEnter?.addEventListener("click", handleSpaceEntryAction);

function startRocketLaunch() {
  if (selectedPlane !== "rocket" || !plane || menuOpen || paused || guessOpen || spaceModeActive || rocketLaunch || earthReentry) return;
  if (mp.active || mode !== "free") {
    setSpaceNotice("Orbital flight is available in single-player Free flight.", 4200);
    return;
  }
  rocketLaunch = { velocity: Math.max(225, plane.speed * 1.5), startedAt: performance.now() };
  cooperFarmRocketReady = false;
  hideCooperFarmArrival();
  pendingSnap = false;
  awaitingSnap = false;
  plane.roll = 0;
  plane.pitch = Math.PI / 2;
  camInit = false;
  setSpaceNotice("Main engines started — vertical ascent to 100 km.", 3500);
}

function handleRocketAction() {
  if (spaceModeActive) {
    if (blackHoleSequence) return;
    if (spaceFlight.surfaceBody) {
      const body = spaceFlight.surfaceBody;
      spaceEntryBody = null;
      spaceLandedBody = null;
      spaceEntryTransition = null;
      hidePlanetEntryVisual();
      spaceFlight.enterOrbit(body, 20);
      setSpaceNotice(`Surface ascent complete — ${body} orbit established.`);
      return;
    }
    if (spaceLandedBody) {
      const body = spaceLandedBody;
      spaceLandedBody = null;
      spaceFlight.enterOrbit(body, 20);
      setSpaceNotice(`Launch complete — ${body} orbit established.`);
      return;
    }
    const wasOrbiting = !!spaceFlight.orbitBody;
    const entered = spaceFlight.toggleNearestOrbit();
    const nearest = spaceFlight.nearestBody();
    setSpaceNotice(entered
      ? `Orbit assist locked to ${spaceFlight.orbitBody}. Press R again to release.`
      : wasOrbiting
        ? "Orbit assist released."
        : `Move closer to ${nearest?.body?.name || "a planet"} to enter orbit.`);
    return;
  }
  startRocketLaunch();
}

function handleSpaceEntryAction() {
  if (!spaceModeActive || blackHoleSequence) return;
  if (spaceFlight.surfaceBody) {
    handleRocketAction();
    return;
  }
  if (spaceLandedBody) {
    handleRocketAction();
    return;
  }
  const bodyName = spaceFlight.orbitBody;
  const body = bodyName ? spaceFlight.bodies.get(bodyName) : null;
  if (!body || body.hazard) {
    setSpaceNotice("Establish orbit around a planet before beginning descent.", 3600);
    return;
  }
  if (bodyName === "Earth") {
    beginEarthReentry();
    return;
  }
  spaceFlight.orbitBody = null;
  spaceFlight.autopilot = false;
  spaceFlight.hyperdrive = false;
  spaceEntryBody = bodyName;
  spaceEntryTransition = { bodyName, startedAt: performance.now() };
  spaceFlight.targetName = bodyName;
  spaceFlight.forward.copy(body.position).sub(spaceFlight.position).normalize();
  spaceFlight.speed = Math.min(52, Math.max(spaceFlight.precisionSpeed, spaceFlight.speed));
  showPlanetEntryVisual(body, "ATMOSPHERIC ENTRY", body.gasGiant
    ? "Cloud deck ahead · structural pressure rising"
    : "Thermal shield active · surface guidance locked");
  setSpaceNotice(body.gasGiant
    ? `Descending into ${bodyName}. There is no solid surface — pressure becomes fatal below the cloud deck.`
    : `${bodyName} descent started. The guidance system will transition into low-altitude surface flight.`, 5200);
}

function beginEarthReentry() {
  if (!spaceModeActive || spaceFlight.orbitBody !== "Earth") return;
  leaveSpaceFlight();
  earthReentry = { verticalSpeed: -5200, startedAt: performance.now() };
  plane.height = 100000;
  plane.pitch = -Math.PI / 2;
  plane.roll = 0;
  plane.speed = Math.abs(earthReentry.verticalSpeed);
  plane.throttle = 0;
  pendingSnap = false;
  awaitingSnap = false;
  camInit = false;
  setSpaceNotice("EARTH REENTRY · descending from 100 km · flight control returns below 6 km", 6000);
}

function updateEarthReentry(dt) {
  if (!earthReentry || !plane) return;
  const altitude01 = Math.max(0, Math.min(1, (plane.height - groundAlt) / 100000));
  const targetVertical = -750 - altitude01 * 4750;
  earthReentry.verticalSpeed += (targetVertical - earthReentry.verticalSpeed) * (1 - Math.exp(-1.25 * dt));
  plane.height += earthReentry.verticalSpeed * dt;
  plane.speed = Math.abs(earthReentry.verticalSpeed);
  plane.pitch += (-Math.PI / 2 - plane.pitch) * (1 - Math.exp(-4 * dt));
  plane.roll *= Math.exp(-5 * dt);
  if (plane.height <= groundAlt + 6000) {
    earthReentry = null;
    plane.height = groundAlt + 6000;
    plane.pitch = -0.12;
    plane.speed = PLANES.rocket.cruise;
    plane.throttle = plane.cruiseT;
    camInit = false;
    setSpaceNotice("Atmospheric reentry complete — manual flight restored.", 5000);
  }
}

function triggerSpaceImpact(title, message) {
  if (crashed) return;
  crashed = true;
  spaceFlight.speed = 0;
  spaceFlight.hyperdrive = false;
  if (planeMesh) planeMesh.visible = false;
  document.body.classList.remove("hyperdrive");
  showBanner(title, message);
}

function hidePlanetEntryVisual() {
  if (spaceEntryVisualTimer) clearTimeout(spaceEntryVisualTimer);
  spaceEntryVisualTimer = null;
  el.planetEntry?.classList.remove("show");
  el.planetEntry?.setAttribute("aria-hidden", "true");
}

function showPlanetEntryVisual(body, title, detail) {
  if (!el.planetEntry || !body) return;
  if (spaceEntryVisualTimer) clearTimeout(spaceEntryVisualTimer);
  el.planetEntry.style.setProperty("--entry-color", body.atmosphere || body.color || "#7bdcff");
  if (el.planetEntryTitle) el.planetEntryTitle.textContent = `${body.name.toUpperCase()} · ${title}`;
  if (el.planetEntryDetail) el.planetEntryDetail.textContent = detail;
  el.planetEntry.classList.remove("show");
  void el.planetEntry.offsetWidth;
  el.planetEntry.classList.add("show");
  el.planetEntry.setAttribute("aria-hidden", "false");
  spaceEntryVisualTimer = setTimeout(hidePlanetEntryVisual, PLANET_ENTRY_FX_MS);
}

function hideCooperFarmArrival() {
  cooperFarmRocketReady = false;
  el.locationArrival?.classList.remove("show");
  el.locationArrival?.setAttribute("aria-hidden", "true");
}

function showCooperFarmArrival() {
  if (!el.locationArrival) return;
  cooperFarmRocketReady = true;
  el.locationArrival.classList.add("show");
  el.locationArrival.setAttribute("aria-hidden", "false");
}

function stopTesseractVideo() {
  const video = el.tesseractVideo;
  if (!video) return;
  video.pause();
  try { video.currentTime = 0; } catch { /* metadata may not be ready yet */ }
}

function prepareTesseractVideo() {
  const video = el.tesseractVideo;
  if (!video) return;
  tesseractVideoError = "";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.pause();
  if (video.readyState === 0) video.load();
  try { video.currentTime = 0; } catch { /* poster covers the metadata wait */ }
}

function playTesseractVideo() {
  const video = el.tesseractVideo;
  if (!video) return;
  try { video.currentTime = 0; } catch { /* play() will start at the beginning */ }
  const playback = video.play();
  playback?.catch((error) => {
    tesseractVideoError = error?.message || "Tesseract video playback failed";
  });
}

function finishInterstellarJump() {
  if (!spaceModeActive || !blackHoleSequence) return;
  stopTesseractVideo();
  if (blackHoleTimer) clearTimeout(blackHoleTimer);
  if (blackHolePhaseTimer) clearTimeout(blackHolePhaseTimer);
  if (blackHoleEntryTimer) clearTimeout(blackHoleEntryTimer);
  if (blackHoleCountdownDelayTimer) clearTimeout(blackHoleCountdownDelayTimer);
  if (blackHoleCountdownTimer) clearInterval(blackHoleCountdownTimer);
  blackHoleTimer = null;
  blackHolePhaseTimer = null;
  blackHoleEntryTimer = null;
  blackHoleCountdownDelayTimer = null;
  blackHoleCountdownTimer = null;
  blackHoleSequenceStartedAt = 0;
  blackHoleTesseractStartedAt = 0;
  blackHoleSequence = false;
  blackHolePhase = "arrival";
  stopBlackHoleScore();
  selectMode("free");
  const rocketIndex = PLANE_ORDER.indexOf("rocket");
  selectPlane(rocketIndex, 0, true);
  if (planeMesh?.userData?.key !== "rocket") loadPlane("rocket");
  tiles?.resetFailedTiles?.();
  resetFlight(COOPER_FARM.lat, COOPER_FARM.lon);
  groundAlt = COOPER_FARM.fallbackAltitude;
  plane.height = groundAlt + 4.8;
  interstellarArrivalPending = true;
  interstellarArrivalStartedAt = performance.now();
  pendingSnap = true;
  awaitingSnap = false;
  menuOpen = false;
  paused = false;
  guessOpen = false;
  crashed = false;
  finished = false;
  el.menu.classList.add("hidden");
  el.landing.classList.add("hidden");
  el.lobby.classList.add("hidden");
  if (plane) {
    plane.speed = 0;
    plane.throttle = 0;
    plane.pitch = Math.PI / 2;
    plane.roll = 0;
  }
  showCooperFarmArrival();
  camInit = false;
}

function triggerInterstellarJump() {
  if (blackHoleSequence) return;
  blackHoleSequence = true;
  blackHolePhase = "void";
  blackHoleSequenceStartedAt = performance.now();
  spaceFlight.autopilot = false;
  spaceFlight.hyperdrive = false;
  spaceFlight.speed = 0;
  planeMesh.visible = false;
  document.body.classList.remove("hyperdrive");
  document.body.classList.add("black-hole-transit");
  el.interstellar?.classList.remove("tesseract-phase", "countdown-only", "approach-phase");
  el.interstellar?.classList.add("show", "silent-void");
  el.interstellar?.style.setProperty("--tesseract-approach-duration", `${BLACK_HOLE_APPROACH_MS}ms`);
  el.interstellar?.setAttribute("aria-hidden", "false");
  el.transitCountdown?.setAttribute("aria-hidden", "true");
  el.transitStatus?.setAttribute("aria-hidden", "true");
  if (el.transitStatus) el.transitStatus.textContent = "EVENT HORIZON · TELEMETRY LOST";
  const transitStartedAt = blackHoleSequenceStartedAt;
  prepareTesseractVideo();
  const updateCountdown = () => {
    if (!el.transitCountdown || !["void", "approach"].includes(blackHolePhase)) return;
    const remaining = Math.max(1, Math.ceil((BLACK_HOLE_ENTRY_MS - (performance.now() - transitStartedAt)) / 1000));
    const value = el.transitCountdown.querySelector("strong");
    if (value) value.textContent = String(remaining).padStart(2, "0");
  };
  blackHoleCountdownDelayTimer = setTimeout(() => {
    el.interstellar?.classList.remove("silent-void");
    el.interstellar?.classList.add("countdown-only");
    el.transitCountdown?.setAttribute("aria-hidden", "false");
    updateCountdown();
    blackHoleCountdownTimer = setInterval(updateCountdown, 100);
    blackHoleCountdownDelayTimer = null;
  }, BLACK_HOLE_COUNTDOWN_DELAY_MS);
  startBlackHoleFinale(BLACK_HOLE_SEQUENCE_MS / 1000);
  blackHolePhaseTimer = setTimeout(() => {
    blackHolePhase = "approach";
    el.interstellar?.classList.add("approach-phase");
    if (el.transitStatus) el.transitStatus.textContent = "UNKNOWN STRUCTURE · RAPID APPROACH";
    blackHolePhaseTimer = null;
  }, BLACK_HOLE_VOID_MS);
  blackHoleEntryTimer = setTimeout(() => {
    blackHolePhase = "tesseract";
    blackHoleTesseractStartedAt = performance.now();
    if (blackHoleCountdownTimer) clearInterval(blackHoleCountdownTimer);
    blackHoleCountdownTimer = null;
    el.interstellar?.classList.remove("countdown-only", "approach-phase");
    el.interstellar?.classList.add("tesseract-phase");
    playTesseractVideo();
    el.transitCountdown?.setAttribute("aria-hidden", "true");
    el.transitStatus?.setAttribute("aria-hidden", "false");
    if (el.transitStatus) el.transitStatus.textContent = "GRAVITATIONAL TESSERACT · TEMPORAL ECHOES";
    blackHoleEntryTimer = null;
  }, BLACK_HOLE_ENTRY_MS);
  blackHoleTimer = setTimeout(finishInterstellarJump, BLACK_HOLE_SEQUENCE_MS);
}

function checkSpaceEnvironment(dt) {
  spaceEnvironmentMessage = "";
  const sunBody = spaceFlight.bodies.get("Sun");
  const sunDistance = spaceFlight.position.distanceTo(sunBody.position) - sunBody.radius;
  document.body.classList.toggle("solar-warning", sunDistance < 1300);
  if (sunDistance <= 0) {
    triggerSpaceImpact("STAR INCINERATION", "The rocket entered the Sun and was destroyed.");
    return;
  }
  if (sunDistance < 1300) {
    spaceEnvironmentMessage = `⚠ EXTREME HEAT · Sun surface ${formatSpaceDistance(sunDistance)} · turn away immediately`;
  }

  const blackHole = spaceFlight.bodies.get("Galactic Core");
  blackHoleGravity = spaceFlight.applyGravity("Galactic Core", dt);
  let blackHoleDistance = blackHoleGravity?.surfaceDistance ?? Infinity;
  const gravityWellActive = (blackHoleGravity?.intensity || 0) > 0.025;
  const gravityWellProgress = Math.max(0, Math.min(1, ((blackHoleGravity?.intensity || 0) - 0.025) / 0.975));
  const musicProximity = gravityWellActive ? 0.12 + gravityWellProgress * 0.88 : 0;
  setBlackHoleProximity(musicProximity);
  document.body.classList.toggle("black-hole-gravity", gravityWellActive);
  document.body.classList.toggle("black-hole-accretion", !!blackHoleGravity?.trapped);
  if (blackHoleCaptureStartedAt || (blackHoleGravity?.trapped && blackHoleDistance <= BLACK_HOLE_CAPTURE_DISTANCE)) {
    const now = performance.now();
    if (!blackHoleCaptureStartedAt) blackHoleCaptureStartedAt = now;
    blackHoleCaptureProgress = Math.max(0, Math.min(1, (now - blackHoleCaptureStartedAt) / BLACK_HOLE_CAPTURE_MS));

    // Hold the rocket above the horizon and turn its fall into a tightening
    // spiral, leaving time for the score and the final camera vibration.
    spaceLook.copy(spaceFlight.position).sub(blackHole.position);
    if (spaceLook.lengthSq() < 1e-5) spaceLook.set(1, 0, 0);
    spaceLook.normalize();
    const heldClearance = 3 + (BLACK_HOLE_CAPTURE_DISTANCE - 3) * Math.pow(1 - blackHoleCaptureProgress, 1.45);
    spaceFlight.position.copy(blackHole.position).addScaledVector(spaceLook, blackHole.radius + heldClearance);
    blackHoleDistance = heldClearance;
    spaceUp.set(0, 1, 0);
    spaceRight.crossVectors(spaceLook, spaceUp);
    if (spaceRight.lengthSq() < 1e-5) spaceRight.set(0, 0, 1);
    else spaceRight.normalize();
    const tangentSign = spaceRight.dot(spaceFlight.forward) < 0 ? -1 : 1;
    spaceViewOffset.copy(spaceRight).multiplyScalar(tangentSign * (1 - blackHoleCaptureProgress * 0.64))
      .addScaledVector(spaceLook, -(0.1 + blackHoleCaptureProgress * 0.9))
      .normalize();
    spaceFlight.forward.lerp(spaceViewOffset, 1 - Math.exp(-2.8 * dt)).normalize();
    spaceFlight.speed = Math.min(spaceFlight.speed, spaceFlight.cruiseSpeed * 1.08);
    spaceFlight.hyperdrive = false;

    if (blackHoleCaptureProgress >= 1) {
      triggerInterstellarJump();
      return;
    }
  } else if (blackHoleDistance <= 0) {
    triggerInterstellarJump();
    return;
  }
  if (blackHoleGravity?.trapped) {
    const captureSeconds = blackHoleCaptureStartedAt
      ? Math.max(1, Math.ceil((BLACK_HOLE_CAPTURE_MS - (performance.now() - blackHoleCaptureStartedAt)) / 1000))
      : null;
    spaceEnvironmentMessage = captureSeconds
      ? `⚠ INEVITABLE CAPTURE · horizon lock ${Math.round(blackHoleCaptureProgress * 100)}% · structural vibration · ${captureSeconds}s`
      : `⚠ ACCRETION DISK CAPTURE · escape authority collapsing · event horizon ${formatSpaceDistance(blackHoleDistance)}`;
  } else if ((blackHoleGravity?.intensity || 0) > 0.025) {
    spaceEnvironmentMessage = `⚠ GRAVITY WELL ${Math.round(blackHoleGravity.intensity * 100)}% · event horizon ${formatSpaceDistance(blackHoleDistance)}`;
  }

  const nearest = spaceFlight.nearestBody();
  const body = nearest?.body;
  if (!body || body.hazard) return;
  if (spaceFlight.surfaceBody === body.name) {
    spaceEnvironmentMessage = `${body.name.toUpperCase()} SURFACE FLIGHT · altitude ${formatSpaceDistance(nearest.distance)} · W/S climb or descend · A/D turn · R orbit`;
    return;
  }
  const atmosphereRange = body.atmosphere ? body.radius * (body.gasGiant ? 0.58 : 0.32) : 0;
  if (nearest.distance < atmosphereRange) {
    spaceEnvironmentMessage = `${body.name.toUpperCase()} ATMOSPHERE · altitude ${formatSpaceDistance(nearest.distance)} · ${Math.round(spaceFlight.speed)} units/s`;
  } else if (spaceEntryBody === body.name) {
    spaceEnvironmentMessage = `${body.name.toUpperCase()} DESCENT · surface ${formatSpaceDistance(nearest.distance)} · Ctrl precision flight`;
  }
  const surfaceFlightThreshold = Math.max(2.4, body.radius * 0.075);
  if (spaceEntryBody === body.name && !body.gasGiant && nearest.distance <= surfaceFlightThreshold) {
    const clearance = Math.max(2.2, body.radius * 0.055);
    if (spaceFlight.enterSurfaceFlight(body.name, clearance)) {
      spaceEntryBody = null;
      spaceLandedBody = null;
      spaceEntryTransition = null;
      showPlanetEntryVisual(body, "SURFACE FLIGHT", "Terrain lock acquired · manual flight restored");
      setSpaceNotice(`LOW-ALTITUDE FLIGHT OVER ${body.name.toUpperCase()} · W/S altitude · A/D turn · R returns to orbit`, 7200);
      camInit = false;
      return;
    }
  }
  if (nearest.distance > 0) return;

  if (body.gasGiant) {
    triggerSpaceImpact("PRESSURE FAILURE", `${body.name} has no solid surface. The rocket was crushed below the cloud deck.`);
    return;
  }
  triggerSpaceImpact(`IMPACT ON ${body.name.toUpperCase()}`, "Begin a guided atmospheric entry from orbit with E before reaching the surface.");
}

function updateRocketLaunch(dt) {
  if (!rocketLaunch || !plane) return;
  rocketLaunch.velocity = Math.min(12900, rocketLaunch.velocity + 2025 * dt);
  plane.speed = rocketLaunch.velocity;
  plane.throttle = 1;
  plane.pitch += (Math.PI / 2 - plane.pitch) * (1 - Math.exp(-8 * dt));
  plane.roll *= Math.exp(-8 * dt);
  plane.height += rocketLaunch.velocity * dt;
  if (plane.height >= 100000) enterSpaceFlight();
}

function enterSpaceFlight() {
  if (spaceModeActive) return;
  if (!solarSystem) {
    solarSystem = createSolarSystem({
      textureSize: isMobile ? 512 : 2048,
      starCount: isMobile ? 3200 : 6500,
    });
    scene.add(solarSystem.group);
  }
  spaceModeActive = true;
  rocketLaunch = null;
  earthReentry = null;
  spaceEntryBody = null;
  spaceLandedBody = null;
  spaceEntryTransition = null;
  blackHoleSequence = false;
  blackHoleCaptureStartedAt = 0;
  blackHoleCaptureProgress = 0;
  pendingSnap = false;
  awaitingSnap = false;
  spaceFlight.reset();
  selectSpaceTarget("Moon");
  spaceFlight.enterOrbit("Earth", 36);
  solarSystem.group.visible = true;
  tiles.group.visible = false;
  sky.mesh.visible = false;
  sun.visible = false;
  sun.target.visible = false;
  if (beacon) beacon.visible = false;
  hideAllMates();
  scene.fog = null;
  scene.background.setHex(0x01030a);
  renderer.setClearColor(0x01030a);
  renderer.toneMappingExposure = SPACE_EXPOSURE;
  camera.near = 0.08;
  camera.far = 100000;
  camera.updateProjectionMatrix();
  firstPersonActive = false;
  if (firstPersonRig) firstPersonRig.visible = false;
  setParachutistFirstPerson(planeMesh, false);
  orbit.yaw = 0;
  orbit.pitch = 0.25;
  orbit.zoom = 1;
  document.body.classList.add("space-mode");
  el.spaceNav.hidden = false;
  camInit = false;
  setSpaceNotice("Earth orbit reached. Select a destination or fly manually.", 5000);
}

function leaveSpaceFlight() {
  rocketLaunch = null;
  earthReentry = null;
  spaceModeActive = false;
  spaceFlight.reset();
  spaceNotice = "";
  spaceNoticeUntil = 0;
  resetSpaceActionHint();
  spaceEnvironmentMessage = "";
  spaceEntryBody = null;
  spaceLandedBody = null;
  spaceEntryTransition = null;
  blackHoleSequence = false;
  if (blackHoleTimer) clearTimeout(blackHoleTimer);
  if (blackHolePhaseTimer) clearTimeout(blackHolePhaseTimer);
  if (blackHoleEntryTimer) clearTimeout(blackHoleEntryTimer);
  if (blackHoleCountdownDelayTimer) clearTimeout(blackHoleCountdownDelayTimer);
  if (blackHoleCountdownTimer) clearInterval(blackHoleCountdownTimer);
  blackHoleTimer = null;
  blackHolePhaseTimer = null;
  blackHoleEntryTimer = null;
  blackHoleCountdownDelayTimer = null;
  blackHoleCountdownTimer = null;
  blackHolePhase = "idle";
  blackHoleGravity = null;
  blackHoleCaptureStartedAt = 0;
  blackHoleCaptureProgress = 0;
  blackHoleSequenceStartedAt = 0;
  blackHoleTesseractStartedAt = 0;
  stopTesseractVideo();
  interstellarArrivalPending = false;
  interstellarArrivalStartedAt = 0;
  hidePlanetEntryVisual();
  hideCooperFarmArrival();
  stopBlackHoleScore();
  document.body.classList.remove("space-mode", "hyperdrive", "solar-warning", "black-hole-transit", "black-hole-gravity", "black-hole-accretion");
  el.interstellar?.classList.remove("show", "tesseract-phase", "silent-void", "countdown-only", "approach-phase");
  el.interstellar?.setAttribute("aria-hidden", "true");
  el.transitCountdown?.setAttribute("aria-hidden", "true");
  el.transitStatus?.setAttribute("aria-hidden", "true");
  if (el.spaceNav) el.spaceNav.hidden = true;
  if (solarSystem) solarSystem.group.visible = false;
  if (sky) sky.mesh.visible = true;
  if (sun) {
    sun.visible = true;
    sun.target.visible = true;
  }
  if (scene) {
    scene.fog = earthFog;
    if (scene.background?.setHex) scene.background.setHex(0x8ec8e8);
  }
  if (renderer) {
    renderer.setClearColor(0x8ec8e8);
    renderer.toneMappingExposure = EARTH_EXPOSURE;
  }
  if (camera) {
    camera.near = 1;
    camera.far = 2e6;
    camera.updateProjectionMatrix();
  }
  if (planeMesh) planeMesh.scale.setScalar(1);
}

function formatSpaceDistance(distance) {
  if (!Number.isFinite(distance)) return "–";
  return distance >= 1000 ? `${(distance / 1000).toFixed(2)}k units` : `${Math.round(distance)} units`;
}

function renderSpaceCredits() {
  const label = document.createElement("span");
  label.textContent = "Planet maps: ";
  const source = document.createElement("a");
  source.href = "https://www.solarsystemscope.com/textures/";
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "Solar System Scope";
  const license = document.createElement("a");
  license.href = "https://creativecommons.org/licenses/by/4.0/";
  license.target = "_blank";
  license.rel = "noopener noreferrer";
  license.textContent = "CC BY 4.0";
  const separator = document.createElement("span");
  separator.textContent = " · Black-hole physics: ";
  const blackHoleSource = document.createElement("a");
  blackHoleSource.href = "https://github.com/Adriwin06/black-hole";
  blackHoleSource.target = "_blank";
  blackHoleSource.rel = "noopener noreferrer";
  blackHoleSource.textContent = "Adriwin06 / oseiskar (MIT)";
  credits.replaceChildren(label, source, license, separator, blackHoleSource);
}

function tickSpaceFrame(dt, rawDt, flying) {
  spacePositionBefore.copy(spaceFlight.position);
  if (blackHoleSequence) {
    const transitNow = performance.now();
    if (blackHoleSequenceStartedAt && transitNow - blackHoleSequenceStartedAt >= BLACK_HOLE_SEQUENCE_MS) {
      finishInterstellarJump();
      return;
    }
    setBlackHoleTransitProgress(blackHolePhase === "tesseract"
      ? Math.max(0, Math.min(1, (transitNow - blackHoleTesseractStartedAt) / BLACK_HOLE_TESSERACT_MS))
      : 0);
  }
  const spaceCanMove = flying && !spaceLandedBody && !blackHoleSequence;
  if (spaceCanMove) {
    spaceCtrl.roll = ctrl.roll;
    spaceCtrl.pitch = ctrl.pitch;
    spaceCtrl.throttle = ctrl.throttle;
    if (spaceEntryBody) {
      const entryTarget = spaceFlight.bodies.get(spaceEntryBody);
      if (entryTarget && Math.abs(ctrl.roll) + Math.abs(ctrl.pitch) < 0.08) {
        spaceLook.copy(entryTarget.position).sub(spaceFlight.position).normalize();
        spaceFlight.forward.lerp(spaceLook, 1 - Math.exp(-2.8 * dt)).normalize();
      }
      spaceCtrl.throttle = -1;
    }
    spaceFlight.update(dt, spaceCtrl);
    checkSpaceEnvironment(dt);
  }
  spaceCameraTravel.subVectors(spaceFlight.position, spacePositionBefore);
  document.body.classList.toggle("hyperdrive", !!(spaceCanMove && spaceFlight.hyperdrive));

  planeMesh.position.copy(spaceFlight.position);
  const surfaceBody = spaceFlight.surfaceBody ? spaceFlight.bodies.get(spaceFlight.surfaceBody) : null;
  if (surfaceBody) spaceUp.copy(spaceFlight.position).sub(surfaceBody.position).normalize();
  else spaceUp.set(0, 1, 0);
  if (Math.abs(spaceFlight.forward.dot(spaceUp)) > 0.94) spaceUp.set(1, 0, 0);
  spaceLook.copy(spaceFlight.position).add(spaceFlight.forward);
  spaceMatrix.lookAt(spaceFlight.position, spaceLook, spaceUp);
  planeMesh.quaternion.setFromRotationMatrix(spaceMatrix);
  planeMesh.scale.setScalar(0.16);
  planeMesh.visible = !menuOpen && !crashed && !blackHoleSequence;
  updateRocketPlume(
    planeMesh,
    spaceCanMove && !spaceFlight.orbitBody,
    spaceFlight.hyperdrive ? 1.3 : Math.max(0.42, spaceFlight.speed / spaceFlight.cruiseSpeed),
    true,
    clock.elapsedTime,
  );

  spaceRight.crossVectors(spaceFlight.forward, spaceUp);
  if (spaceRight.lengthSq() < 1e-5) spaceRight.set(1, 0, 0);
  else spaceRight.normalize();
  spaceUp.crossVectors(spaceRight, spaceFlight.forward).normalize();
  const cameraLift = spaceUp;
  const cameraRadius = (surfaceBody ? 7.2 : 18.5) * orbit.zoom;
  const cameraPitchCos = Math.cos(orbit.pitch);
  spaceViewOffset.copy(spaceFlight.forward).multiplyScalar(-Math.cos(orbit.yaw) * cameraPitchCos)
    .addScaledVector(spaceRight, Math.sin(orbit.yaw) * cameraPitchCos)
    .addScaledVector(cameraLift, Math.sin(orbit.pitch))
    .normalize();
  spaceCameraGoal.copy(spaceFlight.position).addScaledVector(spaceViewOffset, cameraRadius);
  if (!camInit) camPos.copy(spaceCameraGoal);
  else {
    // Move the camera by the rocket's full frame translation before smoothing
    // its orbit offset. This prevents the chase camera lag from exploding at
    // hyperdrive speed and keeps the rocket at a stable on-screen distance.
    camPos.add(spaceCameraTravel);
    camPos.lerp(spaceCameraGoal, 1 - Math.exp(-10 * dt));
  }
  camInit = true;
  camera.position.copy(camPos);
  const captureShake = blackHoleCaptureStartedAt
    ? Math.max(0, Math.min(1, (blackHoleCaptureProgress - 0.18) / 0.82))
    : 0;
  if (captureShake > 0 && !blackHoleSequence) {
    const shakeTime = performance.now() * 0.001;
    const shakeAmount = captureShake * captureShake * 0.42;
    camera.position.addScaledVector(spaceRight, (Math.sin(shakeTime * 31) + Math.sin(shakeTime * 47) * 0.35) * shakeAmount);
    camera.position.addScaledVector(spaceUp, (Math.cos(shakeTime * 37) + Math.sin(shakeTime * 53) * 0.3) * shakeAmount * 0.72);
  }
  camTarget.copy(spaceFlight.position).addScaledVector(spaceFlight.forward, 5);
  camera.up.copy(cameraLift);
  camera.lookAt(camTarget);
  solarSystem.update(
    dt,
    spaceFlight.targetName,
    clock.elapsedTime,
    camera.position,
    blackHoleGravity?.intensity || 0,
    spaceFlight.surfaceBody,
  );

  const entryAge = spaceEntryTransition ? performance.now() - spaceEntryTransition.startedAt : Infinity;
  const entryZoom = entryAge < 4600 ? Math.sin(Math.min(1, entryAge / 4600) * Math.PI) : 0;
  const targetFov = spaceFlight.hyperdrive ? 78 : surfaceBody ? 62 : spaceEntryBody ? 70 - entryZoom * 15 : 70;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt);
    camera.updateProjectionMatrix();
  }
  if (solarSystem.targetMarker.visible) solarSystem.targetMarker.lookAt(camera.position);

  updateEngineSound(spaceCanMove, 0.78 + (spaceFlight.hyperdrive ? 0.22 : 0), spaceFlight.speed / spaceFlight.hyperSpeed, "rocket");
  updateMusic();
  if (frameCount % 2 === 0) updateHud(0);
  if (frameCount % 4 === 0) syncTouchUi();
  renderer.render(scene, camera);

  const nearest = spaceFlight.nearestBody();
  const spaceActionHint = updateSpaceActionHint(nearest);
  const orbitLabel = blackHoleSequence
    ? blackHolePhase === "tesseract"
      ? "GRAVITATIONAL TESSERACT"
      : blackHolePhase === "approach" ? "TESSERACT APPROACH" : "BEYOND THE EVENT HORIZON"
    : spaceLandedBody
      ? `Landed: ${spaceLandedBody}`
      : spaceFlight.surfaceBody
        ? `${spaceFlight.surfaceBody} surface flight`
      : spaceEntryBody
        ? `${spaceEntryBody} atmospheric entry`
        : spaceFlight.orbitBody ? `${spaceFlight.orbitBody} orbit` : spaceFlight.autopilot ? `Course: ${spaceFlight.targetName}` : "Manual flight";
  if (el.spaceModeLabel) el.spaceModeLabel.textContent = spaceFlight.hyperdrive ? "HYPERDRIVE" : orbitLabel;
  if (el.spaceTargetInfo) el.spaceTargetInfo.textContent = `Target ${spaceFlight.targetName}: ${formatSpaceDistance(spaceFlight.targetDistance())} · Nearest ${nearest?.body?.name || "–"}: ${formatSpaceDistance(nearest?.distance)}`;
  if (el.spaceEnter) {
    const interactBody = spaceLandedBody || spaceFlight.surfaceBody || spaceFlight.orbitBody;
    const interact = interactBody ? spaceFlight.bodies.get(interactBody) : null;
    el.spaceEnter.disabled = !interact || !!interact.hazard || blackHoleSequence;
    el.spaceEnter.textContent = spaceLandedBody
      ? `Launch from ${spaceLandedBody}`
      : spaceFlight.surfaceBody
        ? `Return to ${spaceFlight.surfaceBody} orbit`
      : interactBody === "Earth"
        ? "Return through Earth atmosphere"
        : interact ? `Enter ${interactBody} ${interact.gasGiant ? "clouds" : "surface"}` : "Establish orbit to descend";
  }
  if (frameCount % 20 === 0) {
    flightStatus.hidden = menuOpen;
    flightStatus.textContent = `${orbitLabel} · ${Math.round(spaceFlight.speed)} units/s · ${Math.round(1 / Math.max(rawDt, 0.001))} FPS`;
    renderSpaceCredits();
  }
  window.__dbg = {
    frame: frameCount,
    mode,
    menuOpen,
    spaceMode: true,
    rocketLaunch: false,
    spacePosition: spaceFlight.position.toArray(),
    spaceForward: spaceFlight.forward.toArray(),
    spaceSpeed: spaceFlight.speed,
    hyperdrive: spaceFlight.hyperdrive,
    orbitBody: spaceFlight.orbitBody,
    spaceActionHint: spaceActionHint ? { key: spaceActionHint.key, context: spaceActionHint.context } : null,
    target: spaceFlight.targetName,
    targetDistance: spaceFlight.targetDistance(),
    spaceEntryBody,
    spaceLandedBody,
    spaceSurfaceBody: spaceFlight.surfaceBody,
    spaceEntryTransition: spaceEntryTransition ? { ...spaceEntryTransition } : null,
    blackHoleSequence,
    blackHolePhase,
    tesseractVideo: el.tesseractVideo ? {
      currentTime: Math.round(el.tesseractVideo.currentTime * 1000) / 1000,
      duration: Number.isFinite(el.tesseractVideo.duration) ? Math.round(el.tesseractVideo.duration * 1000) / 1000 : null,
      paused: el.tesseractVideo.paused,
      readyState: el.tesseractVideo.readyState,
      videoWidth: el.tesseractVideo.videoWidth,
      videoHeight: el.tesseractVideo.videoHeight,
      muted: el.tesseractVideo.muted,
      error: tesseractVideoError || el.tesseractVideo.error?.message || "",
    } : null,
    blackHoleGravity: blackHoleGravity ? { ...blackHoleGravity } : null,
    blackHoleCaptureProgress,
    blackHoleCameraShake: captureShake,
    selectedPlane,
    planeMeshKey: planeMesh?.userData?.key || "",
    rocketPlume: planeMesh?.userData?.rocketPlume ? {
      visible: planeMesh.userData.rocketPlume.visible,
      space: !!planeMesh.userData.rocketPlume.userData.space,
      color: `#${planeMesh.userData.rocketPlume.userData.outerMaterial.color.getHexString()}`,
    } : null,
    music: musicDebug(),
    spaceCameraDistance: camera.position.distanceTo(spaceFlight.position),
    spaceCameraOrbit: { yaw: orbit.yaw, pitch: orbit.pitch, zoom: orbit.zoom },
    spaceTextures: { ...solarSystem.textures },
    crashed,
  };
  window.__cam = camera;
  window.__planeMesh = planeMesh;
}

function restartMode() {
  if (mp.active) {
    backToLobby();
    return;
  }
  if (mode === "home" && homeTarget) {
    timeLeft = HOME_TIME;
    timerActive = false; // włączy się po dosadzeniu (finishSnapStart)
    awaitingSnap = true;
    awaitingSnapSince = performance.now();
    resetFlight(startLat, startLon);
    placeBeaconAt(homeTarget.lat, homeTarget.lon);
  } else if (mode === "guess") {
    const p = pickGuessStart(guessScope);
    timeLeft = GUESS_TIME;
    timerActive = false; // włączy się po dosadzeniu (finishSnapStart)
    awaitingSnap = true;
    awaitingSnapSince = performance.now();
    resetFlight(p.lat, p.lon);
  } else {
    awaitingSnap = true;
    awaitingSnapSince = performance.now();
    resetFlight(startLat, startLon);
  }
}

const camPos = new Vector3();
const camTarget = new Vector3();
const planePos = new Vector3();
const planeQuat = new Quaternion();
const offset = new Vector3();
const cameraLocalOffset = new Vector3();
const cameraLocalGoal = new Vector3();
const camFramePos = new Vector3();
const camFrameQuat = new Quaternion();
const camFrameScale = new Vector3();
const skyQuat = new Quaternion(); // lokalna ramka N/S (bez kursu) — dla kopuły nieba i słońca
const skyFramePos = new Vector3();
const skyFrameScale = new Vector3();
const planeFrameMatrix = new Matrix4();
const mateFrameMatrix = new Matrix4();
const chaseFrameMatrix = new Matrix4();
const skyFrameMatrix = new Matrix4();
const detailFrameMatrix = new Matrix4();
let camInit = false;

const adaptiveQuality = new AdaptiveQuality();
const flightStatus = document.createElement('div'); flightStatus.id = 'flight-status'; document.body.append(flightStatus);
const movementStatus = document.createElement('div'); movementStatus.id = 'movement-status'; movementStatus.hidden = true; document.body.append(movementStatus);
const streetViewLink = document.createElement('button');
streetViewLink.id = 'street-view-link';
streetViewLink.type = 'button';
streetViewLink.textContent = 'Enter Street View';
streetViewLink.hidden = true;
document.body.append(streetViewLink);
const credits = document.createElement('div'); credits.id = 'map-credits'; document.body.append(credits);
const attributionEntries = [];
let mapCreditsSignature = "";
let mapCreditsRenderCount = 0;

function refreshMapCredits() {
  attributionEntries.length = 0;
  const entries = tiles.getAttributions(attributionEntries);
  const hasTerrain = tiles.visibleTiles.size > 0;
  const signature = `${hasTerrain ? 1 : 0}:${attributionSignature(entries)}`;
  if (signature === mapCreditsSignature) return;
  mapCreditsSignature = signature;
  renderAttributions(credits, entries);
  if (hasTerrain) {
    const source = document.createElement('span');
    source.textContent = 'Terrain: Google Maps';
    credits.prepend(source);
  }
  mapCreditsRenderCount += 1;
}
const settingsUI = setupSettings(() => { adaptiveQuality.reset(); applyQuality(); }, () => { if (!menuOpen) setPaused(true); });
setupLocationPicker(() => { if (!menuOpen) setPaused(true); });
const orbit = { yaw:0, pitch:0.25, zoom:1, dragging:false };

function showStreetPrompt() {
  if (!plane || plane.state !== "grounded" || streetModeActive) return;
  el.streetPromptCopy.textContent = "The game will look for imagery on the closest available street. On a roof or a building, the panorama may begin beside the building instead of at the exact landing point.";
  el.streetPromptNote.textContent = "Google Maps opens separately without a paid API. Return to this game tab to continue; browser security prevents transferring movement from Google Maps back to the game.";
  el.streetEnter.textContent = "Open nearest Street View";
  if (!el.streetPrompt.open) el.streetPrompt.showModal();
}

async function enterStreetView() {
  if (!plane || plane.state !== "grounded") return;
  el.streetPrompt.close();
  externalStreetWindow = window.open(
    streetViewUrl(plane.latDeg, plane.lonDeg, plane.headingDeg),
    "fotw-street-view",
    "popup=yes,width=1280,height=800"
  );
  if (!externalStreetWindow) {
    el.streetPromptCopy.textContent = "The browser blocked the Street View window.";
    el.streetPromptNote.textContent = "Allow pop-ups for this site and try again.";
    if (!el.streetPrompt.open) el.streetPrompt.showModal();
    return;
  }
  try { externalStreetWindow.opener = null; } catch { /* cross-origin protection */ }
  streetModeActive = true;
  keys.clear();
  el.streetView.innerHTML = '<div class="street-external-card"><strong>Street View is open in another window</strong><span>Close Google Maps or return here and use the visible Return to game button. Your landing point is preserved.</span></div>';
  el.streetModeStatus.textContent = "Close Google Maps or tap Return to game. Escape and Space also work while this game tab is active.";
  el.streetMode.classList.add("open", "external");
  el.streetMode.setAttribute("aria-hidden", "false");
}

function leaveStreetView() {
  if (!streetModeActive) return;
  try { externalStreetWindow?.close(); } catch { /* already closed */ }
  externalStreetWindow = null;
  streetModeActive = false;
  el.streetMode.classList.remove("open", "external");
  el.streetMode.setAttribute("aria-hidden", "true");
  el.streetView.replaceChildren();
  keys.clear();
  renderer?.domElement?.focus?.();
}

streetViewLink.addEventListener("click", showStreetPrompt);
el.streetEnter?.addEventListener("click", enterStreetView);
el.streetReturn?.addEventListener("click", leaveStreetView);
function bindOrbit(canvas) {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 2 || (spaceModeActive && e.button === 0)) {
      orbit.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', e => { if (orbit.dragging) { orbit.yaw -= e.movementX * 0.005; orbit.pitch = Math.max(-1.2, Math.min(1.4, orbit.pitch + e.movementY * 0.005)); } });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, () => { orbit.dragging = false; });
  canvas.addEventListener('wheel', e => { if (!menuOpen) { e.preventDefault(); orbit.zoom = Math.max(spaceModeActive ? 0.2 : 0.5, Math.min(spaceModeActive ? 12 : 8, orbit.zoom * Math.exp(e.deltaY * 0.001))); } }, {passive:false});
}
function applyQuality() {
  if (!renderer) return;
  const q = QUALITY[settings.quality];
  applyPixelRatio();
  renderer.shadowMap.enabled = q.shadows;
  if (sun) sun.castShadow = q.shadows;
  if (tiles) {
    terrainDetailMode = "";
    setTerrainDetail("normal");
  }
}

function setTerrainDetail(modeName) {
  if (!tiles) return;
  let changed = false;
  if (modeName !== terrainDetailMode) {
    terrainDetailMode = modeName;
    terrainDetailChangedAt = performance.now();
    terrainStreamingKey = "";
    changed = true;
  }
  // Motion and FPS thresholds do not need to rebuild the profile every frame.
  // Sampling four times per second reacts quickly without adding hot-loop GC.
  if (changed || !terrainStreamingProfile || frameCount % 15 === 0) tuneTerrainStreaming();
}

function tuneTerrainStreaming() {
  const cacheFull = Boolean(tiles?.lruCache?.isFull?.());
  const fastFlight = !spaceModeActive
    && !menuOpen
    && !paused
    && !!plane
    && selectedPlane !== "parachutist"
    && (plane.speed >= 120 || (plane.speed >= 90 && Math.abs(ctrl.roll) >= 0.25));
  const profile = terrainStreamProfile(terrainDetailMode, adaptiveQuality.lastFps, isMobile, cacheFull, memorySafeMode, fastFlight);
  const q = QUALITY[settings.quality];
  const parseJobs = Math.min(terrainBaseParseJobs, profile.maxConcurrentParses || terrainBaseParseJobs);
  const profileKey = [terrainDetailMode, profile.error, profile.maxTilesProcessed, parseJobs, profile.prefetch, cacheFull].join(":");
  terrainStreamingProfile = { ...profile, fastFlight, parseJobs };
  if (profileKey === terrainStreamingKey) return profile;
  terrainStreamingKey = profileKey;
  tiles.errorTarget = Math.min(q.error, profile.error);
  tiles.errorFalloff = profile.errorFalloff;
  tiles.maxTilesProcessed = profile.maxTilesProcessed;
  tiles.parseQueue.maxJobs = parseJobs;
  tiles.lruCache.maxSize = profile.cacheTiles;
  tiles.lruCache.minSize = Math.round(profile.cacheTiles * 0.48);
  tiles.lruCache.maxBytesSize = profile.cacheBytes;
  tiles.lruCache.minBytesSize = profile.cacheBytes * 0.58;
  if (unloadTilesPlugin) unloadTilesPlugin.bytesTarget = profile.gpuBytes;
  tiles.loadSiblings = !isMobile;
  tiles.setResolutionFromRenderer(camera, renderer);
  return profile;
}

function updateDetailCamera() {
  if (!tiles || !detailCameras?.length || !plane) return;
  const modeAge = performance.now() - terrainDetailChangedAt;
  const streetSweep = terrainDetailMode === "street";
  const active = terrainDetailMode === "landing" || streetSweep;
  const profile = terrainStreamingProfile || tuneTerrainStreaming();
  if (!active) {
    while (detailCameraRegistered > 0) {
      detailCameraRegistered -= 1;
      tiles.deleteCamera(detailCameras[detailCameraRegistered]);
    }
    return;
  }
  // Wait for the visible view to settle, then sweep one off-screen sector at a
  // time. Under load the sweep is removed immediately and only the main camera
  // can request tiles.
  const warm = modeAge >= (streetSweep ? 3500 : 1800);
  const wanted = warm && profile.prefetch && !tiles.isLoading ? 1 : 0;
  while (detailCameraRegistered < wanted) {
    tiles.setCamera(detailCameras[detailCameraRegistered]);
    detailCameraRegistered += 1;
  }
  while (detailCameraRegistered > wanted) {
    detailCameraRegistered -= 1;
    tiles.deleteCamera(detailCameras[detailCameraRegistered]);
  }
  const detailHeight = Math.max(-500, groundAlt) + 1.75;
  const width = profile.prefetchWidth;
  for (let i = 0; i < detailCameraRegistered; i++) {
    const detailCamera = detailCameras[i];
    const sweepSector = streetSweep ? 1 + Math.floor((modeAge - 3500) / 1600) % 3 : 1;
    const detailHeading = plane.heading + sweepSector * Math.PI / 2;
    const matrix = frameAt(plane.lat, plane.lon, detailHeight, detailHeading, -0.06, 0, detailFrameMatrix);
    matrix.decompose(detailCamera.position, detailCamera.quaternion, detailCamera.scale);
    detailCamera.updateMatrixWorld(true);
    tiles.setResolution(detailCamera, width, Math.round(width * 9 / 16));
  }
}
let lastAutomatedFrameAt = 0;
init();
animate();

window.addEventListener("error", (e) => {
  const msg = e.message || "Unexpected error";
  if (!msg || msg === "Script error.") return;
  rememberError(msg);
  if (awaitingSnap || !menuOpen) showFatal(msg);
  else if (el.menuError) el.menuError.textContent = msg;
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason?.message || e.reason || "Unexpected error");
  rememberError(msg);
  if (awaitingSnap || !menuOpen) showFatal(msg);
  else if (el.menuError) el.menuError.textContent = msg;
});
function animate(now = performance.now()) {
  if (window.__ctxLost) return;
  // Headless browser tests do not need a full-rate 3D simulation. Capping the
  // automated renderer prevents software WebGL from saturating the CPU while
  // keeping controls, resize and loading behaviour representative.
  if (navigator.webdriver && now - lastAutomatedFrameAt < 66) {
    requestAnimationFrame(animate);
    return;
  }
  lastAutomatedFrameAt = now;
  try {
    tickFrame();
    requestAnimationFrame(animate);
  } catch (err) {
    console.error(err);
    showFatal(err?.message || "The game crashed while drawing a frame");
  }
}

function tickFrame() {
  if (!tiles || !plane) return;

  const rawDt = clock.getDelta();
  const frameNow = performance.now();
  if (document.hidden) return;
  const dt = Math.min(rawDt, 0.05);
  if (!menuOpen && !paused) {
    const qualityChanged = adaptiveQuality.sample(rawDt);
    if (settings.adaptive && qualityChanged) applyPixelRatio();
  }
  frameCount += 1;
  scene.updateMatrixWorld();

  const flying = !menuOpen && !paused && !guessOpen && !crashed && !finished && !streetModeActive;

  // sterowanie lotnicze: W / góra = drążek od siebie = nos w dół
  const keyRoll =
    (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
    (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const keyPitch =
    (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
    (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const rollIn = keyRoll || touch.roll;
  const pitchIn = keyPitch || touch.pitch;
  ctrl.roll += (rollIn - ctrl.roll) * Math.min(1, 6 * dt);
  ctrl.pitch += (pitchIn - ctrl.pitch) * Math.min(1, 6 * dt);
  const cameraClimbTarget = selectedPlane === "parachutist" && plane?.state !== "grounded"
    ? parachutistCameraClimbAssist(orbit.pitch, orbit.dragging)
    : 0;
  ctrl.cameraClimb += (cameraClimbTarget - ctrl.cameraClimb) * Math.min(1, 8 * dt);
  ctrl.throttle = touch.boost || keys.has("shift") ? 1 : touch.brake || keys.has("control") ? -1 : 0;

  if (spaceModeActive) {
    tickSpaceFrame(dt, rawDt, flying);
    return;
  }

  if (flying) {
    // równe kroki — duży dt przy ładowaniu kafelków nie robi „przeskoku” przy nitro
    let left = dt;
    const step = 1 / 60;
    while (left > 0) {
      const s = Math.min(step, left);
      if (rocketLaunch) updateRocketLaunch(s);
      else if (earthReentry) updateEarthReentry(s);
      else if (interstellarArrivalPending || cooperFarmRocketReady) {
        plane.speed = 0;
        plane.throttle = 0;
        plane.pitch = Math.PI / 2;
        plane.roll = 0;
        if (cooperFarmRocketReady) plane.height = groundAlt + 4.8;
      }
      else plane.update(s, ctrl);
      left -= s;
      if (spaceModeActive) break;
    }
  }

  if (spaceModeActive) {
    tickSpaceFrame(dt, rawDt, flying);
    return;
  }

  // dźwięk silnika — obroty z przepustnicy i prędkości, opływ z prędkości
  const speed01 = plane.speed / plane.boost;
  const rpm01 = Math.min(
    1,
    Math.max(0.15, 0.22 + plane.throttle * 0.78)
  );
  const movingThroughAir = selectedPlane !== "parachutist" || plane.state !== "grounded";
  updateEngineSound(flying && movingThroughAir, rpm01, speed01, PLANES[selectedPlane].sound);
  updateMusic();

  // pozycja i orientacja samolotu
  const m = frameAt(plane.lat, plane.lon, plane.height, plane.heading, plane.pitch, -plane.roll, planeFrameMatrix);
  m.decompose(planePos, planeQuat, planeMesh.scale);
  planeMesh.position.copy(planePos);
  planeMesh.quaternion.copy(planeQuat);
  if (planeMesh.userData.prop) {
    planeMesh.userData.prop.rotation.z += plane.speed * dt * 1.6;
  }
  spinRotors(planeMesh, dt, plane.speed);
  if (selectedPlane === "parachutist") updateParachutistModel(planeMesh, plane.state, plane.speed, dt);
  if (selectedPlane === "rocket") {
    const rocketEngineActive = flying && !earthReentry && !interstellarArrivalPending && !cooperFarmRocketReady;
    updateRocketPlume(
      planeMesh,
      rocketEngineActive,
      rocketLaunch ? 1.3 : Math.max(0.35, plane.throttle),
      false,
      clock.elapsedTime,
    );
  }
  for (const mate of mp.mates.values()) {
    if (mate.mesh) spinRotors(mate.mesh, dt, plane.speed);
  }

  if (mp.active && !menuOpen && !guessOpen && !crashed) {
    const now = performance.now();
    if (now - mp.lastPoseAt > MATE_SEND_MS) {
      mp.lastPoseAt = now;
      mp.poseSeq += 1;
      mp.net?.send({
        t: "pose",
        from: mp.myId,
        seq: mp.poseSeq,
        at: now,
        lat: plane.latDeg,
        lon: plane.lonDeg,
        h: plane.height,
        heading: plane.heading,
        pitch: plane.pitch,
        roll: plane.roll,
        plane: selectedPlane,
        state: plane.state,
        motion: Math.abs(plane.speed),
      });
    }
  }
  if (mp.active && !menuOpen) {
    const deg = Math.PI / 180;
    const renderAt = performance.now() - MATE_INTERP_MS;
    for (const [id, track] of mp.poses) {
      if (id === mp.myId) continue;
      const samples = track.samples;
      if (!mp.mates.get(id)?.mesh || mp.mates.get(id)?.key !== track.plane) loadMate(id, track.plane || "pa28");
      const mate = mp.mates.get(id);
      if (!mate?.mesh || !samples?.length) continue;
      let from = samples[0];
      let to = samples[samples.length - 1];
      let u = 1;
      if (renderAt <= samples[0].at) {
        to = from;
        u = 0;
      } else if (renderAt >= to.at) {
        from = to;
        u = 1;
      } else {
        for (let i = 1; i < samples.length; i++) {
          if (samples[i].at >= renderAt) {
            from = samples[i - 1];
            to = samples[i];
            u = (renderAt - from.at) / Math.max(1, to.at - from.at);
            break;
          }
        }
      }
      const mm = frameAt(
        (from.lat + (to.lat - from.lat) * u) * deg,
        (from.lon + (to.lon - from.lon) * u) * deg,
        from.h + (to.h - from.h) * u,
        lerpAngle(from.heading, to.heading, u),
        from.pitch + (to.pitch - from.pitch) * u,
        -(from.roll + (to.roll - from.roll) * u),
        mateFrameMatrix,
      );
      mm.decompose(matePos, mateQuat, mateScale);
      mate.mesh.position.copy(matePos);
      mate.mesh.quaternion.copy(mateQuat);
      mate.mesh.scale.copy(mateScale);
      mate.mesh.visible = true;
      if (track.plane === "parachutist") {
        const state = u < 0.5 ? from.state : to.state;
        const motion = from.motion + (to.motion - from.motion) * u;
        updateParachutistModel(mate.mesh, state || "airborne", motion || 0, dt);
      }
      const marker = ensureMateMarker(mate);
      const markOn = mp.goAt && performance.now() - mp.goAt < MATE_MARKER_MS;
      mateUp.set(0, 1, 0).applyQuaternion(mateQuat).normalize();
      marker.scale.copy(mateScale);
      marker.position.copy(matePos).addScaledVector(mateUp, 18 * (mateScale.y || 1));
      marker.quaternion.copy(mateQuat);
      marker.visible = markOn && Math.sin(performance.now() * 0.014) > 0;
    }
  } else {
    hideAllMates();
  }

  // sztywna kamera za samolotem — tylko kurs, bez przechyłu/pochylenia
  const camFrame = frameAt(plane.lat, plane.lon, plane.height, plane.heading, rocketLaunch || earthReentry ? plane.pitch : 0, 0, chaseFrameMatrix);
  camFrame.decompose(camFramePos, camFrameQuat, camFrameScale);
  const firstPerson = selectedPlane === "parachutist" && !menuOpen && orbit.zoom <= 0.56;
  if (firstPerson !== firstPersonActive) {
    firstPersonActive = firstPerson;
    camInit = false;
    camera.near = firstPerson ? 0.05 : 1;
    camera.updateProjectionMatrix();
  }
  if (firstPersonRig) {
    firstPersonRig.visible = firstPerson;
    updateFirstPersonArms(firstPersonRig, ctrl, dt, plane.state, plane.speed);
  }
  setParachutistFirstPerson(planeMesh, firstPerson);
  const farmArrivalCamera = selectedPlane === "rocket" && (interstellarArrivalPending || cooperFarmRocketReady);
  const launchCameraPhase = rocketLaunch
    ? rocketLaunchCameraPhase((frameNow - rocketLaunch.startedAt) / 1000)
    : 0;
  const cameraProfile = rocketLaunch
    ? [0, 3.1, 10.5]
    : earthReentry ? [0, 4.3, 15]
    : farmArrivalCamera ? [0, 7.5, 25]
    : selectedPlane === "parachutist" && plane.state === "grounded" ? [0, 2.4, 5.5] : camOffset;
  if (firstPerson) {
    offset.set(0, 1.58, 0.08).applyQuaternion(camFrameQuat).add(planePos);
    camPos.copy(offset);
  } else {
    const cameraZoom = rocketLaunch ? Math.min(1, orbit.zoom) : earthReentry ? Math.min(1.08, orbit.zoom) : orbit.zoom;
    if (rocketLaunch) {
      // Begin directly behind the rocket, then move above and well off-axis.
      // The final three-quarter view keeps its nose, the receding ground and
      // the darkening sky in the same frame throughout the atmospheric climb.
      cameraLocalGoal.set(
        -Math.sin(launchCameraPhase * Math.PI * 0.5) * 7,
        3.1 + launchCameraPhase * 14.4,
        10.5 - launchCameraPhase * 20.5,
      ).multiplyScalar(cameraZoom);
    } else {
      const radius = Math.hypot(cameraProfile[1], cameraProfile[2]) * cameraZoom;
      cameraLocalGoal.set(
        Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * radius,
        Math.sin(orbit.pitch) * radius,
        Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * radius,
      );
    }
    if (!camInit || rocketLaunch || earthReentry || farmArrivalCamera) {
      cameraLocalOffset.copy(cameraLocalGoal);
    } else {
      updateChaseOffset(cameraLocalOffset, cameraLocalGoal, dt);
    }
    camPos.copy(cameraLocalOffset).applyQuaternion(camFrameQuat).add(planePos);
  }
  camInit = true;
  camera.position.copy(camPos);
  // trzęsienie kamery po wybuchu
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.3);
    const s = shake * shake * 7;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  if (firstPerson) {
    const cosPitch = Math.cos(orbit.pitch);
    camTarget.set(Math.sin(orbit.yaw) * cosPitch * 30, 1.58 - Math.sin(orbit.pitch) * 30, -Math.cos(orbit.yaw) * cosPitch * 30).applyQuaternion(camFrameQuat).add(planePos);
  } else if (rocketLaunch) {
    camTarget.set(
      0,
      0.5 - launchCameraPhase * 0.1,
      -4.2 + launchCameraPhase * 4.8,
    ).applyQuaternion(camFrameQuat).add(planePos);
  } else {
    camTarget.set(0, selectedPlane === "parachutist" && plane.state === "grounded" ? 1.1 : 0.5, -cameraProfile[2] * 0.4).applyQuaternion(camFrameQuat).add(planePos);
  }
  if (selectedPlane === "parachutist" && plane.state === "grounded" && !firstPerson) {
    cameraCollisionDir.copy(camPos).sub(camTarget);
    const desiredDistance = cameraCollisionDir.length();
    if (desiredDistance > 0.1) {
      cameraCollisionDir.multiplyScalar(1 / desiredDistance);
      if (frameNow - lastCameraProbeAt >= 60 || cameraObstacleDistance == null) {
        lastCameraProbeAt = frameNow;
        cameraRaycaster.set(camTarget, cameraCollisionDir);
        cameraRaycaster.far = desiredDistance;
        const obstruction = raycastVisibleTerrain(tiles, cameraRaycaster);
        cameraObstacleDistance = obstruction ? Math.max(0.8, obstruction.distance - 0.3) : desiredDistance;
      }
      const safeDistance = Math.min(desiredDistance, cameraObstacleDistance ?? desiredDistance);
      camPos.copy(camTarget).addScaledVector(cameraCollisionDir, safeDistance);
      camera.position.copy(camPos);
    }
  } else {
    cameraObstacleDistance = null;
  }
  camera.up.set(0, 1, 0).applyQuaternion(camFrameQuat); // lokalny pion, nie globalny Y
  camera.lookAt(camTarget);

  // kopuła nieba i słońce w LOKALNEJ ramce północnej (bez kursu) —
  // globalna oś Y jest przechylona ~38° względem horyzontu na szer. 52°N,
  // co dawało ukośną granicę nieba i błękitną poświatę
  frameAt(plane.lat, plane.lon, plane.height, 0, 0, 0, skyFrameMatrix).decompose(skyFramePos, skyQuat, skyFrameScale);
  sky.mesh.position.copy(camPos);
  sky.mesh.quaternion.copy(skyQuat);
  sky.uniforms.uTime.value = clock.elapsedTime;
  const launchAltitude = rocketLaunch || earthReentry ? Math.max(0, plane.height - groundAlt) : 0;
  const atmosphereFade = Math.max(0, Math.min(1, (launchAltitude - 1500) / 82000));
  const skySpaceBlend = atmosphereFade * atmosphereFade * (3 - 2 * atmosphereFade);
  sky.uniforms.uSpaceBlend.value = skySpaceBlend;
  if (scene.fog === earthFog && scene.background?.isColor) {
    scene.background.copy(EARTH_CLEAR_COLOR).lerp(UPPER_ATMOSPHERE_COLOR, skySpaceBlend);
    earthFog.color.copy(EARTH_FOG_COLOR).lerp(UPPER_ATMOSPHERE_COLOR, skySpaceBlend);
    earthFog.density = 0.00007 * (1 - skySpaceBlend * 0.9);
    renderer.setClearColor(scene.background);
  }

  offset.copy(SUN_DIR).applyQuaternion(skyQuat);
  sun.position.copy(offset).multiplyScalar(700).add(planePos);
  sun.target.position.copy(planePos);
  sun.target.updateMatrixWorld();

  // poszerzenie FOV przy nitrie — efekt prędkości
  const targetFov = selectedPlane === "parachutist" && plane.state === "grounded" ? 64 : plane.speed > plane.cruise * 1.2 ? 78 : 70;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 3 * dt);
    camera.updateProjectionMatrix();
  }

  const estimatedAgl = plane.height - groundAlt;
  const surfaceProbeInterval = pendingSnap || awaitingSnap
    ? 100
    : selectedPlane === "parachutist"
      ? plane.state === "grounded" ? 50 : 65
      : estimatedAgl < 500 ? 80 : plane.speed >= 120 ? 600 : 240;
  let groundCollisionConfirmed = false;
  if ((!menuOpen || awaitingSnap) && frameNow - lastSurfaceProbeAt >= surfaceProbeInterval) {
    lastSurfaceProbeAt = frameNow;
    const refH = pendingSnap || awaitingSnap ? Math.max(plane.height, spawnHoldAlt()) : plane.height;
    const gh = probeGround(plane.lat, plane.lon, refH);
    if (gh !== null) {
      groundAlt = gh;
      if (pendingSnap) {
        plane.height = gh + (interstellarArrivalPending ? 4.8 : snapAgl());
        if (!snapFirstAt) snapFirstAt = performance.now();
        if (snapLastGh !== null && Math.abs(gh - snapLastGh) < 25) {
          snapStableCount += 1;
        } else {
          snapStableCount = 0;
        }
        snapLastGh = gh;
        const need = tiles.isLoading ? 4 : 2;
        const waited = performance.now() - snapFirstAt > 1500;
        if (snapStableCount >= need && waited) {
          pendingSnap = false;
          if (interstellarArrivalPending && selectedPlane === "rocket") {
            interstellarArrivalPending = false;
            interstellarArrivalStartedAt = 0;
            plane.height = gh + 4.8;
            plane.speed = 0;
            plane.throttle = 0;
            plane.pitch = Math.PI / 2;
            plane.roll = 0;
            camInit = false;
            showCooperFarmArrival();
          } else if (awaitingSnap) {
            awaitingSnap = false;
            if (mp.active && mp.inRound) reportSnapped();
            else finishSnapStart();
          }
        }
      } else if (selectedPlane === "parachutist") {
        plane.setGroundClearance?.(plane.height - gh);
        if (plane.state === "grounded") {
          groundContact.reset();
          plane.settleOnSurface(gh);
        } else {
          const landingContact = plane.verticalSpeed <= 0 && plane.height <= gh + 0.65;
          if (groundContact.sample(landingContact)) plane.land(gh);
        }
      } else {
        groundCollisionConfirmed = groundContact.sample(plane.height - gh < 4);
      }
    } else {
      groundContact.reset();
    }
  }
  if (interstellarArrivalPending && performance.now() - interstellarArrivalStartedAt >= FARM_SNAP_TIMEOUT_MS && snapLastGh === null) {
    pendingSnap = false;
    interstellarArrivalPending = false;
    interstellarArrivalStartedAt = 0;
    groundAlt = COOPER_FARM.fallbackAltitude;
    plane.height = groundAlt + 4.8;
    plane.speed = 0;
    plane.throttle = 0;
    plane.pitch = Math.PI / 2;
    plane.roll = 0;
    camInit = false;
    showCooperFarmArrival();
  }
  if (awaitingSnap && performance.now() - awaitingSnapSince > 30000 && snapLastGh === null) {
    awaitingSnap = false; pendingSnap = false;
    if (mp.active) { mp.launching = false; hideMpWait(); backToLobby(); }
    else backToMenu();
    showFatal(loadError || 'No terrain found at this location. Check map access or choose another departure.');
    return;
  }
  if (awaitingSnap && performance.now() - awaitingSnapSince > 20000 && snapLastGh !== null) {
    awaitingSnap = false;
    pendingSnap = false;
    if (snapLastGh !== null) plane.height = snapLastGh + snapAgl();
    if (mp.active && mp.inRound) reportSnapped();
    else finishSnapStart();
  }
  const agl = plane.height - groundAlt;
  setTerrainDetail(selectedPlane === "parachutist" && !menuOpen
    ? plane.state === "grounded" ? "street" : agl < 240 ? "landing" : "normal"
    : "normal");
  updateDetailCamera();
  let wingCollisionConfirmed = false;
  const canHitTerrain = selectedPlane !== "parachutist" && !rocketLaunch && !earthReentry && !cooperFarmRocketReady && flying && !pendingSnap;
  if (canHitTerrain && agl < 120 && frameNow - lastWingProbeAt >= 80) {
    lastWingProbeAt = frameNow;
    wingCollisionConfirmed = wingContact.sample(wingHit());
  } else if (!canHitTerrain || agl >= 120) {
    wingContact.reset();
  }
  // Visible terrain must report contact twice. This rejects a single bad LOD
  // sample without weakening a real low-altitude impact.
  if (canHitTerrain && (groundCollisionConfirmed || wingCollisionConfirmed)) {
    crash();
  }

  // aktywne wybuchy
  for (let i = explosions.length - 1; i >= 0; i--) {
    if (!explosions[i].update(dt)) explosions.splice(i, 1);
  }

  // latarnia domu — tylko z bliska, inaczej widać ją z całego lotu
  if (beacon && mode === "home" && homeTarget && !finished && !menuOpen) {
    const dist = distanceM(plane.latDeg, plane.lonDeg, homeTarget.lat, homeTarget.lon);
    const show = dist <= HOME_BEACON_M;
    if (show && (!beaconGrounded || frameCount % 60 === 0)) {
      placeBeaconAt(homeTarget.lat, homeTarget.lon);
    }
    beacon.visible = show;
    if (show) beacon.userData.ring.rotation.z += dt * 0.8;
  } else if (beacon) {
    beacon.visible = false;
  }

  // tryby: timer + warunki wygranej
  if (timerActive && !menuOpen && !paused && !guessOpen && !finished && (!crashed || mp.active)) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      timerActive = false;
      if (mode === "home") {
        finished = true;
        showBanner("TIME'S UP");
      } else if (mode === "guess") {
        openGuessMap();
      }
    }
  }
  if (mode === "home" && homeTarget && flying) {
    const dist = distanceM(plane.latDeg, plane.lonDeg, homeTarget.lat, homeTarget.lon);
    if (dist < HOME_CAPTURE_M) {
      finished = true;
      timerActive = false;
      beacon.visible = false;
      showBanner("YOU MADE IT HOME!");
    }
  }

  // HUD
  if (frameCount % 2 === 0) updateHud(agl);
  if (frameCount % 4 === 0) syncTouchUi();

  if (menuOpen) {
    tiles.group.visible = false;
    if (planeMesh) planeMesh.visible = false;
    if (awaitingSnap) {
      tiles.setResolutionFromRenderer(camera, renderer);
      tiles.setCamera(camera);
      camera.updateMatrixWorld();
      tiles.update();
    }
  } else {
    tiles.group.visible = true;
    if (planeMesh && !crashed) planeMesh.visible = true;
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.setCamera(camera);
    camera.updateMatrixWorld();
    tiles.update();
  }

  renderer.render(scene, camera);
  if (frameCount % 30 === 0) {
    const canvas = renderer.domElement;
    flightStatus.hidden = menuOpen;
    const detailProgress = Math.round((tiles.loadProgress || 0) * 100);
    const detailLabel = terrainDetailMode === 'street' && tiles.isLoading
      ? ` · Sharpening current view ${detailProgress}%…`
      : terrainDetailMode === 'street' ? ' · Ground detail ready' : tiles.isLoading ? ' · Streaming terrain…' : '';
    const launchLabel = rocketLaunch
      ? ` · Vertical launch ${Math.round(plane.height / 1000)} km / 100 km`
      : earthReentry ? ` · Earth reentry ${Math.round(Math.max(0, agl) / 1000)} km` : '';
    flightStatus.textContent = loadError || QUALITY[settings.quality].label + ' · ' + canvas.width + ' × ' + canvas.height + ' · ' + Math.round(1 / Math.max(rawDt,0.001)) + ' FPS' + launchLabel + detailLabel;
    refreshMapCredits();
  }

  const mateDbg = [];
  for (const [id, mate] of mp.mates) {
    mateDbg.push({
      id,
      visible: !!mate.mesh?.visible,
      dist: mate.mesh ? Math.round(mate.mesh.position.distanceTo(planePos)) : -1,
      hasPose: mp.poses.has(id),
      samples: mp.poses.get(id)?.samples?.length || 0,
    });
  }
  window.__dbg = {
    frame: frameCount,
    children: tiles.group.children.length,
    speed: plane.speed,
    height: plane.height,
    groundAlt,
    agl,
    pendingSnap,
    lat: plane.latDeg,
    lon: plane.lonDeg,
    mode,
    selectedPlane,
    planeMeshKey: planeMesh?.userData?.key || "",
    rocketPlume: planeMesh?.userData?.rocketPlume ? {
      visible: planeMesh.userData.rocketPlume.visible,
      space: !!planeMesh.userData.rocketPlume.userData.space,
      color: `#${planeMesh.userData.rocketPlume.userData.outerMaterial.color.getHexString()}`,
    } : null,
    interstellarArrivalPending,
    cooperFarmRocketReady,
    timeLeft,
    ctxLost: !!window.__ctxLost,
    loading: tiles.isLoading,
    visibleTiles: tiles.visibleTiles?.size ?? -1,
    explosions: explosions.length,
    crashed,
    audio: engineDebug(),
    music: musicDebug(),
    camDist: camera.position.distanceTo(planePos),
    camOffset,
    mpActive: mp.active,
    inRound: mp.inRound,
    menuOpen,
    poses: mp.poses.size,
    mates: mateDbg,
    movementState: plane.state || "airborne",
    firstPerson: firstPersonActive,
    terrainDetailMode,
    terrainLoadProgress: tiles.loadProgress,
    terrainCacheBytes: tiles.lruCache.cachedBytes,
    terrainCacheLimitBytes: tiles.lruCache.maxBytesSize,
    memorySafeMode,
    detailCameraRegistered,
    terrainErrorTarget: tiles.errorTarget,
    terrainMaxTilesProcessed: tiles.maxTilesProcessed,
    terrainParseJobs: tiles.parseQueue.maxJobs,
    terrainFastFlight: !!terrainStreamingProfile?.fastFlight,
    mapCreditsRenderCount,
    measuredFps: adaptiveQuality.lastFps,
    terrainCacheFull: tiles.lruCache.isFull(),
    rocketLaunch: !!rocketLaunch,
    rocketLaunchVelocity: rocketLaunch?.velocity ?? 0,
    rocketLaunchCameraPhase: launchCameraPhase,
    rocketLaunchCameraLocal: rocketLaunch ? cameraLocalOffset.toArray() : null,
    parachutistCameraClimb: ctrl.cameraClimb,
    skySpaceBlend: sky?.uniforms?.uSpaceBlend?.value ?? 0,
    toneMappingExposure: renderer?.toneMappingExposure ?? 0,
    earthReentry: !!earthReentry,
    spaceMode: false,
  };
  window.__cam = camera;
  window.__planeMesh = planeMesh;
}

window.__forceTestMate = () => {
  mp.active = true;
  menuOpen = false;
  paused = true;
  el.menu.classList.add("hidden");
  el.landing.classList.add("hidden");
  el.lobby.classList.add("hidden");
  hideMpWait();
  const R = 6378137;
  const aheadM = 35;
  const eastM = 10;
  const lat = plane.latDeg + (aheadM / R) * (180 / Math.PI);
  const lon = plane.lonDeg + (eastM / (R * Math.cos(plane.lat))) * (180 / Math.PI);
  seedMatePose("test-mate", lat, lon, plane.height, selectedPlane);
  mp.goAt = performance.now();
};

window.__testRocketLaunch = (height = 99980, testVelocity = 1200) => {
  if (!navigator.webdriver) return false;
  const rocketIndex = PLANE_ORDER.indexOf("rocket");
  selectMode("free");
  selectPlane(rocketIndex, 0, true);
  if (planeMesh?.userData?.key !== "rocket") loadPlane("rocket");
  resetFlight(startLat, startLon);
  menuOpen = false;
  paused = false;
  guessOpen = false;
  mp.active = false;
  pendingSnap = false;
  awaitingSnap = false;
  crashed = false;
  finished = false;
  el.menu.classList.add("hidden");
  el.landing.classList.add("hidden");
  el.lobby.classList.add("hidden");
  plane.height = Number.isFinite(height) ? height : 99980;
  startRocketLaunch();
  if (rocketLaunch && Number.isFinite(testVelocity)) rocketLaunch.velocity = testVelocity;
  return !!rocketLaunch;
};

window.__testGroundedParachutist = () => {
  if (!navigator.webdriver) return false;
  const parachutistIndex = PLANE_ORDER.indexOf("parachutist");
  selectMode("free");
  selectPlane(parachutistIndex, 0, true);
  if (planeMesh?.userData?.key !== "parachutist") loadPlane("parachutist");
  resetFlight(startLat, startLon);
  menuOpen = false;
  paused = false;
  guessOpen = false;
  mp.active = false;
  pendingSnap = false;
  awaitingSnap = false;
  crashed = false;
  finished = false;
  groundAlt = 0;
  plane.land(groundAlt);
  el.menu.classList.add("hidden");
  el.landing.classList.add("hidden");
  return plane.state === "grounded";
};

window.__testFighterFlight = (speed = 150, height = 1400) => {
  if (!navigator.webdriver) return false;
  const fighterIndex = PLANE_ORDER.indexOf("jet");
  selectMode("free");
  selectPlane(fighterIndex, 0, true);
  if (planeMesh?.userData?.key !== "jet") loadPlane("jet");
  resetFlight(startLat, startLon);
  menuOpen = false;
  paused = false;
  guessOpen = false;
  mp.active = false;
  pendingSnap = false;
  awaitingSnap = false;
  crashed = false;
  finished = false;
  groundAlt = 0;
  plane.height = Number.isFinite(height) ? height : 1400;
  plane.speed = Number.isFinite(speed) ? speed : 150;
  el.menu.classList.add("hidden");
  el.landing.classList.add("hidden");
  return selectedPlane === "jet";
};

window.__testSpaceApproach = (name, surfaceDistance = 1, speed = 28, entry = false) => {
  if (!navigator.webdriver || !spaceModeActive) return false;
  const body = spaceFlight.bodies.get(name);
  if (!body) return false;
  spaceFlight.position.copy(body.position).add(new Vector3(body.radius + surfaceDistance, 0, 0));
  spaceFlight.forward.set(-1, 0, 0);
  spaceFlight.speed = speed;
  spaceFlight.autopilot = false;
  spaceFlight.orbitBody = null;
  spaceFlight.surfaceBody = null;
  spaceFlight.hyperdrive = false;
  spaceFlight.targetName = name;
  spaceEntryBody = entry ? name : null;
  spaceLandedBody = null;
  crashed = false;
  return true;
};

window.__testDropBlackHoleFinishTimer = () => {
  if (!navigator.webdriver || !blackHoleSequence || !blackHoleTimer) return false;
  clearTimeout(blackHoleTimer);
  blackHoleTimer = null;
  return true;
};

function updateHud(agl) {
  if (spaceModeActive) {
    movementStatus.hidden = false;
    movementStatus.textContent = spaceEnvironmentMessage || (performance.now() < spaceNoticeUntil
      ? spaceNotice
      : "SPACEFLIGHT · W/S pitch · A/D yaw · Shift hyperdrive · Ctrl precision · R orbit · E descend · 1–9 planets · 0 galactic core");
    streetViewLink.hidden = true;
    return;
  }
  if (cooperFarmRocketReady) {
    movementStatus.hidden = false;
    movementStatus.textContent = "COOPER FARM · reference view above · R vertical launch to Earth orbit · then 0 returns to the Galactic Core";
    streetViewLink.hidden = true;
    return;
  }
  // skala prędkościomierza pod najszybszy pojazd (nitro), zaokrąglona w górę
  const maxKmh = selectedPlane === "parachutist" ? 60 : Math.ceil((PLANES[selectedPlane].boost * 3.6) / 200) * 200;
  if (el.gSpeed) drawAirspeed(el.gSpeed, plane.kmh, maxKmh);
  if (el.gAlt) drawAltimeter(el.gAlt, Math.max(0, agl));
  if (el.gHdg) drawCompass(el.gHdg, plane.headingDeg);
  if (selectedPlane === "parachutist" && !menuOpen) {
    movementStatus.hidden = false;
    movementStatus.textContent = plane.state === "grounded"
      ? "ON FOOT · W/S walk · A/D turn · zoom in for first-person · Street View below · Space gentle takeoff · R rocket launch"
      : plane.state === "launching"
        ? `${plane.launchMode === "rocket" ? "ROCKET LAUNCH" : "GENTLE TAKEOFF"} · steer with A/D · S cancels climb and descends`
        : "CANOPY · A/D steer · S descend + slow · hold W for a gentle climb · zoom in for first-person";
  } else if (selectedPlane === "rocket" && !menuOpen) {
    movementStatus.hidden = false;
    movementStatus.textContent = earthReentry
      ? `EARTH REENTRY · ${Math.round(Math.max(0, plane.height - groundAlt) / 1000)} km · manual flight below 6 km`
      : performance.now() < spaceNoticeUntil
      ? spaceNotice
      : rocketLaunch
      ? `VERTICAL LAUNCH · ${Math.round(plane.height / 1000)} km / 100 km · automatic orbital insertion`
      : "ROCKET · Press R for vertical launch to orbit · Shift boosts atmospheric flight";
  } else {
    movementStatus.hidden = true;
  }
  const showStreetView = selectedPlane === "parachutist" && !menuOpen && plane.state === "grounded";
  streetViewLink.hidden = !showStreetView;

  if (timerActive || mode !== "free") {
    const tsec = Math.max(0, Math.ceil(timeLeft));
    const mm = Math.floor(tsec / 60);
    const ss = String(tsec % 60).padStart(2, "0");
    el.timer.textContent = `${mm}:${ss}`;
    el.timer.classList.toggle("low", tsec <= 30 && timerActive);
  }
  if (mode === "home" && homeTarget) {
    const dist = distanceM(plane.latDeg, plane.lonDeg, homeTarget.lat, homeTarget.lon);
    el.dist.textContent = `${(dist / 1000).toFixed(1)} km`;
  }
}

function showBanner(title, sub = "") {
  if (!el.banner) return;
  el.banner.querySelector(".b-title").textContent = title;
  const subEl = el.banner.querySelector(".b-sub");
  subEl.textContent = sub;
  subEl.style.display = sub ? "" : "none";
  el.banner.classList.add("show");
}

function hideBanner() {
  if (el.banner) el.banner.classList.remove("show");
}
