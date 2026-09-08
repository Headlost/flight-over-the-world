import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three";

// Distances and radii are deliberately compressed into a playable scale. The
// names, order and appearance remain recognisable while a trip takes seconds,
// rather than months or years.
export const SPACE_BODIES = Object.freeze([
  { name: "Sun",     radius: 330, position: [0, 0, 0],          kind: "sun",     color: "#ffbd45" },
  { name: "Mercury", radius: 24,  position: [812, 18, 251],     kind: "rock",    color: "#aaa49a" },
  { name: "Venus",   radius: 51,  position: [-1162, -30, 871],  kind: "venus",   color: "#d6a55f" },
  { name: "Earth",   radius: 60,  position: [2500, 0, 0],       kind: "earth",   color: "#246fc2" },
  { name: "Moon",    radius: 17,  position: [2840, 34, -82],    kind: "moon",    color: "#aaa9a4", parent: "Earth" },
  { name: "Mars",    radius: 42,  position: [2754, 54, 2320],   kind: "mars",    color: "#b74d2c" },
  { name: "Jupiter", radius: 142, position: [5880, -76, -1192], kind: "jupiter", color: "#d0a77c" },
  { name: "Saturn",  radius: 119, position: [7387, 92, 3567],   kind: "saturn",  color: "#d8bd7b", rings: true },
  { name: "Uranus",  radius: 78,  position: [9671, -140, -4089],kind: "ice",     color: "#75d9df", rings: true },
  { name: "Neptune", radius: 76,  position: [12593, 130, 2291], kind: "ice",     color: "#2e65d2" },
]);

const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);
const scratchQ = new Quaternion();
const scratchV = new Vector3();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class SpaceFlightController {
  constructor(bodies = SPACE_BODIES) {
    this.bodies = new Map(bodies.map((body) => [body.name, {
      ...body,
      position: new Vector3(...body.position),
    }]));
    this.position = new Vector3();
    this.forward = new Vector3(0, 0, -1);
    this.speed = 0;
    this.cruiseSpeed = 92;
    this.precisionSpeed = 28;
    this.hyperSpeed = 1450;
    this.targetName = "Moon";
    this.autopilot = false;
    this.orbitBody = null;
    this.orbitRadius = 0;
    this.orbitAngle = 0;
    this.hyperdrive = false;
  }

  reset() {
    this.position.set(0, 0, 0);
    this.forward.set(0, 0, -1);
    this.speed = 0;
    this.targetName = "Moon";
    this.autopilot = false;
    this.orbitBody = null;
    this.orbitRadius = 0;
    this.orbitAngle = 0;
    this.hyperdrive = false;
  }

  enterOrbit(name = "Earth", clearance = 34) {
    const body = this.bodies.get(name);
    if (!body) return false;
    this.orbitBody = name;
    this.orbitRadius = body.radius + Math.max(8, clearance);
    this.orbitAngle = 0;
    this.position.copy(body.position).add(new Vector3(this.orbitRadius, 0, 0));
    this.forward.set(0, 0, -1);
    this.speed = Math.max(46, this.orbitRadius * 0.42);
    this.autopilot = false;
    return true;
  }

  setTarget(name, engageCourse = true) {
    if (!this.bodies.has(name) || name === "Sun") return false;
    this.targetName = name;
    this.autopilot = engageCourse;
    this.orbitBody = null;
    if (engageCourse) {
      this.forward.copy(this.bodies.get(name).position).sub(this.position);
      if (this.forward.lengthSq() < 1e-5) this.forward.set(0, 0, -1);
      else this.forward.normalize();
    }
    return true;
  }

  targetDistance() {
    const body = this.bodies.get(this.targetName);
    return body ? Math.max(0, this.position.distanceTo(body.position) - body.radius) : Infinity;
  }

  nearestBody() {
    let nearest = null;
    let distance = Infinity;
    for (const body of this.bodies.values()) {
      const surfaceDistance = Math.max(0, this.position.distanceTo(body.position) - body.radius);
      if (surfaceDistance < distance) {
        nearest = body;
        distance = surfaceDistance;
      }
    }
    return nearest ? { body: nearest, distance } : null;
  }

  toggleNearestOrbit(maxSurfaceDistance = 260) {
    if (this.orbitBody) {
      this.orbitBody = null;
      return false;
    }
    const nearest = this.nearestBody();
    if (!nearest || nearest.distance > maxSurfaceDistance) return false;
    const radial = scratchV.copy(this.position).sub(nearest.body.position);
    if (radial.lengthSq() < 1e-5) radial.set(1, 0, 0);
    this.orbitRadius = Math.max(nearest.body.radius + 15, radial.length());
    radial.y = 0;
    if (radial.lengthSq() < 1e-5) radial.set(this.orbitRadius, 0, 0);
    this.orbitAngle = Math.atan2(-radial.z, radial.x);
    this.orbitBody = nearest.body.name;
    this.autopilot = false;
    return true;
  }

  update(dt, controls = { roll: 0, pitch: 0, throttle: 0 }) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    const manual = Math.abs(controls.roll || 0) + Math.abs(controls.pitch || 0) > 0.08;
    this.hyperdrive = controls.throttle > 0;
    if (manual || this.hyperdrive) {
      this.orbitBody = null;
      if (manual) this.autopilot = false;
    }

    if (this.orbitBody) {
      const body = this.bodies.get(this.orbitBody);
      if (body) {
        const angularSpeed = clamp(25 / this.orbitRadius, 0.055, 0.28);
        this.orbitAngle += angularSpeed * dt;
        this.position.set(
          body.position.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          body.position.y,
          body.position.z - Math.sin(this.orbitAngle) * this.orbitRadius,
        );
        this.forward.set(-Math.sin(this.orbitAngle), 0, -Math.cos(this.orbitAngle)).normalize();
        this.speed = angularSpeed * this.orbitRadius;
        return;
      }
      this.orbitBody = null;
    }

    if (this.autopilot) {
      const target = this.bodies.get(this.targetName);
      if (target) {
        const desired = scratchV.copy(target.position).sub(this.position).normalize();
        this.forward.lerp(desired, 1 - Math.exp(-2.3 * dt)).normalize();
      }
    }

    if (manual) {
      scratchQ.setFromAxisAngle(UP, -(controls.roll || 0) * 1.28 * dt);
      this.forward.applyQuaternion(scratchQ);
      const right = scratchV.crossVectors(this.forward, UP);
      if (right.lengthSq() < 1e-5) right.copy(RIGHT);
      else right.normalize();
      scratchQ.setFromAxisAngle(right, -(controls.pitch || 0) * 1.05 * dt);
      this.forward.applyQuaternion(scratchQ).normalize();
      this.forward.y = clamp(this.forward.y, -0.985, 0.985);
      this.forward.normalize();
    }

    const targetSpeed = this.hyperdrive
      ? this.hyperSpeed
      : controls.throttle < 0 ? this.precisionSpeed : this.cruiseSpeed;
    const response = this.hyperdrive ? 2.8 : 1.7;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-response * dt));
    let travel = this.speed * dt;
    let captureDistance = 0;
    if (this.autopilot) {
      const target = this.bodies.get(this.targetName);
      if (target) {
        const surfaceDistance = Math.max(0, this.position.distanceTo(target.position) - target.radius);
        captureDistance = Math.max(24, target.radius * 0.38);
        if (surfaceDistance <= captureDistance + travel) {
          travel = Math.max(0, surfaceDistance - captureDistance * 0.75);
        }
      }
    }
    this.position.addScaledVector(this.forward, travel);
    if (this.autopilot && this.targetDistance() <= captureDistance) {
      this.toggleNearestOrbit(captureDistance + 2);
    }
  }
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function planetTexture(body, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.max(256, size / 2);
  const ctx = canvas.getContext("2d", { alpha: false });
  const random = seededRandom(body.name.split("").reduce((n, c) => n + c.charCodeAt(0), 0) * 7919);
  const h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  const palettes = {
    earth: ["#163b79", "#267bc2", "#184a89"],
    moon: ["#6f716f", "#bbb9af", "#777872"],
    rock: ["#665f57", "#b8aea0", "#756d64"],
    venus: ["#85592f", "#dfb86e", "#96643a"],
    mars: ["#642514", "#c55d31", "#7c2f1b"],
    jupiter: ["#765442", "#e1c2a0", "#8f6650"],
    saturn: ["#8f7952", "#e1cb91", "#9b8258"],
    ice: [body.name === "Neptune" ? "#183d9b" : "#3f959f", body.color, body.name === "Neptune" ? "#214fb1" : "#75c8cc"],
  };
  const colors = palettes[body.kind] || [body.color, body.color, body.color];
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.5, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, h);

  if (["jupiter", "saturn", "venus", "ice"].includes(body.kind)) {
    for (let y = 0; y < h; y += Math.max(3, Math.floor(h / 34))) {
      const alpha = 0.05 + random() * 0.18;
      ctx.fillStyle = random() > 0.5 ? `rgba(255,245,210,${alpha})` : `rgba(70,35,25,${alpha})`;
      ctx.fillRect(0, y + random() * 5, canvas.width, 2 + random() * 8);
    }
    if (body.kind === "jupiter") {
      ctx.fillStyle = "rgba(150,52,35,.72)";
      ctx.beginPath();
      ctx.ellipse(canvas.width * 0.69, h * 0.62, canvas.width * 0.075, h * 0.045, -0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const marks = body.kind === "earth" ? 115 : 210;
    for (let i = 0; i < marks; i++) {
      const x = random() * canvas.width;
      const y = random() * h;
      const rx = (4 + random() * 38) * (body.kind === "earth" ? 2.4 : 1);
      const ry = 3 + random() * 18;
      if (body.kind === "earth") {
        ctx.fillStyle = random() > 0.48 ? `rgba(69,125,58,${0.35 + random() * 0.5})` : `rgba(150,117,63,${0.25 + random() * 0.45})`;
      } else {
        ctx.fillStyle = random() > 0.5 ? `rgba(30,15,10,${0.08 + random() * 0.32})` : `rgba(255,220,180,${0.04 + random() * 0.2})`;
      }
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function orbitLine(body) {
  if (body.parent || body.name === "Sun") return null;
  const radius = Math.hypot(body.position[0], body.position[2]);
  const points = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    points.push(new Vector3(Math.cos(a) * radius, body.position[1], Math.sin(a) * radius));
  }
  return new Line(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({ color: 0x31506f, transparent: true, opacity: 0.32 }),
  );
}

export function createSolarSystem({ textureSize = 1024, starCount = 6500 } = {}) {
  const group = new Group();
  group.name = "playable-solar-system";
  group.visible = false;
  const bodies = new Map();
  const random = seededRandom(20260908);
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const radius = 9000 + random() * 19000;
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radial = Math.sqrt(1 - z * z);
    starPositions[i * 3] = Math.cos(angle) * radial * radius + 4500;
    starPositions[i * 3 + 1] = z * radius;
    starPositions[i * 3 + 2] = Math.sin(angle) * radial * radius;
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute("position", new Float32BufferAttribute(starPositions, 3));
  const stars = new Points(starGeometry, new PointsMaterial({
    color: 0xe7f1ff,
    size: 5.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  }));
  stars.name = "stars";
  group.add(stars, new AmbientLight(0x37516f, 0.3));

  const solarLight = new PointLight(0xffe0aa, 5.2, 30000, 0.25);
  solarLight.position.set(0, 0, 0);
  group.add(solarLight);

  for (const body of SPACE_BODIES) {
    const line = orbitLine(body);
    if (line) group.add(line);
    const segments = body.radius >= 100 ? 96 : body.radius >= 50 ? 72 : 56;
    const geometry = new SphereGeometry(body.radius, segments, Math.max(32, segments / 2));
    const material = body.kind === "sun"
      ? new MeshBasicMaterial({ color: body.color })
      : new MeshPhongMaterial({ map: planetTexture(body, textureSize), shininess: body.kind === "earth" ? 32 : 4 });
    const mesh = new Mesh(geometry, material);
    mesh.name = body.name;
    mesh.position.set(...body.position);
    mesh.rotation.z = body.name === "Uranus" ? Math.PI * 0.46 : (random() - 0.5) * 0.35;
    mesh.userData.body = body;
    bodies.set(body.name, mesh);
    group.add(mesh);

    if (body.kind === "sun") {
      const glow = new Mesh(
        new SphereGeometry(body.radius * 1.2, 64, 32),
        new MeshBasicMaterial({ color: 0xff9c29, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false }),
      );
      glow.position.copy(mesh.position);
      group.add(glow);
    }
    if (body.kind === "earth") {
      const clouds = new Mesh(
        new SphereGeometry(body.radius * 1.012, 72, 36),
        new MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, shininess: 20, depthWrite: false }),
      );
      clouds.name = "Earth clouds";
      clouds.position.copy(mesh.position);
      mesh.userData.clouds = clouds;
      group.add(clouds);
    }
    if (body.rings) {
      const ring = new Mesh(
        new RingGeometry(body.radius * 1.28, body.radius * (body.name === "Saturn" ? 2.15 : 1.72), 128),
        new MeshBasicMaterial({ color: body.name === "Saturn" ? 0xd9c28c : 0x89b9b7, side: DoubleSide, transparent: true, opacity: body.name === "Saturn" ? 0.74 : 0.35, depthWrite: false }),
      );
      ring.position.copy(mesh.position);
      ring.rotation.x = Math.PI / 2 + mesh.rotation.z;
      group.add(ring);
    }
  }

  const targetMarker = new Mesh(
    new TorusGeometry(1, 0.055, 10, 96),
    new MeshBasicMaterial({ color: 0x6fe7ff, transparent: true, opacity: 0.9, depthTest: false }),
  );
  targetMarker.renderOrder = 20;
  group.add(targetMarker);

  function update(dt, targetName, elapsed = 0) {
    for (const [name, mesh] of bodies) {
      mesh.rotation.y += dt * (name === "Jupiter" ? 0.12 : name === "Earth" ? 0.075 : 0.035);
      if (mesh.userData.clouds) mesh.userData.clouds.rotation.y -= dt * 0.025;
    }
    const target = bodies.get(targetName);
    targetMarker.visible = !!target;
    if (target) {
      const radius = target.userData.body.radius * (1.3 + Math.sin(elapsed * 2.4) * 0.035);
      targetMarker.position.copy(target.position);
      targetMarker.scale.setScalar(radius);
      targetMarker.rotation.y = elapsed * 0.32;
    }
  }

  return { group, bodies, stars, targetMarker, update };
}
