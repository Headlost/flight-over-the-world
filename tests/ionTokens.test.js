import test from 'node:test';
import assert from 'node:assert/strict';
import { IonTokenRotation, ionTokenList } from '../src/game/ionTokens.js';
import { RotatingCesiumIonAuthPlugin } from '../src/game/rotatingIonAuth.js';
import { TerrainRenderer } from '../src/game/terrainRenderer.js';

function setup(t, responses) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(new URL(url).searchParams.get('access_token'));
    const status = responses.shift() ?? 200;
    return new Response(JSON.stringify({type:'3DTILES',url:'https://terrain.example/root.json',accessToken:'fixture-bearer'}), {status});
  });
  const rotation = new IonTokenRotation(ionTokenList('active', 'replacement,last,main'));
  const createPlugin = () => {
    const plugin = new RotatingCesiumIonAuthPlugin({tokenRotation:rotation,assetId:2275207,autoRefreshToken:true,useRecommendedSettings:false});
    plugin.init(new TerrainRenderer());
    return plugin;
  };
  return {requests, rotation, createPlugin};
}

test('token configuration ignores blanks and duplicate credentials', () => {
  assert.deepEqual(ionTokenList(' active ', 'active, , replacement,last,'), ['active','replacement','last']);
  assert.deepEqual(ionTokenList('active,replacement,last,main'), ['active','replacement','last','main']);
  assert.deepEqual(ionTokenList(), []);
});

test('ion rotation shares concurrent refreshes, recovers a rejected credential and keeps the replacement for the next flight', async t => {
  const {requests,rotation,createPlugin} = setup(t, [401,200,200]);
  const plugin = createPlugin();
  const first = plugin.auth.refreshToken();
  assert.equal(plugin.auth.refreshToken(), first);
  const result = await first;
  assert.equal(result.type, '3DTILES');
  assert.deepEqual(requests, ['active','replacement']);
  assert.equal(plugin.apiToken, 'replacement');
  assert.equal(plugin.auth._bearerToken, 'Bearer fixture-bearer');
  assert.equal(rotation.currentToken, 'replacement');
  await createPlugin().auth.refreshToken();
  assert.deepEqual(requests, ['active','replacement','replacement']);
});

test('ion rotation includes the main token at the end and stops without cycling', async t => {
  const {requests,rotation,createPlugin} = setup(t, [401,401,401,401]);
  await assert.rejects(createPlugin().auth.refreshToken(), /error code 401/);
  assert.deepEqual(requests, ['active','replacement','last','main']);
  assert.equal(rotation.currentToken, 'main');
});

for (const status of [402,403,404,429,500,503]) {
  test(`ion ${status} does not rotate credentials and permits a later retry on the same account`, async t => {
    const {requests,rotation,createPlugin} = setup(t, [status,200]);
    const plugin = createPlugin();
    await assert.rejects(plugin.auth.refreshToken(), new RegExp(`error code ${status}`));
    assert.equal(rotation.currentToken, 'active');
    await plugin.auth.refreshToken();
    assert.deepEqual(requests, ['active','active']);
  });
}

test('network errors keep the current credential and do not expose it in errors', async t => {
  const rotation = new IonTokenRotation(['active','replacement']);
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  const plugin = new RotatingCesiumIonAuthPlugin({tokenRotation:rotation,assetId:2275207});
  plugin.init(new TerrainRenderer());
  await assert.rejects(plugin.auth.refreshToken(), /Failed to fetch/);
  assert.equal(rotation.currentToken, 'active');
});
