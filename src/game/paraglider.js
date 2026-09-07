import {
  AnimationMixer,
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";

const R_EARTH = 6378137;
const WALK_SPEED = 1.65;
const RUN_SPEED = 4.8;

function createCanopy() {
  const group = new Group();
  group.name = "parachute-canopy";
  const points = [];
  const indices = [];
  const span = 9.2;
  const chord = 2.8;
  const arch = 2.45;
  const segX = 28;
  const segZ = 10;

  for (let iz = 0; iz <= segZ; iz++) {
    const tz = iz / segZ;
    for (let ix = 0; ix <= segX; ix++) {
      const tx = ix / segX;
      const x = (tx - 0.5) * span;
      const edge = Math.sin(tx * Math.PI);
      const z = (tz - 0.5) * chord * (0.86 + edge * 0.14);
      const y = arch * edge - 0.16 * Math.sin(tz * Math.PI);
      points.push(x, y, z);
    }
  }
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = a + segX + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const canopy = new Mesh(geometry, new MeshStandardMaterial({
    color: 0xf04b23,
    roughness: 0.58,
    metalness: 0,
    side: 2,
  }));
  canopy.position.y = 6.2;
  canopy.castShadow = true;
  group.add(canopy);

  const linePoints = [];
  for (let i = 0; i <= 10; i++) {
    const tx = i / 10;
    const x = (tx - 0.5) * span;
    const y = 6.2 + arch * Math.sin(tx * Math.PI);
    for (const z of [-chord * 0.42, chord * 0.42]) {
      linePoints.push(x, y, z, x * 0.09, 1.25, z * 0.06);
    }
  }
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute("position", new Float32BufferAttribute(linePoints, 3));
  group.add(new LineSegments(lineGeometry, new LineBasicMaterial({
    color: 0xe8edf2,
    transparent: true,
    opacity: 0.72,
  })));
  return group;
}

export function createParachutistModel(gltf) {
  const root = new Group();
  const character = gltf.scene;
  character.rotation.y = Math.PI;
  const sourceBox = new Box3().setFromObject(character);
  const sourceSize = sourceBox.getSize(new Vector3());
  character.scale.setScalar(1.78 / Math.max(0.01, sourceSize.y));
  const box = new Box3().setFromObject(character);
  const center = box.getCenter(new Vector3());
  character.position.set(-center.x, -box.min.y, -center.z);
  character.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const canopy = createCanopy();
  root.add(character, canopy);
  const mixer = new AnimationMixer(character);
  const actions = new Map();
  for (const clip of gltf.animations || []) actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));
  root.userData.parachutist = { mixer, actions, active: null, canopy };
  root.userData.key = "parachutist";
  setParachutistState(root, "airborne", 0, true);
  return root;
}

export function setParachutistState(root, state, speed = 0, immediate = false) {
  const rig = root?.userData?.parachutist;
  if (!rig) return;
  const onGround = state === "grounded";
  rig.canopy.visible = !onGround;
  const wanted = onGround
    ? speed > 3 ? "run" : speed > 0.15 ? "walk" : "idle"
    : "idle";
  if (rig.active === wanted) return;
  const next = rig.actions.get(wanted);
  if (!next) return;
  if (rig.active) {
    const previous = rig.actions.get(rig.active);
    if (immediate) previous?.stop();
    else previous?.fadeOut(0.18);
  }
  next.reset().play();
  if (immediate) next.setEffectiveWeight(1);
  else next.fadeIn(0.18);
  rig.active = wanted;
}

export function updateParachutistModel(root, state, speed, dt) {
  const rig = root?.userData?.parachutist;
  if (!rig) return;
  setParachutistState(root, state, speed);
  const action = rig.actions.get(rig.active);
  if (action) action.timeScale = rig.active === "walk" ? MathUtils.clamp(speed / WALK_SPEED, 0.65, 1.8) : rig.active === "run" ? MathUtils.clamp(speed / RUN_SPEED, 0.7, 1.5) : 0.65;
  rig.mixer.update(Math.min(0.05, Math.max(0, dt)));
}

function advance(controller, distance) {
  const arc = distance / R_EARTH;
  const oldLat = controller.lat;
  const nextLat = Math.asin(MathUtils.clamp(
    Math.sin(oldLat) * Math.cos(arc) + Math.cos(oldLat) * Math.sin(arc) * Math.cos(controller.heading),
    -1,
    1,
  ));
  const dLon = Math.atan2(
    Math.sin(controller.heading) * Math.sin(arc) * Math.cos(oldLat),
    Math.cos(arc) - Math.sin(oldLat) * Math.sin(nextLat),
  );
  controller.lat = nextLat;
  controller.lon = MathUtils.euclideanModulo(controller.lon + dLon + Math.PI, Math.PI * 2) - Math.PI;
}

export class ParachutistController {
  constructor(latDeg, lonDeg, height, headingDeg = 0) {
    this.lat = latDeg * MathUtils.DEG2RAD;
    this.lon = lonDeg * MathUtils.DEG2RAD;
    this.height = height;
    this.heading = headingDeg * MathUtils.DEG2RAD;
    this.pitch = -0.08;
    this.roll = 0;
    this.cruise = 10.5;
    this.boost = 15.3;
    this.brake = 6.7;
    this.speed = this.cruise;
    this.throttle = 0.5;
    this.verticalSpeed = -1.35;
    this.state = "airborne";
    this.groundHeight = null;
    this.launchTarget = null;
    this.previousGroundPose = null;
    this.crashed = false;
  }

  update(dt, ctrl) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    if (this.state === "grounded") {
      this.previousGroundPose = { lat: this.lat, lon: this.lon, height: this.height };
      this.heading = MathUtils.euclideanModulo(this.heading + ctrl.roll * 1.9 * dt, Math.PI * 2);
      const direction = MathUtils.clamp(-ctrl.pitch, -1, 1);
      const pace = ctrl.throttle > 0 ? RUN_SPEED : WALK_SPEED;
      const target = direction * pace;
      this.speed += (target - this.speed) * (1 - Math.exp(-12 * dt));
      if (Math.abs(direction) < 0.02) this.speed *= Math.exp(-14 * dt);
      advance(this, this.speed * dt);
      this.pitch = 0;
      this.roll = 0;
      this.verticalSpeed = 0;
      return;
    }

    if (this.state === "launching") {
      this.heading = MathUtils.euclideanModulo(this.heading + ctrl.roll * 0.65 * dt, Math.PI * 2);
      this.speed += (8.5 - this.speed) * (1 - Math.exp(-2.5 * dt));
      this.verticalSpeed += (7 - this.verticalSpeed) * (1 - Math.exp(-2 * dt));
      this.height += this.verticalSpeed * dt;
      advance(this, this.speed * dt);
      this.pitch = 0.28;
      this.roll += (-ctrl.roll * 0.3 - this.roll) * (1 - Math.exp(-4 * dt));
      if (this.launchTarget != null && this.height >= this.launchTarget) {
        this.state = "airborne";
        this.verticalSpeed = -1.2;
        this.pitch = -0.08;
      }
      return;
    }

    const speedInput = ctrl.throttle !== 0 ? ctrl.throttle : -ctrl.pitch;
    const targetSpeed = speedInput > 0.05 ? this.cruise + (this.boost - this.cruise) * speedInput
      : speedInput < -0.05 ? this.cruise + (this.cruise - this.brake) * speedInput
      : this.cruise;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-2.4 * dt));
    this.speed = MathUtils.clamp(this.speed, this.brake, this.boost);
    const targetRoll = -ctrl.roll * 0.68;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-3.8 * dt));
    this.heading = MathUtils.euclideanModulo(this.heading - Math.tan(this.roll) * 0.58 * dt, Math.PI * 2);
    const fast = Math.max(0, (this.speed - this.cruise) / (this.boost - this.cruise));
    const flare = Math.max(0, (this.cruise - this.speed) / (this.cruise - this.brake));
    const targetSink = -(1.2 + fast * fast * 2.25 - flare * 0.18 + Math.abs(this.roll) * 0.35);
    this.verticalSpeed += (targetSink - this.verticalSpeed) * (1 - Math.exp(-2.5 * dt));
    this.height += this.verticalSpeed * dt;
    this.pitch += (Math.atan2(this.verticalSpeed, this.speed) - this.pitch) * (1 - Math.exp(-3 * dt));
    advance(this, this.speed * dt);
  }

  land(surfaceHeight) {
    if (!Number.isFinite(surfaceHeight)) return;
    this.state = "grounded";
    this.height = surfaceHeight;
    this.groundHeight = surfaceHeight;
    this.launchTarget = null;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.pitch = 0;
    this.roll = 0;
  }

  takeOff(surfaceHeight = this.groundHeight ?? this.height) {
    if (this.state !== "grounded") return false;
    this.state = "launching";
    this.groundHeight = surfaceHeight;
    this.launchTarget = surfaceHeight + 80;
    this.speed = 4;
    this.verticalSpeed = 2.5;
    return true;
  }

  settleOnSurface(surfaceHeight) {
    if (this.state !== "grounded" || !Number.isFinite(surfaceHeight)) return;
    const delta = surfaceHeight - this.height;
    if (delta < -1.5) {
      this.state = "airborne";
      this.verticalSpeed = -0.8;
      this.speed = Math.max(this.speed, this.brake);
      return;
    }
    if (delta > 0.9) {
      if (this.previousGroundPose) {
        this.lat = this.previousGroundPose.lat;
        this.lon = this.previousGroundPose.lon;
      }
      this.speed = 0;
      return;
    }
    this.height = surfaceHeight;
    this.groundHeight = surfaceHeight;
  }

  get latDeg() { return this.lat * MathUtils.RAD2DEG; }
  get lonDeg() { return this.lon * MathUtils.RAD2DEG; }
  get headingDeg() { return MathUtils.euclideanModulo(this.heading * MathUtils.RAD2DEG, 360); }
  get kmh() { return Math.abs(this.speed) * 3.6; }
}
