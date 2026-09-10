import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";

const R_EARTH = 6378137;
// A brisk, predictable walking pace. Keeping it constant makes precise movement
// on roofs and narrow streets easier than switching between walk and run.
const WALK_SPEED = 2.5;
const GROUND_CLEARANCE = 0.32;
const GENTLE_LAUNCH_HEIGHT = 12;
const ROCKET_LAUNCH_HEIGHT = 80;
const GENTLE_CLIMB_SPEED = 1.7;
const NORMAL_DESCENT_BELOW = 60;
const FAST_DESCENT_ABOVE = 120;

export function parachutistDescentScale(groundClearance) {
  if (!Number.isFinite(groundClearance)) return 1.5;
  const t = MathUtils.clamp(
    (groundClearance - NORMAL_DESCENT_BELOW) / (FAST_DESCENT_ABOVE - NORMAL_DESCENT_BELOW),
    0,
    1,
  );
  const smooth = t * t * (3 - 2 * t);
  return 1 + smooth * 0.5;
}

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

function material(color, roughness = 0.78, metalness = 0.02) {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

function part(geometry, surface, parent, position) {
  const mesh = new Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function limb(parent, x, y, radius, length, surface) {
  const joint = new Group();
  joint.position.set(x, y, 0);
  parent.add(joint);
  part(new CylinderGeometry(radius * 0.82, radius, length, 10), surface, joint, [0, -length / 2, 0]);
  return joint;
}

function createPilot() {
  const pilot = new Group();
  pilot.name = "stable-procedural-pilot";
  const jacket = material(0x52683f, 0.9);
  const trousers = material(0x202b31, 0.92);
  const harness = material(0x161b1f, 0.7);
  const helmet = material(0xd9e1e4, 0.38, 0.12);
  const visor = material(0x172d3b, 0.2, 0.35);
  const gloves = material(0x171b1e, 0.84);
  const boots = material(0x111416, 0.94);

  const body = new Group();
  body.position.y = 0.92;
  pilot.add(body);
  part(new CylinderGeometry(0.26, 0.32, 0.75, 12), jacket, body, [0, 0.34, 0]);
  part(new BoxGeometry(0.48, 0.56, 0.2), harness, body, [0, 0.28, 0.19]);
  part(new BoxGeometry(0.38, 0.42, 0.22), harness, body, [0, 0.27, 0.31]);
  part(new SphereGeometry(0.22, 16, 12), helmet, body, [0, 0.95, 0]);
  const face = part(new SphereGeometry(0.18, 14, 10), visor, body, [0, 0.94, -0.11]);
  face.scale.set(0.88, 0.62, 0.55);

  const arms = [];
  for (const side of [-1, 1]) {
    const upper = limb(body, side * 0.34, 0.65, 0.09, 0.48, jacket);
    upper.rotation.z = -side * 0.12;
    const lower = limb(upper, 0, -0.48, 0.075, 0.43, jacket);
    part(new SphereGeometry(0.095, 10, 8), gloves, lower, [0, -0.45, 0]);
    arms.push({ upper, lower, side });
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const upper = limb(body, side * 0.16, 0, 0.115, 0.56, trousers);
    const lower = limb(upper, 0, -0.55, 0.09, 0.52, trousers);
    const boot = part(new BoxGeometry(0.18, 0.15, 0.35), boots, lower, [0, -0.55, -0.08]);
    legs.push({ upper, lower, boot, side });
  }
  return { pilot, body, arms, legs, phase: 0 };
}

export function createParachutistModel() {
  const root = new Group();
  const canopy = createCanopy();
  const character = createPilot();
  root.add(character.pilot, canopy);
  root.userData.parachutist = { canopy, character, active: "airborne" };
  root.userData.key = "parachutist";
  setParachutistState(root, "airborne", 0, true);
  return root;
}

export function setParachutistState(root, state, speed = 0) {
  const rig = root?.userData?.parachutist;
  if (!rig) return;
  rig.canopy.visible = state !== "grounded";
  rig.active = state === "grounded"
    ? Math.abs(speed) > 0.15 ? "walk" : "idle"
    : "airborne";
}

function approach(current, target, amount) {
  return current + (target - current) * amount;
}

export function updateParachutistModel(root, state, speed, dt) {
  const rig = root?.userData?.parachutist;
  if (!rig) return;
  setParachutistState(root, state, speed);
  const model = rig.character;
  const step = Math.min(1, Math.max(0, dt) * 10);
  const moving = state === "grounded" && Math.abs(speed) > 0.15;
  if (moving) model.phase += Math.min(0.05, dt) * 7.4 * Math.sign(speed || 1);
  const gait = moving ? Math.sin(model.phase) : 0;
  const armStride = 0.72;
  const legStride = 0.28;

  model.body.position.y = approach(model.body.position.y, state === "grounded" ? 0.92 + Math.abs(Math.sin(model.phase * 2)) * (moving ? 0.035 : 0) : 0.82, step);
  model.body.rotation.x = approach(model.body.rotation.x, state === "grounded" ? 0 : -0.14, step);
  for (const arm of model.arms) {
    const groundSwing = gait * armStride * arm.side;
    arm.upper.rotation.x = approach(arm.upper.rotation.x, state === "grounded" ? groundSwing : 0.78, step);
    arm.upper.rotation.z = approach(arm.upper.rotation.z, state === "grounded" ? -arm.side * 0.1 : -arm.side * 0.42, step);
    arm.lower.rotation.x = approach(arm.lower.rotation.x, state === "grounded" ? -Math.max(0, -groundSwing) * 0.35 : -0.58, step);
  }
  for (const leg of model.legs) {
    const legSwing = gait * legStride * leg.side;
    // +X at the hip puts the knees in front of the pilot (forward is -Z).
    // The old signs folded both knees through the back of the body in flight.
    leg.upper.rotation.x = approach(leg.upper.rotation.x, state === "grounded" ? legSwing : 0.72, step);
    leg.lower.rotation.x = approach(leg.lower.rotation.x, state === "grounded" ? -Math.max(0, legSwing) * 0.62 : -1.05, step);
  }
}

export function setParachutistFirstPerson(root, enabled) {
  const rig = root?.userData?.parachutist;
  if (rig?.character?.pilot) rig.character.pilot.visible = !enabled;
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
    this.groundClearance = Infinity;
    this.launchTarget = null;
    this.launchMode = null;
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
      const target = direction * WALK_SPEED;
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
      const rocket = this.launchMode === "rocket";
      const descend = Math.max(0, MathUtils.clamp(ctrl.pitch, -1, 1));
      const climb = Math.max(0, -MathUtils.clamp(ctrl.pitch, -1, 1));
      const cameraClimb = MathUtils.clamp(ctrl.cameraClimb || 0, 0, 1);
      const targetSpeed = rocket ? 8.5 : 6.2;
      // Space gives a low, controllable hop. S can cancel it immediately and
      // hand control back to normal canopy flight for a nearby landing.
      const targetVertical = rocket ? 7 : 2.25 + climb * 0.9 + cameraClimb * 1.35 - descend * 4.2;
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-2.5 * dt));
      this.verticalSpeed += (targetVertical - this.verticalSpeed) * (1 - Math.exp(-(rocket ? 2 : 4) * dt));
      this.height += this.verticalSpeed * dt;
      advance(this, this.speed * dt);
      this.pitch = Math.atan2(this.verticalSpeed, Math.max(0.1, this.speed));
      this.roll += (-ctrl.roll * 0.3 - this.roll) * (1 - Math.exp(-4 * dt));
      if (!rocket && descend > 0.2) {
        this.state = "airborne";
        this.launchMode = null;
        return;
      }
      if (this.launchTarget != null && this.height >= this.launchTarget) {
        this.state = "airborne";
        this.verticalSpeed = -1.2;
        this.pitch = -0.08;
        this.launchMode = null;
      }
      return;
    }

    const pitchInput = MathUtils.clamp(ctrl.pitch, -1, 1);
    const descend = Math.max(0, pitchInput);
    const climb = Math.max(0, -pitchInput);
    const cameraClimb = MathUtils.clamp(ctrl.cameraClimb || 0, 0, 1);
    // Preserve the smooth horizontal speed curve. S brakes while adding sink,
    // and W uses the faster trim response during a gentle powered climb.
    const speedInput = ctrl.throttle !== 0 ? ctrl.throttle : -pitchInput;
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
    const descentScale = parachutistDescentScale(this.groundClearance);
    let targetVertical = -(1.2 + fast * fast * 2.25 - flare * 0.18 + Math.abs(this.roll) * 0.35 + descend * 2.25) * descentScale;
    // W provides a restrained climb for as long as it is held. Releasing it
    // smoothly restores the natural canopy sink instead of launching upward.
    const climbCommand = Math.max(climb, cameraClimb);
    if (climbCommand > 0) {
      const assistedClimbSpeed = GENTLE_CLIMB_SPEED + cameraClimb * 1.1;
      targetVertical += (assistedClimbSpeed - targetVertical) * climbCommand;
    }
    if (this.groundClearance < 6) targetVertical = Math.max(targetVertical, -0.45 - this.groundClearance * 0.12);
    const verticalResponse = descend > 0 ? 3.3 : climbCommand > 0 ? 2.8 : 2.5;
    this.verticalSpeed += (targetVertical - this.verticalSpeed) * (1 - Math.exp(-verticalResponse * dt));
    this.height += this.verticalSpeed * dt;
    this.pitch += (Math.atan2(this.verticalSpeed, this.speed) - this.pitch) * (1 - Math.exp(-3 * dt));
    advance(this, this.speed * dt);
  }

  land(surfaceHeight) {
    if (!Number.isFinite(surfaceHeight)) return;
    this.state = "grounded";
    this.height = surfaceHeight + GROUND_CLEARANCE;
    this.groundHeight = surfaceHeight;
    this.groundClearance = 0;
    this.launchTarget = null;
    this.launchMode = null;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.pitch = 0;
    this.roll = 0;
  }

  takeOff(surfaceHeight = this.groundHeight ?? this.height, mode = "gentle") {
    if (this.state !== "grounded") return false;
    this.state = "launching";
    this.groundHeight = surfaceHeight;
    this.launchMode = mode === "rocket" ? "rocket" : "gentle";
    this.launchTarget = surfaceHeight + (this.launchMode === "rocket" ? ROCKET_LAUNCH_HEIGHT : GENTLE_LAUNCH_HEIGHT);
    this.groundClearance = Infinity;
    this.speed = this.launchMode === "rocket" ? 4 : 3.2;
    this.verticalSpeed = this.launchMode === "rocket" ? 2.5 : 1.2;
    return true;
  }

  settleOnSurface(surfaceHeight) {
    if (this.state !== "grounded" || !Number.isFinite(surfaceHeight)) return;
    const targetHeight = surfaceHeight + GROUND_CLEARANCE;
    const delta = targetHeight - this.height;
    const moving = Math.abs(this.speed) > 0.2;
    if (delta < -1.5 && moving) {
      this.state = "airborne";
      this.verticalSpeed = -0.8;
      this.speed = Math.max(this.speed, this.brake);
      return;
    }
    if (delta > 0.9 && moving) {
      if (this.previousGroundPose) {
        this.lat = this.previousGroundPose.lat;
        this.lon = this.previousGroundPose.lon;
      }
      this.speed = 0;
      return;
    }
    this.height = targetHeight;
    this.groundHeight = surfaceHeight;
  }

  setGroundClearance(clearance) {
    if (Number.isFinite(clearance)) this.groundClearance = Math.max(0, clearance);
  }

  get latDeg() { return this.lat * MathUtils.RAD2DEG; }
  get lonDeg() { return this.lon * MathUtils.RAD2DEG; }
  get headingDeg() { return MathUtils.euclideanModulo(this.heading * MathUtils.RAD2DEG, 360); }
  get kmh() { return Math.abs(this.speed) * 3.6; }
}
