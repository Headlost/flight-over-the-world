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

test('online launcher has no credential form; quality persists', async ({page}) => {
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Single player',exact:true})).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#quality option')).toHaveCount(2);
  await expect(page.locator('#quality option[value=balanced]')).toHaveCount(0);
  await page.locator('#quality').selectOption('ultra');
  await page.locator('#adaptive').uncheck();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await openPicker(page);
  await page.locator('#pin-query').fill('48.8584, 2.2945');
  await page.locator('#pin-search button').click();
  await page.getByRole('button',{name:'Use this location'}).click();
  await expect(page.locator('#city-input')).toHaveValue('48.858400, 2.294500');
  await page.reload();
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#quality')).toHaveValue('ultra');
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

test('invalid coordinates show an actionable error', async ({page}) => {
  await page.goto('/'); await openPicker(page);
  await page.locator('#pin-query').fill('999, 2');
  await page.locator('#pin-search button').click();
  await expect(page.locator('#pin-status')).toContainText('Coordinates');
  await expect(page.locator('#pin-use')).toBeDisabled();
});

test('renderer switches to 4K and survives resize', async ({page}) => {
  test.setTimeout(60000);
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:1280,height:720});
  await page.addInitScript(() => localStorage.setItem('fotw-settings',JSON.stringify({quality:'performance',adaptive:false})));
  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__dbg?.frame || 0)).toBeGreaterThan(2);
  await page.locator('#settings-toggle').click();
  await page.locator('#quality').selectOption('ultra');
  await expect.poll(() => page.locator('#game-canvas').evaluate(canvas => [canvas.width,canvas.height])).toEqual([3840,2160]);
  await page.setViewportSize({width:900,height:900});
  await expect.poll(() => page.locator('#game-canvas').evaluate(canvas => Math.abs(canvas.width * canvas.height - 3840*2160))).toBeLessThan(6000);
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
