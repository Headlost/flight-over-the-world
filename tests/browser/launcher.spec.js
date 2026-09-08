import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('https://api.cesium.com/**', route => route.fulfill({status:403,body:'Terrain disabled in fixture tests'}));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kWQAAAAASUVORK5CYII=','base64')}));
});
async function openPicker(page) {
  await page.getByRole('button',{name:'Single player',exact:true}).click();
  await page.locator('#menu [data-mode=free]').click();
  await page.locator('#menu .pick-location').click();
  await expect(page.locator('#pin-status')).toContainText('Click the map');
}

test('online launcher has no credential form; adaptive rendering persists', async ({page}) => {
  test.setTimeout(60000);
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Single player',exact:true})).toBeVisible();
  await expect(page.locator('.landing-sub .anywhere-word')).toHaveText('anywhere');
  await expect(page.locator('#menu .mode-card')).toHaveCount(1);
  await expect(page.locator('#menu [data-mode=free]')).toHaveClass(/selected/);
  await expect(page.locator('#menu .scope-btn')).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#quality')).toHaveCount(0);
  await expect(page.locator('#quality-warning')).toContainText('nearby map tiles');
  await page.locator('#adaptive').uncheck();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await openPicker(page);
  await page.locator('#pin-query').fill('48.8584, 2.2945');
  await page.locator('#pin-search button').click();
  await page.getByRole('button',{name:'Use this location'}).click();
  await expect(page.locator('#city-input')).toHaveValue('48.858400, 2.294500');
  await page.reload();
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#adaptive')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('parachutist is selectable and its animated model is bundled', async ({page}) => {
  const model = await page.request.get('/models/parachutist.glb');
  expect(model.ok()).toBe(true);
  expect((await model.body()).subarray(0, 4).toString()).toBe('glTF');
  await page.goto('/');
  await page.getByRole('button',{name:'Single player',exact:true}).click();
  await page.locator('#car-prev').click();
  await expect(page.locator('#car-name')).toHaveText('Parachutist');
  await expect(page.locator('#car-desc')).toContainText('Land on roofs or streets');
  await expect(page.locator('body')).toHaveClass(/parachutist-selected/);
});

test('rocket launcher advertises orbital controls and exposes every destination', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Single player',exact:true}).click();
  await page.locator('#car-prev').click();
  await page.locator('#car-prev').click();
  await expect(page.locator('#car-name')).toHaveText('Rocket');
  await expect(page.locator('#car-desc')).toContainText('R vertical launch to orbit');
  await expect(page.locator('#space-targets button')).toHaveCount(11);
  await expect(page.locator('#space-nav')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/rocket-selected/);
});

test('rocket crosses into orbit, selects Mars and engages hyperdrive', async ({page}) => {
  test.setTimeout(30000);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testRocketLaunch())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode)).toBe(true);
  await expect(page.locator('#space-nav')).toBeVisible();
  await expect(page.locator('#space-mode-label')).toContainText('Earth orbit');
  await page.locator('#space-targets [data-body=Mars]').click();
  await expect.poll(() => page.evaluate(() => window.__dbg?.target)).toBe('Mars');
  const cruise = await page.evaluate(() => window.__dbg.spaceSpeed);
  await page.keyboard.down('Shift');
  await expect.poll(() => page.evaluate(() => window.__dbg?.hyperdrive)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceSpeed)).toBeGreaterThan(cruise + 100);
  await page.keyboard.up('Shift');
  const cameraBefore = await page.evaluate(() => ({...window.__dbg.spaceCameraOrbit}));
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 30, {steps:6});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceCameraOrbit?.yaw)).not.toBeCloseTo(cameraBefore.yaw, 2);
  await page.mouse.wheel(0, 420);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceCameraOrbit?.zoom)).toBeGreaterThan(cameraBefore.zoom);
});

test('space environments support reentry, planetary surface flight and the black-hole farm return', async ({page}) => {
  test.setTimeout(30000);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testRocketLaunch())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode)).toBe(true);
  const earthTexture = await page.request.get('/textures/space/earth.jpg');
  const galaxyTexture = await page.request.get('/textures/space/milky-way.jpg');
  const blackHoleScore = await page.request.get('/music/no-time-for-caution.mp3');
  expect(earthTexture.ok()).toBe(true);
  expect(galaxyTexture.ok()).toBe(true);
  expect(blackHoleScore.ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceTextures?.loaded), {timeout:10000})
    .toBe(await page.evaluate(() => window.__dbg.spaceTextures.total));
  expect(await page.evaluate(() => window.__dbg.spaceTextures.failed)).toBe(0);

  await page.locator('#space-enter').click();
  await expect.poll(() => page.evaluate(() => window.__dbg?.earthReentry)).toBe(true);
  await expect(page.locator('#space-nav')).toBeHidden();
  await page.evaluate(() => { window.__game.plane.height = window.__dbg.groundAlt + 6001; });
  await expect.poll(() => page.evaluate(() => window.__dbg?.earthReentry)).toBe(false);

  expect(await page.evaluate(() => window.__testRocketLaunch())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode)).toBe(true);
  expect(await page.evaluate(() => window.__testSpaceApproach('Mars', -0.2, 28, true))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceSurfaceBody)).toBe('Mars');
  await expect(page.locator('#space-mode-label')).toContainText('surface flight');
  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(() => window.__dbg?.orbitBody)).toBe('Mars');

  expect(await page.evaluate(() => window.__testSpaceApproach('Galactic Core', 4000, 92))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.blackHoleGravity?.intensity || 0)).toBeGreaterThan(0.35);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.proximity || 0)).toBeGreaterThan(0.4);
  expect(await page.evaluate(() => window.__testSpaceApproach('Galactic Core', -1, 60))).toBe(true);
  await expect(page.locator('#interstellar')).toHaveClass(/show/);
  await expect(page.locator('#transit-status')).toContainText('EVENT HORIZON');
  await expect(page.locator('#transit-countdown strong')).toHaveText(/\d{2}/);
  await expect(page.locator('#interstellar')).toHaveClass(/tesseract-phase/, {timeout:3000});
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode), {timeout:7000}).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__dbg?.selectedPlane)).toBe('rocket');
  await expect.poll(() => page.evaluate(() => window.__dbg?.cooperFarmRocketReady), {timeout:7000}).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.lat)).toBeCloseTo(50.4064167, 5);
  await expect.poll(() => page.evaluate(() => window.__dbg?.lon)).toBeCloseTo(-114.2042778, 5);
  await expect(page.locator('#location-arrival')).toHaveClass(/show/);
  await expect(page.locator('#farm-reference')).toHaveAttribute('href', /google\.com\/maps\/place\/Interstellar\+farm/);
  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunch)).toBe(true);
});

test('space environments warn near the Sun and destroy a direct impact', async ({page}) => {
  test.setTimeout(20000);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testRocketLaunch())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode)).toBe(true);
  expect(await page.evaluate(() => window.__testSpaceApproach('Sun', 40, 28))).toBe(true);
  await expect(page.locator('body')).toHaveClass(/solar-warning/);
  expect(await page.evaluate(() => window.__testSpaceApproach('Sun', -1, 28))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.crashed)).toBe(true);
  await expect(page.locator('#f-banner')).toContainText('STAR INCINERATION');
});

test('invalid coordinates show an actionable error', async ({page}) => {
  await page.goto('/'); await openPicker(page);
  await page.locator('#pin-query').fill('999, 2');
  await page.locator('#pin-search button').click();
  await expect(page.locator('#pin-status')).toContainText('Coordinates');
  await expect(page.locator('#pin-use')).toBeDisabled();
});

test('renderer uses the adaptive 1440p budget and survives resize', async ({page}) => {
  test.setTimeout(60000);
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:1280,height:720});
  await page.addInitScript(() => localStorage.setItem('fotw-settings',JSON.stringify({quality:'performance',adaptive:false})));
  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__dbg?.frame || 0)).toBeGreaterThan(2);
  await expect.poll(() => page.locator('#game-canvas').evaluate(canvas => [canvas.width,canvas.height])).toEqual([1280,720]);
  await page.locator('#settings-toggle').click();
  await page.locator('#adaptive').uncheck();
  await expect.poll(() => page.locator('#game-canvas').evaluate(canvas => [canvas.width,canvas.height])).toEqual([1280,720]);
  await page.setViewportSize({width:900,height:900});
  await expect.poll(() => page.locator('#game-canvas').evaluate(canvas => [canvas.width,canvas.height])).toEqual([900,900]);
  expect(errors).toEqual([]);
});

test('mobile picker fits and places a pin', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/'); await openPicker(page);
  await expect.poll(() => page.locator('.location-dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#departure-map').click({position:{x:150,y:130}});
  await expect(page.locator('#pin-use')).toBeEnabled();
  await page.screenshot({path:'test-results/online-picker-mobile.png'});
});

test('real map click and pin drag update the departure', async ({page}) => {
  await page.goto('/'); await openPicker(page);
  const area = page.locator('#departure-map');
  await area.click({position:{x:400,y:200}});
  const initial = await page.locator('#pin-status').textContent();
  const pin = page.locator('.departure-pin');
  const box = await pin.boundingBox();
  await page.mouse.move(box.x+14,box.y+15); await page.mouse.down();
  await page.mouse.move(box.x+64,box.y+45,{steps:8}); await page.mouse.up();
  await expect(page.locator('#pin-status')).not.toHaveText(initial);
  await page.getByRole('button',{name:'Use this location'}).click();
  await expect(page.locator('#city-input')).toHaveValue(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/);
});

test('place search works without credentials', async ({page}) => {
  await page.route('https://photon.komoot.io/api/**', route=> route.fulfill({json:{features:[{geometry:{coordinates:[21.01,52.23]}}]}}));
  await page.goto('/'); await openPicker(page);
  await page.locator('#pin-query').fill('Warsaw');
  await page.locator('#pin-search button').click();
  await expect(page.locator('#pin-status')).toContainText('52.230000, 21.010000');
  await page.getByRole('button',{name:'Use this location'}).click();
  await expect(page.locator('#city-input')).toHaveValue('52.230000, 21.010000');
});
