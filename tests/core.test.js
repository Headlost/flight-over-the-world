import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaneController } from '../src/game/plane.js';
import { createParachutistModel, ParachutistController, updateParachutistModel } from '../src/game/paraglider.js';
import { parseCoordinates, geocodeCity } from '../src/game/location.js';
import { validMessage, escapeHtml } from '../src/game/protocol.js';
import { renderRatio, AdaptiveQuality } from '../src/game/quality.js';
import { disposeModel } from '../src/game/dispose.js';
import { Box3, Group, Mesh, BoxGeometry, MeshBasicMaterial, Texture, Vector3 } from 'three';

test('coordinates bypass network and geographic bounds are validated', async () => {
  assert.deepEqual(await geocodeCity(' -33.86, 151.21 '), {lat:-33.86,lon:151.21});
  assert.deepEqual(parseCoordinates('90, -180'), {lat:90,lon:-180});
  assert.equal(parseCoordinates('Paris'), null);
  await assert.rejects(geocodeCity('91, 0'), /Coordinates/);
  assert.throws(() => parseCoordinates('0, 181'));
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
const pose = {t:'pose',lat:52,lon:16,h:400,heading:0,pitch:0,roll:0,seq:2,at:1200,plane:'pa28'};
test('multiplayer rejects forged host commands, malformed poses and unsafe object keys', () => {
  assert.equal(validMessage(pose,true),true);
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
  assert.equal(escapeHtml('<img src=x>'), '&lt;img src=x&gt;');
});
test('legitimate guest messages pass validation', () => {
  for (const message of [{t:'hello',name:'Pilot',plane:'pa28'},{t:'ready',ready:true},{t:'talk',on:true},{t:'snapped',h:420,gh:120,heading:0,probed:true},{t:'guess',lat:50,lon:10},{t:'rematch'},{t:'done'}]) assert.equal(validMessage(message,true),true, message.t);
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

test('parachutist lands safely, walks at a constant brisk pace and relaunches gently', () => {
  const pilot = new ParachutistController(52, 16, 120, 0);
  for (let i = 0; i < 60; i++) pilot.update(1 / 60, {roll:0.5,pitch:-1,throttle:0});
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
  for (let i = 0; i < 1200; i++) rocket.update(1 / 60, {roll:0,pitch:0,throttle:0});
  assert.equal(rocket.state, 'airborne');
  assert.ok(rocket.height > 170);
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
