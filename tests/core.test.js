import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaneController } from '../src/game/plane.js';
import { parseCoordinates, geocodeCity } from '../src/game/location.js';
import { validMessage, escapeHtml } from '../src/game/protocol.js';
import { renderRatio, AdaptiveQuality } from '../src/game/quality.js';
import { disposeModel } from '../src/game/dispose.js';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Texture } from 'three';

test('coordinates bypass network and geographic bounds are validated', async () => {
  assert.deepEqual(await geocodeCity(' -33.86, 151.21 '), {lat:-33.86,lon:151.21});
  assert.deepEqual(parseCoordinates('90, -180'), {lat:90,lon:-180});
  assert.equal(parseCoordinates('Paris'), null);
  await assert.rejects(geocodeCity('91, 0'), /Coordinates/);
  assert.throws(() => parseCoordinates('0, 181'));
});
test('Ultra targets 4K at 16:9 and respects hardware limits', () => {
  assert.equal(renderRatio('ultra',1920,1080,1),2);
  assert.equal(renderRatio('ultra',3840,2160,2),1);
  assert.ok(3840 * renderRatio('ultra',3840,2160,2,2048) <= 2048);
  assert.equal(renderRatio('performance',1920,1080,3),1);
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

test('shared model resources are freed exactly once and detached', () => {
  const parent = new Group(), root = new Group(), geometry = new BoxGeometry(), texture = new Texture();
  const material = new MeshBasicMaterial({map:texture});
  let disposed = 0;
  for (const resource of [geometry,texture,material]) resource.addEventListener('dispose', () => disposed++);
  root.add(new Mesh(geometry,material),new Mesh(geometry,material)); parent.add(root);
  disposeModel(root);
  assert.equal(disposed,3); assert.equal(parent.children.length,0);
});
