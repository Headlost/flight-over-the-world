import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaneController } from '../src/game/plane.js';
import {
  createParachutistModel,
  parachutistDescentScale,
  PARACHUTIST_ROLE_COLORS,
  ParachutistController,
  setParachutistRole,
  updateParachutistModel,
} from '../src/game/paraglider.js';
import { parseCoordinates, geocodeCity } from '../src/game/location.js';
import {
  validMessage,
  escapeHtml,
  canModeratePlayer,
  hasRankStartQuorum,
  canEditLobbyProfile,
  canChooseLobbyVehicle,
  normalizePlayerName,
  normalizeChatMessage,
  playerPresence,
  PLAYER_PRESENCE_LABELS,
  supportsMultiplayerRoundConfig,
  MULTIPLAYER_PROTOCOL_VERSION,
  PLAYER_NAME_MAX,
  CHAT_MESSAGE_MAX,
} from '../src/game/protocol.js';
import { multiplayerSpacing, multiplayerSpawnPoint, nearbyPlayerPose } from '../src/game/multiplayerSpawn.js';
import { renderRatio, AdaptiveQuality, terrainStreamProfile } from '../src/game/quality.js';
import { attributionSignature } from '../src/game/attribution.js';
import { disposeModel } from '../src/game/dispose.js';
import { streetViewUrl } from '../src/game/streetview.js';
import { SpaceFlightController } from '../src/game/space.js';
import { ContactConfirmation, parachutistCameraClimbAssist, raycastVisibleTerrain, rocketLaunchCameraPhase, updateChaseOffset } from '../src/game/flightSafety.js';
import { classifyPlayerContact, sweptPlayerContact, clampBumpVector, MAX_PLAYER_BUMP, PLAYER_STACK_HEIGHT } from '../src/game/playerInteraction.js';
import { roomInvitationLink } from '../src/game/sharing.js';
import { Box3, Group, Mesh, BoxGeometry, MeshBasicMaterial, Quaternion, Raycaster, Texture, Vector3 } from 'three';

test('coordinates bypass network and geographic bounds are validated', async () => {
  assert.deepEqual(await geocodeCity(' -33.86, 151.21 '), {lat:-33.86,lon:151.21});
  assert.deepEqual(parseCoordinates('90, -180'), {lat:90,lon:-180});
  assert.equal(parseCoordinates('Paris'), null);
  await assert.rejects(geocodeCity('91, 0'), /Coordinates/);
  assert.throws(() => parseCoordinates('0, 181'));
});
test('Street View uses a keyless Google Maps URL', () => {
  const url = new URL(streetViewUrl(52.38871, 16.60069, -15));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('map_action'), 'pano');
  assert.equal(url.searchParams.get('heading'), '345');
  assert.equal(url.searchParams.has('key'), false);
});
test('adaptive high detail stays within a 1440p and hardware budget', () => {
  assert.ok(Math.abs(renderRatio('performance',1920,1080,3) - 4/3) < 0.001);
  assert.ok(Math.abs(renderRatio('performance',3840,2160,2) - 2/3) < 0.001);
  assert.ok(3840 * renderRatio('performance',3840,2160,2,2048) <= 2048);
  assert.equal(renderRatio('ultra',1920,1080,1),1);
});
test('adaptive rendering recovers and stays bounded', () => {
  const q = new AdaptiveQuality();
  for (let i=0;i<2000;i++) q.sample(1/25);
  assert.equal(q.scale,0.5);
  for (let i=0;i<5000;i++) q.sample(1/60);
  assert.equal(q.scale,1);
  q.sample(Infinity); assert.equal(q.scale,1);
});
test('ground streaming prioritizes the visible view when frame rate is low', () => {
  const stressed = terrainStreamProfile('street', 9, false, false);
  const smooth = terrainStreamProfile('street', 60, false, false);
  assert.equal(stressed.prefetch, false);
  assert.ok(stressed.error > smooth.error);
  assert.ok(stressed.maxTilesProcessed < smooth.maxTilesProcessed);
  assert.equal(terrainStreamProfile('street', 60, false, true).prefetch, false);
  assert.ok(terrainStreamProfile('street', 60, true).cacheBytes <= 300e6);
});

test('fast flight spreads terrain work without reducing the detail target', () => {
  const regular = terrainStreamProfile('normal', 60, false, false, false, false);
  const fast = terrainStreamProfile('normal', 60, false, false, false, true);
  assert.equal(fast.error, regular.error);
  assert.equal(fast.errorFalloff, regular.errorFalloff);
  assert.equal(fast.cacheTiles, regular.cacheTiles);
  assert.equal(fast.cacheBytes, regular.cacheBytes);
  assert.equal(fast.gpuBytes, regular.gpuBytes);
  assert.ok(fast.maxTilesProcessed < regular.maxTilesProcessed);
  assert.equal(fast.maxConcurrentParses, 2);
});

test('map attribution signature is stable until attribution content changes', () => {
  const a = [{type:'string', value:'Google'}, {type:'html', value:'<a href="https://example.com">Provider</a>'}];
  const reordered = [a[1], a[0]];
  assert.equal(attributionSignature(a), attributionSignature(reordered));
  assert.notEqual(attributionSignature(a), attributionSignature([{type:'string', value:'Another provider'}]));
});

test('mobile memory recovery preserves visible detail while limiting load spikes', () => {
  for (const mode of ['normal', 'landing', 'street']) {
    const regular = terrainStreamProfile(mode, 60, true, false, false);
    const recovery = terrainStreamProfile(mode, 60, true, false, true);
    assert.equal(recovery.error, regular.error);
    assert.equal(recovery.errorFalloff, regular.errorFalloff);
    assert.equal(recovery.prefetch, false);
    assert.ok(recovery.cacheBytes < regular.cacheBytes);
    assert.ok(recovery.gpuBytes < regular.gpuBytes);
    assert.ok(recovery.maxTilesProcessed < regular.maxTilesProcessed);
  }
});
const pose = {t:'pose',lat:52,lon:16,h:400,heading:0,pitch:0,roll:0,seq:2,at:1200,plane:'pa28'};
const spacePose = {t:'pose',space:true,x:2500,y:0,z:0,fx:0,fy:0,fz:-1,qx:0,qy:0,qz:0,qw:1,motion:72,seq:3,at:1300,plane:'rocket'};
test('multiplayer rejects forged host commands, malformed poses and unsafe object keys', () => {
  assert.equal(validMessage(pose,true),true);
  assert.equal(validMessage(spacePose,true),true);
  assert.equal(validMessage({...spacePose,qw:2},true),false);
  assert.equal(validMessage({...spacePose,plane:'jet'},true),false);
  assert.equal(validMessage({t:'resume',plane:'rocket',pose:{...spacePose},seats:{host:0}}),true);
  assert.equal(validMessage({t:'resume',plane:'rocket',pose:{...spacePose},seats:{host:0}},true),false);
  assert.equal(validMessage({t:'hello',name:'Pilot',plane:'pa28',resumeKey:'pilot_123456789012'},true),true);
  assert.equal(validMessage({t:'hello',name:'Pilot',plane:'pa28',resumeKey:'short'},true),false);
  assert.equal(validMessage({t:'bye'},true),true);
  assert.equal(validMessage({t:'roster',lockedPlane:'rocket'}),true);
  assert.equal(validMessage({t:'roster',lockedPlane:''}),true);
  assert.equal(validMessage({t:'roster',lockedPlane:'unknown'}),false);
  assert.equal(validMessage({t:'plane',plane:'jet',lockedPlane:''},true),false);
  assert.equal(validMessage({t:'ready',ready:'yes'},true),false);
  assert.equal(validMessage({...pose,plane:'parachutist',state:'grounded',motion:2},true),true);
  assert.equal(validMessage({...pose,state:'teleporting'},true),false);
  for (const field of ['lat','lon','h','heading','pitch','roll','seq','at']) assert.equal(validMessage({...pose,[field]:NaN},true),false);
  assert.equal(validMessage({...pose,lat:91},true),false);
  assert.equal(validMessage({...pose,plane:'constructor'},true),false);
  assert.equal(validMessage({t:'start',mode:'free',lat:52,lon:16,seats:{host:0}},true),false);
  assert.equal(validMessage({t:'start',mode:'free',lat:52,lon:16,seats:{host:0}}),true);
  assert.equal(validMessage(JSON.parse('{"t":"hello","__proto__":{}}')),false);
  assert.equal(validMessage({t:'hello',name:'a'.repeat(501)}),false);
  assert.equal(validMessage({t:'roster',players:[{id:'a',name:'x',plane:'nope'}]}),false);
  assert.equal(validMessage({t:'hello',name:'Pilot',plane:'pa28',role:'admin'},true),false);
  assert.equal(validMessage({t:'roster',players:[{id:'a',name:'x',plane:'pa28',role:'owner'}]}),false);
  assert.equal(validMessage({t:'bump',target:'peer-1',ix:20,iy:0,iz:0},true),false);
  assert.equal(validMessage({t:'bump',target:'x',ix:1,iy:0,iz:0},true),false);
  assert.equal(validMessage({t:'moderate',action:'kick',target:'peer-1'},true),true);
  assert.equal(validMessage({t:'moderate',action:'mute',target:'peer-1',muted:true},true),true);
  assert.equal(validMessage({t:'moderate',action:'approve',target:'peer-1',approved:true},true),true);
  assert.equal(validMessage({t:'moderate',action:'approve',target:'peer-1'},true),false);
  assert.equal(validMessage({t:'moderate',action:'mute',target:'peer-1'},true),false);
  assert.equal(validMessage({t:'muted',muted:true},true),false);
  assert.equal(escapeHtml('<img src=x>'), '&lt;img src=x&gt;');
});
test('ready profiles cannot be edited and only an unready admin can choose a locked vehicle', () => {
  for (const player of [{}, {ready:false,inRound:false}]) {
    assert.equal(canEditLobbyProfile(player),true);
    assert.equal(canChooseLobbyVehicle(player),true);
    assert.equal(canChooseLobbyVehicle(player,'rocket'),false);
    assert.equal(canChooseLobbyVehicle(player,'rocket',true),true);
  }
  for (const player of [{ready:true}, {inRound:true}, {ready:true,inRound:true}]) {
    assert.equal(canEditLobbyProfile(player),false);
    assert.equal(canChooseLobbyVehicle(player),false);
    assert.equal(canChooseLobbyVehicle(player,'rocket',true),false);
  }
});
test('Street View takes priority over AFK and manual pause presence', () => {
  assert.equal(playerPresence(), 'active');
  assert.equal(playerPresence({paused:true}), 'paused');
  assert.equal(playerPresence({away:true}), 'afk');
  assert.equal(playerPresence({paused:true,away:true}), 'afk');
  for (const paused of [true,false]) for (const away of [true,false]) {
    assert.equal(playerPresence({paused,away,streetView:true}), 'street-view');
  }
  assert.equal(PLAYER_PRESENCE_LABELS.active, '');
  assert.equal(PLAYER_PRESENCE_LABELS['street-view'], 'Street View active');
});

test('presence messages and roster statuses are validated without breaking older clients', () => {
  for (const presence of Object.keys(PLAYER_PRESENCE_LABELS)) {
    assert.equal(validMessage({t:'presence',presence},true), true);
    assert.equal(validMessage({t:'hello',name:'Pilot',plane:'pa28',presence},true), true);
    assert.equal(validMessage({t:'roster',players:[{id:'peer-1',name:'Pilot',plane:'pa28',presence}]}), true);
  }
  for (const presence of [null, true, {}, 'unknown', 'constructor']) {
    assert.equal(validMessage({t:'presence',presence},true), false);
  }
  assert.equal(validMessage({t:'presence'},true), false);
  assert.equal(validMessage({t:'hello',name:'Pilot',plane:'pa28',presence:'unknown'},true), false);
  assert.equal(validMessage({t:'roster',players:[{id:'peer-1',name:'Pilot',plane:'pa28',presence:'unknown'}]}), false);
  assert.equal(validMessage({t:'roster',players:[{id:'peer-1',name:'Pilot',plane:'pa28'}]}), true);
});

test('multiplayer session config is host-authoritative and an optional version marker only selects capabilities', () => {
  assert.equal(supportsMultiplayerRoundConfig(MULTIPLAYER_PROTOCOL_VERSION), true);
  assert.equal(supportsMultiplayerRoundConfig(MULTIPLAYER_PROTOCOL_VERSION + 1), true);
  for (const version of [undefined, null, 1, '2']) assert.equal(supportsMultiplayerRoundConfig(version), false);
  assert.equal(validMessage({t:'hello',name:'Public client',plane:'pa28'},true), true);
  assert.equal(validMessage({t:'welcome',id:'guest',roster:[]}), true);
  const start = {t:'start',lat:52,lon:16,mode:'free',protocolVersion:2,
    lockedPlane:'parachutist',vehicles:{host:'parachutist',guest:'parachutist'},spawnSpacing:12};
  assert.equal(validMessage(start), true);
  assert.equal(validMessage({...start,vehicles:{guest:'invalid'}}), false);
  assert.equal(validMessage({...start,vehicles:[]}), false);
  assert.equal(validMessage({...start,spawnSpacing:1000}), false);
  assert.equal(validMessage({t:'hello',protocolVersion:2.5},true), false);
  assert.equal(validMessage({t:'hello',vehicles:{guest:'parachutist'}},true), false);
  assert.equal(validMessage({t:'hello',spawnSpacing:12},true), false);
});

test('round ids are optional for legacy clients and bounded for multiplayer loading controls', () => {
  const messages = [{t:'start',lat:52,lon:16,mode:'free'},
    {t:'snapped',h:6000,gh:5680,heading:0,probed:true},
    {t:'go',h:6000,gh:5680,heading:0}, {t:'done'}, {t:'roundEnd'}];
  for (const message of messages) {
    const guest = ['snapped','done'].includes(message.t);
    assert.equal(validMessage(message,guest),true);
    assert.equal(validMessage({...message,roundId:'flight-123_abc'},guest),true);
    for (const roundId of ['',42,'x'.repeat(81),'../other-flight']) {
      assert.equal(validMessage({...message,roundId},guest),false);
    }
  }
});

test('spawn spacing is fixed by the host and positions stay bounded at poles and date line', () => {
  assert.equal(multiplayerSpacing([1,9]), 12.15);
  assert.equal(multiplayerSpacing([11,32]), 40);
  for (const lat of [-90, 0, 52, 90]) for (const lon of [-180, 16, 180]) {
    const spawn = multiplayerSpawnPoint(lat,lon,1,3,40);
    assert.ok(Number.isFinite(spawn.lat) && spawn.lat >= -90 && spawn.lat <= 90);
    assert.ok(Number.isFinite(spawn.lon) && spawn.lon >= -180 && spawn.lon <= 180);
  }
  assert.deepEqual(multiplayerSpawnPoint(52,16,0,1,40), {lat:52,lon:16});
});

test('late join offsets the current anchor rather than the original round location', () => {
  const anchor = {space:false,lat:48.8584,lon:2.2945,h:160,heading:0,state:'airborne'};
  const joined = nearbyPlayerPose(anchor,2,20);
  assert.ok(Math.abs(joined.lat - anchor.lat) < 0.001);
  assert.ok(Math.abs(joined.lon - anchor.lon) < 0.001);
  assert.notEqual(joined.lat, anchor.lat);
  assert.equal(joined.h, anchor.h);
  assert.notDeepEqual(nearbyPlayerPose(anchor,1,20), joined);
});

test('space late joins have a small offset and do not inherit autopilot or orbital position snapping', () => {
  const anchor = {space:true,x:1000,y:30,z:500,fx:0,fy:0,fz:-1,qx:0,qy:0,qz:0,qw:1,motion:73.6,
    orbitBody:'Mars',surfaceBody:'Mars',autopilot:true,hyperdrive:true};
  const pose = nearbyPlayerPose(anchor,2,40);
  assert.ok(Math.hypot(pose.x-anchor.x,pose.y-anchor.y,pose.z-anchor.z) <= 2.51);
  assert.equal(pose.orbitBody,'');
  assert.equal(pose.autopilot,false);
  assert.equal(pose.hyperdrive,false);
  assert.equal(validMessage({t:'resume',joining:true,plane:'rocket',pose}),true);
});

test('legitimate guest messages pass validation', () => {
  for (const message of [{t:'hello',name:'Pilot',plane:'pa28'},{t:'name',name:'Captain Beniamin'},{t:'chat',text:'Hello lobby'},{t:'ready',ready:true},{t:'talk',on:true},{t:'moderate',action:'kick',target:'peer-1'},{t:'bump',target:'peer-1',ix:2,iy:0,iz:-1},{t:'snapped',h:420,gh:120,heading:0,probed:true},{t:'guess',lat:50,lon:10},{t:'rematch'},{t:'done'}]) assert.equal(validMessage(message,true),true, message.t);
  assert.equal(validMessage({t:'name',name:'x'.repeat(PLAYER_NAME_MAX + 1)},true),false);
  assert.equal(validMessage({t:'chat',text:'x'.repeat(CHAT_MESSAGE_MAX + 1)},true),false);
});

test('lobby moderation permissions follow admin, leader and player roles', () => {
  assert.equal(canModeratePlayer('admin', 'leader'), true);
  assert.equal(canModeratePlayer('admin', 'player'), true);
  assert.equal(canModeratePlayer('leader', 'admin'), false);
  assert.equal(canModeratePlayer('leader', 'leader'), true);
  assert.equal(canModeratePlayer('leader', 'player'), true);
  assert.equal(canModeratePlayer('player', 'player'), false);
  assert.equal(canModeratePlayer('admin', 'player', true), false);
});

test('only admin and leaders form the multiplayer start quorum', () => {
  const admin = {role:'admin',ready:true};
  const leader = {role:'leader',ready:true};
  const idlePlayer = {role:'player',ready:false};
  assert.equal(hasRankStartQuorum([admin, leader, idlePlayer]), true);
  assert.equal(hasRankStartQuorum([admin, {...leader,ready:false}, {...idlePlayer,ready:true}]), false);
  assert.equal(hasRankStartQuorum([leader, idlePlayer]), false);
});

test('multiplayer nicknames are compact and safe to render', () => {
  assert.equal(normalizePlayerName('  Captain\n\tBeniamin  '), 'Captain Beniamin');
  assert.equal(normalizePlayerName('', 'Guest Pilot'), 'Guest Pilot');
  assert.equal(normalizePlayerName('x'.repeat(100)).length, PLAYER_NAME_MAX);
});

test('lobby chat is compact and strips control characters', () => {
  assert.equal(normalizeChatMessage('  Hello\n\tall pilots  '), 'Hello all pilots');
  assert.equal(normalizeChatMessage('x'.repeat(500)).length, CHAT_MESSAGE_MAX);
  assert.equal(normalizeChatMessage('\u0000\t'), '');
});

test('room invitations use the public game from local development', () => {
  const room = 'lns-test-room';
  const publicLink = roomInvitationLink('http://127.0.0.1:5173/?debug=1#old', room);
  assert.equal(publicLink, `https://headlost.github.io/flight-over-the-world/#r=${room}`);
  assert.equal(
    roomInvitationLink('https://example.com/game/?campaign=test#old', room),
    `https://example.com/game/#r=${room}`,
  );
});

test('multiplayer rosters and seat maps have no fixed player-count cap', () => {
  const players = Array.from({length:40}, (_, index) => ({
    id:`player-${index}`,
    name:`Pilot ${index}`,
    plane:'pa28',
    role:index === 0 ? 'admin' : index < 4 ? 'leader' : 'player',
    score:0,
  }));
  const seats = Object.fromEntries(players.map((player, index) => [player.id, index]));
  assert.equal(validMessage({t:'roster',players}), true);
  assert.equal(validMessage({t:'start',mode:'free',lat:52,lon:16,seats}), true);
});

test('multiplayer roles tint the parachutist body gold or red and restore defaults', () => {
  const model = createParachutistModel();
  const surfaces = model.userData.parachutist.character.roleSurfaces;
  const defaults = surfaces.map(entry => entry.color);
  assert.equal(setParachutistRole(model, 'admin'), PARACHUTIST_ROLE_COLORS.admin);
  assert.ok(surfaces.every(entry => entry.surface.color.getHex() === PARACHUTIST_ROLE_COLORS.admin));
  assert.equal(setParachutistRole(model, 'leader'), PARACHUTIST_ROLE_COLORS.leader);
  assert.ok(surfaces.every(entry => entry.surface.color.getHex() === PARACHUTIST_ROLE_COLORS.leader));
  assert.equal(setParachutistRole(model, 'player'), null);
  assert.deepEqual(surfaces.map(entry => entry.surface.color.getHex()), defaults);
  disposeModel(model);
});

test('multiplayer contacts push gently, never exceed the impulse cap and allow player stacks', () => {
  const wingTouch = classifyPlayerContact({
    localKey:'pa28', localState:'airborne', localWingspan:11,
    remoteKey:'pa28', remoteState:'airborne', remoteWingspan:11,
    horizontalDistance:7, verticalDelta:0, localMotion:48, remoteMotion:48,
  });
  assert.equal(wingTouch.type, 'push');
  assert.ok(wingTouch.strength > 0 && wingTouch.strength <= MAX_PLAYER_BUMP);
  assert.equal(classifyPlayerContact({
    localKey:'pa28', localState:'airborne', localWingspan:11,
    remoteKey:'pa28', remoteState:'airborne', remoteWingspan:11,
    horizontalDistance:30, verticalDelta:0,
  }), null);

  const walkingPush = classifyPlayerContact({
    localKey:'parachutist', localState:'grounded', localWingspan:9.2,
    remoteKey:'parachutist', remoteState:'grounded', remoteWingspan:9.2,
    horizontalDistance:0.7, verticalDelta:0, localMotion:2.5, remoteMotion:0,
  });
  assert.deepEqual({type:walkingPush.type, walking:walkingPush.walking}, {type:'push', walking:true});

  const stack = classifyPlayerContact({
    localKey:'parachutist', localState:'airborne', localWingspan:9.2,
    remoteKey:'parachutist', remoteState:'grounded', remoteWingspan:9.2,
    horizontalDistance:0.25, verticalDelta:PLAYER_STACK_HEIGHT,
  });
  assert.deepEqual(stack, {type:'support', supportOffset:PLAYER_STACK_HEIGHT});
  const limited = clampBumpVector(20, 0, 0);
  assert.ok(Math.hypot(limited.x, limited.y, limited.z) <= MAX_PLAYER_BUMP);
});
test('contacts cover every aircraft wing, flying canopies and the suspended character separately', () => {
  for (const [key, span] of [['pa28',11], ['q400',28], ['citation',16], ['jet',10], ['rocket',12]]) {
    const options = {localKey:key,localState:'airborne',localWingspan:span,
      remoteKey:key,remoteState:'airborne',remoteWingspan:span,verticalDelta:0};
    assert.equal(classifyPlayerContact({...options,horizontalDistance:span - 0.1})?.type,'push',key);
    assert.equal(classifyPlayerContact({...options,horizontalDistance:span + 0.1}),null,key);
  }
  const person = {localKey:'parachutist',localState:'airborne',localWingspan:9.2,
    remoteKey:'parachutist',remoteState:'airborne',remoteWingspan:9.2};
  assert.equal(classifyPlayerContact({...person,horizontalDistance:9,verticalDelta:0})?.type,'push');
  assert.equal(classifyPlayerContact({...person,horizontalDistance:0.5,verticalDelta:6.3})?.type,'push');
  assert.equal(classifyPlayerContact({...person,horizontalDistance:4,verticalDelta:3.5}),null);
});

test('a fast crossing produces a bounded bump even with no endpoint overlap', () => {
  const options = {localKey:'jet',localState:'airborne',localWingspan:10,
    remoteKey:'jet',remoteState:'airborne',remoteWingspan:10,localMotion:420,remoteMotion:420};
  const contact = sweptPlayerContact(options,{x:-24,y:0,z:1},{x:24,y:0,z:1});
  assert.equal(contact?.type,'push');
  assert.equal(contact?.swept,true);
  assert.ok(contact.strength <= MAX_PLAYER_BUMP);
  assert.equal(sweptPlayerContact(options,{x:-24,y:30,z:1},{x:24,y:30,z:1}),null);
  assert.equal(sweptPlayerContact(options,{x:24,y:0,z:1},{x:48,y:0,z:1}),null);
  assert.equal(sweptPlayerContact(options,{x:NaN,y:0,z:1},{x:24,y:0,z:1}),null);
});

function simulate(hz, lat=52, lon=16, heading=90, input={roll:0.4,pitch:0.1,throttle:0}) {
  const plane = new PlaneController(lat,lon,500,heading);
  for (let i=0;i<hz*20;i++) plane.update(1/hz,input);
  return plane;
}
test('flight behaves consistently at 30, 60 and 144 FPS', () => {
  const baseline = simulate(60);
  for (const hz of [30,144]) {
    const plane = simulate(hz);
    assert.ok(Math.abs(plane.heading-baseline.heading)<0.01);
    assert.ok(Math.abs(plane.height-baseline.height)<0.5);
    assert.ok(Math.abs(plane.lon-baseline.lon)<0.0001);
  }
});
test('date-line and polar crossings produce finite, bounded coordinates', () => {
  for (const [lat,lon,heading] of [[0,179.999,90],[89.999,0,0],[-89.999,0,180],[90,0,0]]) {
    const plane = simulate(60,lat,lon,heading,{roll:0,pitch:0,throttle:0});
    assert.ok(Number.isFinite(plane.heading));
    assert.ok(Math.abs(plane.latDeg)<=90);
    assert.ok(Math.abs(plane.lonDeg)<=180);
  }
});
test('faster aircraft have wider turns at the same bank', () => {
  const slow = new PlaneController(0,0,1000,90,{cruise:48,boost:65,brake:30});
  const fast = new PlaneController(0,0,1000,90,{cruise:150,boost:300,brake:80});
  for(let i=0;i<600;i++) { slow.update(1/60,{roll:0.5,pitch:0,throttle:0}); fast.update(1/60,{roll:0.5,pitch:0,throttle:0}); }
  assert.ok(slow.heading - Math.PI/2 > fast.heading - Math.PI/2);
});

test('rocket steering profile turns more tightly over Earth', () => {
  const regular = new PlaneController(52, 16, 1000, 0, {cruise:220,boost:600,brake:120});
  const rocket = new PlaneController(52, 16, 1000, 0, {cruise:220,boost:600,brake:120,steering:1.2});
  for (let i = 0; i < 180; i++) {
    regular.update(1 / 60, {roll:0.7,pitch:0,throttle:0});
    rocket.update(1 / 60, {roll:0.7,pitch:0,throttle:0});
  }
  const regularTurn = Math.min(regular.heading, Math.PI * 2 - regular.heading);
  const rocketTurn = Math.min(rocket.heading, Math.PI * 2 - rocket.heading);
  assert.ok(rocketTurn > regularTurn * 1.18);
});

test('fighter doubles its already enhanced turn without exaggerating the visible bank', () => {
  const regular = new PlaneController(52, 16, 1000, 0, {cruise:150,boost:420,brake:80,turnRate:2});
  const fighter = new PlaneController(52, 16, 1000, 0, {cruise:150,boost:420,brake:80,turnRate:4});
  let regularTurn = 0;
  let fighterTurn = 0;
  let regularHeading = regular.heading;
  let fighterHeading = fighter.heading;
  for (let i = 0; i < 120; i++) {
    regular.update(1 / 60, {roll:0.7,pitch:0,throttle:0});
    fighter.update(1 / 60, {roll:0.7,pitch:0,throttle:0});
    regularTurn += Math.atan2(Math.sin(regular.heading - regularHeading), Math.cos(regular.heading - regularHeading));
    fighterTurn += Math.atan2(Math.sin(fighter.heading - fighterHeading), Math.cos(fighter.heading - fighterHeading));
    regularHeading = regular.heading;
    fighterHeading = fighter.heading;
  }
  assert.ok(Math.abs(fighter.roll - regular.roll) < 1e-12);
  assert.ok(Math.abs(fighterTurn / regularTurn - 2) < 1e-6);
});

test('high-speed aircraft can reverse smoothly without a heading rebound', () => {
  for (const spec of [
    {cruise:75,boost:185,brake:45},
    {cruise:92,boost:250,brake:55},
    {cruise:150,boost:420,brake:80},
    {cruise:220,boost:600,brake:120,steering:1.2},
  ]) {
    const craft = new PlaneController(52, 16, 1000, 0, spec);
    let previous = craft.heading;
    let turn = 0;
    for (let i = 0; i < 60 * 40; i++) {
      craft.update(1 / 60, {roll:1,pitch:0,throttle:1});
      const delta = Math.atan2(Math.sin(craft.heading - previous), Math.cos(craft.heading - previous));
      assert.ok(delta >= 0);
      turn += delta;
      previous = craft.heading;
    }
    assert.ok(turn > Math.PI, `expected a U-turn, got ${turn} radians`);
  }
});

test('parachutist lands safely, walks at a constant brisk pace and relaunches gently', () => {
  const pilot = new ParachutistController(52, 16, 120, 0);
  for (let i = 0; i < 60; i++) pilot.update(1 / 60, {roll:0.5,pitch:0,throttle:0});
  assert.equal(pilot.state, 'airborne');
  assert.ok(pilot.height < 120);
  assert.ok(pilot.heading > 0);
  pilot.land(100);
  assert.equal(pilot.state, 'grounded');
  assert.ok(pilot.height > 100 && pilot.height < 100.5);
  const lat = pilot.lat;
  for (let i = 0; i < 120; i++) pilot.update(1 / 60, {roll:0,pitch:-1,throttle:1});
  assert.ok(pilot.lat > lat);
  assert.ok(pilot.kmh > 8.5 && pilot.kmh < 9.5);
  const walkingSpeed = pilot.speed;
  for (let i = 0; i < 120; i++) pilot.update(1 / 60, {roll:0,pitch:-1,throttle:0});
  assert.ok(Math.abs(pilot.speed - walkingSpeed) < 0.01);
  pilot.settleOnSurface(100);
  assert.ok(pilot.height > 100 && pilot.height < 100.5);
  assert.equal(pilot.takeOff(100), true);
  for (let i = 0; i < 180; i++) pilot.update(1 / 60, {roll:0,pitch:0,throttle:0});
  assert.ok(pilot.height > 104 && pilot.height < 113);
});

test('R-style rocket launch climbs high while S can cancel a gentle takeoff', () => {
  const gentle = new ParachutistController(52, 16, 100, 0);
  gentle.land(100);
  assert.equal(gentle.takeOff(100, 'gentle'), true);
  for (let i = 0; i < 60; i++) gentle.update(1 / 60, {roll:0,pitch:1,throttle:0});
  assert.equal(gentle.state, 'airborne');
  assert.ok(gentle.verticalSpeed < 0);

  const rocket = new ParachutistController(52, 16, 100, 0);
  rocket.land(100);
  assert.equal(rocket.takeOff(100, 'rocket'), true);
  let peakHeight = rocket.height;
  for (let i = 0; i < 1200; i++) {
    rocket.update(1 / 60, {roll:0,pitch:0,throttle:0});
    peakHeight = Math.max(peakHeight, rocket.height);
  }
  assert.equal(rocket.state, 'airborne');
  assert.ok(peakHeight > 179);
});

test('parachutist leaves a roof as flight instead of crashing', () => {
  const pilot = new ParachutistController(52, 16, 120, 0);
  pilot.land(120);
  pilot.update(1 / 60, {roll:0,pitch:-1,throttle:0});
  pilot.settleOnSurface(105);
  assert.equal(pilot.state, 'airborne');
  assert.equal(pilot.crashed, false);
});

test('terrain LOD changes keep a stationary parachutist grounded', () => {
  const pilot = new ParachutistController(52, 16, 120, 0);
  pilot.land(120);
  pilot.settleOnSurface(105);
  assert.equal(pilot.state, 'grounded');
  assert.ok(pilot.height > 105 && pilot.height < 105.5);
});

test('S makes the parachutist descend faster while reducing horizontal speed', () => {
  const neutral = new ParachutistController(52, 16, 100, 0);
  const descending = new ParachutistController(52, 16, 100, 0);
  for (let i = 0; i < 180; i++) {
    neutral.update(1 / 60, {roll:0,pitch:0,throttle:0});
    descending.update(1 / 60, {roll:0,pitch:1,throttle:0});
  }
  assert.ok(descending.height < neutral.height - 4);
  assert.ok(descending.speed < neutral.speed);
  descending.setGroundClearance(2);
  const before = descending.verticalSpeed;
  for (let i = 0; i < 60; i++) descending.update(1 / 60, {roll:0,pitch:1,throttle:0});
  assert.ok(descending.verticalSpeed > before);
});

test('parachutist descends 50% faster high up and keeps the original low-altitude rate', () => {
  assert.equal(parachutistDescentScale(60), 1);
  assert.equal(parachutistDescentScale(90), 1.25);
  assert.equal(parachutistDescentScale(120), 1.5);

  const high = new ParachutistController(52, 16, 1000, 0);
  const low = new ParachutistController(52, 16, 1000, 0);
  high.setGroundClearance(400);
  low.setGroundClearance(50);
  for (let i = 0; i < 600; i++) {
    high.update(1 / 60, {roll:0,pitch:1,throttle:0});
    low.update(1 / 60, {roll:0,pitch:1,throttle:0});
  }
  assert.ok(Math.abs(high.verticalSpeed) > Math.abs(low.verticalSpeed) * 1.49);
  assert.ok(Math.abs(high.verticalSpeed) < Math.abs(low.verticalSpeed) * 1.51);
});

test('parachutist reaches a brisk descent quickly and climbs only while W is held', () => {
  const descending = new ParachutistController(52, 16, 100, 0);
  for (let i = 0; i < 60; i++) descending.update(1 / 60, {roll:0,pitch:1,throttle:0});
  assert.ok(descending.verticalSpeed < -3.1);

  const climbing = new ParachutistController(52, 16, 100, 0);
  climbing.land(100);
  assert.equal(climbing.takeOff(100, 'gentle'), true);
  for (let i = 0; i < 60 * 8; i++) climbing.update(1 / 60, {roll:0,pitch:-1,throttle:0});
  assert.equal(climbing.state, 'airborne');
  assert.ok(climbing.height > 115);
  assert.ok(climbing.verticalSpeed > 1.6);
  for (let i = 0; i < 180; i++) climbing.update(1 / 60, {roll:0,pitch:0,throttle:0});
  assert.ok(climbing.verticalSpeed < -1.1);
});

test('right-dragging the camera upward provides a sustained parachutist climb assist', () => {
  assert.equal(parachutistCameraClimbAssist(-0.41, true), 1);
  assert.equal(parachutistCameraClimbAssist(0.14, true), 0);
  assert.equal(parachutistCameraClimbAssist(-0.41, false), 0);

  const assisted = new ParachutistController(52, 16, 100, 0);
  const neutral = new ParachutistController(52, 16, 100, 0);
  for (const pilot of [assisted, neutral]) {
    pilot.land(100);
    assert.equal(pilot.takeOff(100, 'gentle'), true);
  }
  for (let i = 0; i < 60 * 10; i++) {
    assisted.update(1 / 60, {roll:0,pitch:0,throttle:0,cameraClimb:1});
    neutral.update(1 / 60, {roll:0,pitch:0,throttle:0,cameraClimb:0});
  }
  assert.ok(assisted.height > neutral.height + 12);
  assert.ok(assisted.verticalSpeed > 2.6);
});

test('terrain contact needs confirmation and raycasts ignore undrawn geometry', () => {
  const confirmation = new ContactConfirmation(2);
  assert.equal(confirmation.sample(true), false);
  assert.equal(confirmation.sample(false), false);
  assert.equal(confirmation.sample(true), false);
  assert.equal(confirmation.sample(true), true);

  const tiles = {group:new Group()};
  const renderedScene = new Group();
  const hiddenMesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  hiddenMesh.position.z = -3;
  hiddenMesh.visible = false;
  const renderedMesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  renderedMesh.position.z = -10;
  renderedScene.add(hiddenMesh, renderedMesh);
  tiles.group.add(renderedScene);

  const detachedActiveScene = new Group();
  const detachedMesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  detachedMesh.position.z = -5;
  detachedActiveScene.add(detachedMesh);
  detachedActiveScene.parent = tiles.group;
  tiles.group.updateMatrixWorld(true);
  detachedActiveScene.updateMatrixWorld(true);

  const raycaster = new Raycaster(new Vector3(), new Vector3(0, 0, -1), 0, 100);
  const hit = raycastVisibleTerrain(tiles, raycaster);
  assert.equal(hit?.object, renderedMesh);
});

test('chase camera stays locked to a long vehicle turn and caps hitch recovery', () => {
  const localOffset = new Vector3(0, 4, 12);
  const localGoal = localOffset.clone();
  const vehiclePosition = new Vector3(250, -3, 80);
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI * 1.7);

  updateChaseOffset(localOffset, localGoal, 0.5);
  const worldPosition = localOffset.clone().applyQuaternion(rotation).add(vehiclePosition);
  const recoveredLocal = worldPosition.clone().sub(vehiclePosition).applyQuaternion(rotation.clone().invert());
  assert.ok(recoveredLocal.distanceTo(localGoal) < 1e-9);

  const hitchOffset = new Vector3();
  updateChaseOffset(hitchOffset, new Vector3(100, 0, 0), 0.5);
  assert.ok(hitchOffset.x > 30 && hitchOffset.x < 34);
});

test('rocket camera holds behind for 1.2 seconds then eases to the angled view', () => {
  assert.equal(rocketLaunchCameraPhase(0), 0);
  assert.equal(rocketLaunchCameraPhase(1.199), 0);
  assert.ok(Math.abs(rocketLaunchCameraPhase(2) - 0.5) < 1e-9);
  assert.equal(rocketLaunchCameraPhase(2.8), 1);
  assert.equal(rocketLaunchCameraPhase(20), 1);
});

test('procedural parachutist stays finite and bounded through flight and walking animation', () => {
  const model = createParachutistModel();
  for (let i = 0; i < 600; i++) updateParachutistModel(model, 'airborne', 10.5, 1 / 60);
  const legs = model.userData.parachutist.character.legs;
  assert.ok(legs.every(leg => leg.upper.rotation.x > 0 && leg.lower.rotation.x < 0));
  for (let i = 0; i < 600; i++) updateParachutistModel(model, 'grounded', i < 300 ? 1.65 : 4.8, 1 / 60);
  const size = new Box3().setFromObject(model).getSize(new Vector3());
  assert.ok([size.x, size.y, size.z].every(Number.isFinite));
  assert.ok(size.x > 8 && size.x < 11);
  assert.ok(size.y > 1.5 && size.y < 10);
  assert.ok(size.z < 5);
});

test('shared model resources are freed exactly once and detached', () => {
  const parent = new Group(), root = new Group(), geometry = new BoxGeometry(), texture = new Texture();
  const material = new MeshBasicMaterial({map:texture});
  let disposed = 0;
  for (const resource of [geometry,texture,material]) resource.addEventListener('dispose', () => disposed++);
  root.add(new Mesh(geometry,material),new Mesh(geometry,material)); parent.add(root);
  disposeModel(root);
  assert.equal(disposed,3); assert.equal(parent.children.length,0);
});

test('rocket enters a stable visible Earth orbit', () => {
  const flight = new SpaceFlightController();
  assert.equal(flight.cruiseSpeed, 73.6);
  assert.equal(flight.precisionSpeed, 22.4);
  assert.equal(flight.hyperSpeed, 1160);
  assert.equal(flight.enterOrbit('Earth', 36), true);
  const earth = flight.bodies.get('Earth');
  const radius = flight.position.distanceTo(earth.position);
  const start = flight.position.clone();
  for (let i = 0; i < 600; i++) flight.update(1 / 60, {roll:0,pitch:0,throttle:0});
  assert.equal(flight.orbitBody, 'Earth');
  assert.ok(Math.abs(flight.position.distanceTo(earth.position) - radius) < 0.001);
  assert.ok(flight.position.distanceTo(start) > 20);
});

test('destination course and Shift hyperdrive move the rocket toward a planet', () => {
  const flight = new SpaceFlightController();
  flight.enterOrbit('Earth', 36);
  assert.equal(flight.setTarget('Moon', true), true);
  const before = flight.targetDistance();
  for (let i = 0; i < 12; i++) flight.update(1 / 60, {roll:0,pitch:0,throttle:1});
  assert.equal(flight.orbitBody, null);
  assert.equal(flight.autopilot, true);
  assert.ok(flight.speed > flight.cruiseSpeed);
  assert.ok(flight.targetDistance() < before);
  for (let i = 0; i < 600 && flight.orbitBody !== 'Moon'; i++) {
    flight.update(1 / 60, {roll:0,pitch:0,throttle:1});
  }
  assert.equal(flight.orbitBody, 'Moon');
});

test('manual space steering cancels course assist and nearby R orbit assist is reversible', () => {
  const flight = new SpaceFlightController();
  flight.enterOrbit('Earth', 36);
  flight.setTarget('Mars', true);
  flight.update(1 / 30, {roll:1,pitch:-0.5,throttle:0});
  assert.equal(flight.autopilot, false);
  assert.ok(Math.abs(flight.forward.x) > 0.001 || Math.abs(flight.forward.y) > 0.001);
  flight.position.copy(flight.bodies.get('Earth').position).add(new Vector3(90,0,0));
  assert.equal(flight.toggleNearestOrbit(), true);
  assert.equal(flight.orbitBody, 'Earth');
  assert.equal(flight.toggleNearestOrbit(), false);
  assert.equal(flight.orbitBody, null);
});

test('space steering is calmer at cruise and damped further during hyperdrive', () => {
  const cruise = new SpaceFlightController();
  const hyper = new SpaceFlightController();
  for (let i = 0; i < 60; i++) {
    cruise.update(1 / 60, {roll:1,pitch:0,throttle:0});
    hyper.update(1 / 60, {roll:1,pitch:0,throttle:1});
  }
  const cruiseTurn = Math.acos(Math.max(-1, Math.min(1, -cruise.forward.z)));
  const hyperTurn = Math.acos(Math.max(-1, Math.min(1, -hyper.forward.z)));
  assert.ok(cruiseTurn > 0.8 && cruiseTurn < 1);
  assert.ok(hyperTurn < cruiseTurn * 0.55);
});

test('guided planetary entry becomes stable low-altitude surface flight', () => {
  const flight = new SpaceFlightController();
  const mars = flight.bodies.get('Mars');
  flight.position.copy(mars.position).add(new Vector3(mars.radius + 2, 0, 0));
  flight.forward.set(-1, 0, 0);
  assert.equal(flight.enterSurfaceFlight('Mars', 2.4), true);
  assert.equal(flight.surfaceBody, 'Mars');
  const start = flight.position.clone();
  for (let i = 0; i < 360; i++) flight.update(1 / 60, {roll:0.25,pitch:0,throttle:0});
  const altitude = flight.position.distanceTo(mars.position) - mars.radius;
  assert.ok(Number.isFinite(altitude));
  assert.ok(altitude >= 2.39);
  assert.ok(flight.position.distanceTo(start) > 8);
  assert.equal(flight.toggleNearestOrbit(), true);
  assert.equal(flight.surfaceBody, null);
  assert.equal(flight.orbitBody, 'Mars');
});

test('Sun and galactic core are reachable hazards rather than orbital capture targets', () => {
  const flight = new SpaceFlightController();
  flight.enterOrbit('Earth', 36);
  assert.equal(flight.setTarget('Sun', true), true);
  const sunDistance = flight.targetDistance();
  for (let i = 0; i < 30; i++) flight.update(1 / 60, {roll:0,pitch:0,throttle:1});
  assert.ok(flight.targetDistance() < sunDistance);
  flight.position.copy(flight.bodies.get('Sun').position).add(new Vector3(340,0,0));
  assert.equal(flight.toggleNearestOrbit(), false);
  assert.equal(flight.setTarget('Galactic Core', true), true);
  assert.equal(flight.targetName, 'Galactic Core');
});

test('galactic core gravity bends flight and traps a rocket inside the accretion disk', () => {
  const flight = new SpaceFlightController();
  const core = flight.bodies.get('Galactic Core');
  flight.position.copy(core.position).add(new Vector3(560, 0, 0));
  flight.forward.set(1, 0, 0);
  flight.speed = 92;
  flight.hyperdrive = true;
  const outwardBefore = flight.forward.dot(new Vector3(1, 0, 0));
  let state;
  for (let i = 0; i < 30; i++) state = flight.applyGravity('Galactic Core', 1 / 60);
  assert.equal(state.trapped, true);
  assert.ok(state.intensity > 0.9);
  assert.ok(flight.forward.dot(new Vector3(1, 0, 0)) < outwardBefore);
  assert.equal(flight.hyperdrive, false);

  flight.position.copy(core.position).add(new Vector3(core.gravityRange + core.radius + 10, 0, 0));
  state = flight.applyGravity('Galactic Core', 1 / 60);
  assert.equal(state.intensity, 0);
  assert.equal(state.trapped, false);
});
