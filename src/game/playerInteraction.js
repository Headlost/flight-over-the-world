export const PLAYER_STACK_HEIGHT = 1.72;
export const MAX_PLAYER_BUMP = 8;

export function interactionProfile(key, state, wingspan = 10) {
  const span = Number.isFinite(wingspan) ? Math.max(1, wingspan) : 10;
  if (key === "parachutist" && state === "grounded") {
    return { kind: "person", radius: 0.58, halfHeight: 0.9, stackable: true };
  }
  if (key === "parachutist") {
    return { kind: "canopy", radius: 3.6, halfHeight: 3.3, stackable: true };
  }
  return {
    kind: "aircraft",
    radius: Math.max(2.2, span * 0.38),
    halfHeight: Math.max(1.2, span * 0.1),
    stackable: false,
  };
}

export function classifyPlayerContact({
  localKey,
  localState,
  localWingspan,
  remoteKey,
  remoteState,
  remoteWingspan,
  horizontalDistance,
  verticalDelta,
  localMotion = 0,
  remoteMotion = 0,
}) {
  if (![horizontalDistance, verticalDelta, localMotion, remoteMotion].every(Number.isFinite)) return null;
  const local = interactionProfile(localKey, localState, localWingspan);
  const remote = interactionProfile(remoteKey, remoteState, remoteWingspan);
  const horizontal = Math.max(0, horizontalDistance);

  if (local.stackable && remote.kind === "person" && horizontal <= 0.68) {
    const stackError = verticalDelta - PLAYER_STACK_HEIGHT;
    if (stackError >= -0.72 && stackError <= 0.9) {
      return { type: "support", supportOffset: PLAYER_STACK_HEIGHT };
    }
  }

  // Once one walking character is clearly above another, let the upper player
  // stand on the lower one instead of producing a sideways contact every frame.
  if (local.kind === "person" && remote.kind === "person" && Math.abs(verticalDelta) > 0.92) return null;

  const radius = local.radius + remote.radius;
  const verticalLimit = local.halfHeight + remote.halfHeight;
  if (horizontal >= radius || Math.abs(verticalDelta) >= verticalLimit) return null;
  const penetration = radius - horizontal;
  const walking = local.kind === "person" && remote.kind === "person";
  const relativeMotion = Math.abs(localMotion) + Math.abs(remoteMotion);
  const strength = walking
    ? Math.min(3.2, 0.7 + relativeMotion * 0.42 + penetration * 1.1)
    : Math.min(MAX_PLAYER_BUMP, 1.8 + relativeMotion * 0.018 + penetration * 0.32);
  return { type: "push", penetration, strength, walking };
}

export function clampBumpVector(x, y, z, maximum = MAX_PLAYER_BUMP) {
  const values = [x, y, z].map(value => Number.isFinite(value) ? value : 0);
  const limit = Number.isFinite(maximum) ? Math.max(0, maximum) : MAX_PLAYER_BUMP;
  const length = Math.hypot(...values);
  if (!length || length <= limit) return { x: values[0], y: values[1], z: values[2] };
  const scale = limit / length;
  return { x: values[0] * scale, y: values[1] * scale, z: values[2] * scale };
}
