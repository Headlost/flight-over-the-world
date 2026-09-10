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

test.describe('mobile terrain recovery', () => {
  test.use({
    viewport: {width: 393, height: 851},
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    hasTouch: true,
    isMobile: true,
  });

  test('an interrupted start enables a non-blocking memory-safe profile', async ({page}) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('fotw_starting', String(Date.now()));
      sessionStorage.setItem('fotw_lasterr', 'Phone closed the tab while loading terrain — usually out of memory.');
    });
    await page.goto('/');
    await expect(page.locator('#fatal')).toHaveClass(/hidden/);
    await expect(page.locator('#crash-note')).toBeVisible();
    await expect(page.locator('#crash-note')).toContainText('Memory-safe mode is active');
    await expect(page.locator('body')).toHaveClass(/memory-safe/);
    await expect.poll(() => page.evaluate(() => window.__dbg?.memorySafeMode)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__dbg?.terrainCacheLimitBytes)).toBeLessThanOrEqual(96e6);
  });

  test('portrait recommends landscape and landscape exposes complete touch actions', async ({page}) => {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
    expect(await page.evaluate(() => window.__testRocketLaunch())).toBe(true);
    await expect(page.locator('#rotate-hint')).toBeVisible();
    await expect(page.locator('#rotate-hint')).toContainText('Rotate your phone');
    await page.locator('#rotate-dismiss').click();
    await expect(page.locator('#rotate-hint')).toBeHidden();

    await page.setViewportSize({width: 851, height: 393});
    await expect(page.locator('#touch')).toHaveClass(/show/);
    await expect(page.locator('#touch-boost')).toBeVisible();
    await expect(page.locator('#touch-brake')).toBeVisible();
    await expect(page.locator('#touch-camera')).toBeVisible();
    await expect(page.locator('#touch-action')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode)).toBe(true);
    await expect(page.locator('#touch-enter')).toBeVisible();

    const layout = await page.evaluate(() => {
      const stick = document.querySelector('#stick').getBoundingClientRect();
      const buttons = document.querySelector('.touch-btns').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, stick: {...stick.toJSON()}, buttons: {...buttons.toJSON()} };
    });
    expect(layout.stick.right).toBeLessThan(layout.width / 2);
    expect(layout.buttons.left).toBeGreaterThan(layout.width / 2);
    expect(layout.buttons.bottom).toBeLessThanOrEqual(layout.height);

    expect(await page.evaluate(() => window.__testSpaceApproach('Mars', 180, 28))).toBe(true);
    await expect(page.locator('#touch-action')).toBeVisible();
    await expect(page.locator('#touch-action')).toBeEnabled();
    await expect(page.locator('#touch-action')).toHaveText('Enter Mars orbit');
    await expect(page.locator('#touch-action')).toHaveClass(/space-context-ready/);
    await expect(page.locator('#touch-enter')).toBeHidden();
    await expect(page.locator('#space-action-hint')).toBeHidden();

    await page.locator('#touch-action').click();
    await expect.poll(() => page.evaluate(() => window.__dbg?.orbitBody)).toBe('Mars');
    await expect(page.locator('#touch-enter')).toBeVisible();
    await expect(page.locator('#touch-enter')).toBeEnabled();
    await expect(page.locator('#touch-enter')).toHaveText('Enter Mars');
    await expect(page.locator('#touch-enter')).toHaveClass(/space-context-ready/);
    await page.screenshot({path:'test-results/mobile-controls-landscape.png'});
  });
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

test('right-dragging upward helps a landed parachutist climb after Space', async ({page}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testGroundedParachutist())).toBe(true);
  await page.keyboard.press('Space');
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({button:'right'});
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 180, {steps:8});
  await expect.poll(() => page.evaluate(() => window.__dbg?.parachutistCameraClimb)).toBeGreaterThan(0.8);
  const assistedHeight = await page.evaluate(() => window.__dbg.height);
  await expect.poll(() => page.evaluate(() => window.__dbg.height)).toBeGreaterThan(assistedHeight + 1);
  await page.mouse.up({button:'right'});
  await expect.poll(() => page.evaluate(() => window.__dbg?.parachutistCameraClimb)).toBeLessThan(0.1);
});

test('fighter streams terrain in smooth batches without lowering detail', async ({page}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testFighterFlight())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.selectedPlane)).toBe('jet');
  await expect.poll(() => page.evaluate(() => window.__dbg?.terrainFastFlight)).toBe(true);
  expect(await page.evaluate(() => window.__dbg.terrainErrorTarget)).toBe(7);
  expect(await page.evaluate(() => window.__dbg.terrainMaxTilesProcessed)).toBeLessThanOrEqual(84);
  expect(await page.evaluate(() => window.__dbg.terrainParseJobs)).toBeLessThanOrEqual(2);
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

test('Street View return control stays above the panorama layer', async ({page}) => {
  await page.goto('/');
  const layers = await page.evaluate(() => ({
    panorama: Number(getComputedStyle(document.querySelector('#streetview')).zIndex),
    controls: Number(getComputedStyle(document.querySelector('.street-mode-hud')).zIndex),
  }));
  expect(layers.controls).toBeGreaterThan(layers.panorama);
  await expect(page.locator('#street-return')).toContainText('Return to game');
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
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceCameraDistance)).toBeLessThan(22);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketPlume?.visible)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketPlume?.space)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketPlume?.color)).toBe('#147cff');
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
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceCameraOrbit?.zoom)).toBeLessThanOrEqual(0.21);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceCameraDistance)).toBeLessThan(5);
});

test('space flight briefly suggests orbit and planet entry controls', async ({page}) => {
  test.setTimeout(15000);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testRocketLaunch())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode)).toBe(true);

  expect(await page.evaluate(() => window.__testSpaceApproach('Mars', 180, 28))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceActionHint?.key)).toBe('R');
  await expect(page.locator('#space-action-hint')).toBeVisible();
  await expect(page.locator('#space-action-key')).toHaveText('R');
  await expect(page.locator('#space-action-copy')).toContainText('Mars orbit');
  expect(await page.locator('#space-action-key').evaluate((node) => getComputedStyle(node).animationName)).toContain('space-action-pulse');

  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(() => window.__dbg?.orbitBody)).toBe('Mars');
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceActionHint?.key)).toBe('E');
  await expect(page.locator('#space-action-key')).toHaveText('E');
  await expect(page.locator('#space-action-copy')).toContainText('Enter Mars');

  expect(await page.evaluate(() => window.__testSpaceApproach('Sun', 40, 28))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceActionHint)).toBe(null);
  await expect(page.locator('#space-action-hint')).toBeHidden();
});

test('rocket launch moves from a rear camera to an angled atmospheric view', async ({page}) => {
  test.setTimeout(15000);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testRocketLaunch(20000))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunch)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.camDist)).toBeLessThan(13);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunchCameraLocal?.[2])).toBeGreaterThan(9);
  await expect.poll(() => page.evaluate(() => window.__dbg?.skySpaceBlend)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketPlume?.visible)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketPlume?.space)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketPlume?.color)).toBe('#ffa21a');
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunchCameraPhase), {timeout:6000}).toBeGreaterThan(0.98);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunchCameraLocal?.[0])).toBeLessThan(-6.5);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunchCameraLocal?.[1])).toBeGreaterThan(17);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunchCameraLocal?.[2])).toBeLessThan(-9.5);
});

test('rocket launch has the faster ascent profile', async ({page}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__game)).toBe(true);
  expect(await page.evaluate(() => window.__testRocketLaunch(1000, null))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.rocketLaunchVelocity)).toBeGreaterThanOrEqual(225);
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
  const tesseractVideo = await page.request.get('/assets/tesseract.mp4');
  const tesseractPoster = await page.request.get('/assets/tesseract-poster.jpg');
  expect(earthTexture.ok()).toBe(true);
  expect(galaxyTexture.ok()).toBe(true);
  expect(blackHoleScore.ok()).toBe(true);
  expect(tesseractVideo.ok()).toBe(true);
  expect(tesseractPoster.ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceTextures?.loaded), {timeout:10000})
    .toBe(await page.evaluate(() => window.__dbg.spaceTextures.total));
  expect(await page.evaluate(() => window.__dbg.spaceTextures.failed)).toBe(0);

  await page.locator('#space-enter').click();
  await expect.poll(() => page.evaluate(() => window.__dbg?.earthReentry)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.camDist)).toBeLessThan(18);
  await expect.poll(() => page.evaluate(() => window.__dbg?.skySpaceBlend)).toBeGreaterThan(0.9);
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

  expect(await page.evaluate(() => window.__testSpaceApproach('Galactic Core', 10000, 92))).toBe(true);
  await expect(page.locator('body')).not.toHaveClass(/black-hole-gravity/);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.proximity || 0)).toBe(0);
  expect(await page.evaluate(() => window.__testSpaceApproach('Galactic Core', 4000, 92))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.blackHoleGravity?.intensity || 0)).toBeGreaterThan(0.35);
  await expect(page.locator('body')).toHaveClass(/black-hole-gravity/);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.proximity || 0)).toBeGreaterThan(0.4);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.gain ?? 1)).toBeLessThan(0.04);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.gain || 0)).toBeGreaterThan(0.18);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.crossfadeActive)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.time || 0)).toBeGreaterThanOrEqual(45);
  expect(await page.evaluate(() => window.__testSpaceApproach('Galactic Core', -1, 60))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.blackHoleCaptureProgress || 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__dbg?.blackHoleCameraShake || 0)).toBeGreaterThan(0);
  await expect(page.locator('#interstellar')).toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.time || 0)).toBeGreaterThan(200);
  expect(await page.evaluate(() => window.__testDropBlackHoleFinishTimer())).toBe(true);
  await expect(page.locator('#interstellar')).toHaveClass(/silent-void/);
  await expect(page.locator('#transit-status')).toBeHidden();
  await expect(page.locator('#transit-countdown')).toBeHidden();
  await expect(page.locator('#interstellar')).not.toHaveClass(/silent-void/, {timeout:2000});
  await expect(page.locator('#interstellar')).toHaveClass(/countdown-only/);
  await expect(page.locator('#transit-countdown')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__dbg?.music?.blackHole?.gain || 0)).toBeGreaterThan(0.4);
  await expect(page.locator('#transit-countdown span')).toBeHidden();
  await expect(page.locator('#transit-status')).toBeHidden();
  await expect(page.locator('#interstellar')).toHaveClass(/approach-phase/, {timeout:2000});
  await expect(page.locator('#tesseract-video')).toBeVisible();
  expect(await page.locator('#tesseract-video').evaluate(video => getComputedStyle(video).animationName)).toBe('tesseract-video-approach');
  const approachFrame = await page.locator('#tesseract-video').evaluate(video => {
    const rect = video.getBoundingClientRect();
    return {
      centerX: (rect.left + rect.right) / 2,
      centerY: (rect.top + rect.bottom) / 2,
      viewportX: innerWidth / 2,
      viewportY: innerHeight / 2,
    };
  });
  expect(approachFrame.centerX).toBeCloseTo(approachFrame.viewportX, 0);
  expect(approachFrame.centerY).toBeCloseTo(approachFrame.viewportY, 0);
  await page.screenshot({path:'test-results/tesseract-video-approach.png'});
  await expect(page.locator('#interstellar')).toHaveClass(/tesseract-phase/, {timeout:3000});
  await expect(page.locator('#transit-status')).toBeVisible();
  await expect(page.locator('#tesseract-video')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__dbg?.tesseractVideo?.readyState || 0)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => window.__dbg?.tesseractVideo?.paused)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__dbg?.tesseractVideo?.currentTime || 0)).toBeGreaterThan(0);
  const transitFrame = await page.locator('#tesseract-video').evaluate(video => {
    const rect = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    return {left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight, objectFit: style.objectFit, objectPosition: style.objectPosition};
  });
  expect(transitFrame).toMatchObject({left: 0, top: 0, objectFit: 'cover', objectPosition: '50% 50%'});
  expect(transitFrame.width).toBeCloseTo(transitFrame.viewportWidth, 0);
  expect(transitFrame.height).toBeCloseTo(transitFrame.viewportHeight, 0);
  await page.screenshot({path:'test-results/tesseract-video-transit.png'});
  expect(await page.evaluate(() => window.__dbg.tesseractVideo.videoWidth)).toBe(1440);
  expect(await page.evaluate(() => window.__dbg.tesseractVideo.videoHeight)).toBe(1440);
  expect(await page.evaluate(() => window.__dbg.tesseractVideo.muted)).toBe(true);
  expect(await page.evaluate(() => window.__dbg.tesseractVideo.error)).toBe('');
  await expect.poll(() => page.evaluate(() => window.__dbg?.spaceMode), {timeout:7000}).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__dbg?.selectedPlane)).toBe('rocket');
  await expect.poll(() => page.evaluate(() => window.__dbg?.cooperFarmRocketReady), {timeout:7000}).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__dbg?.camDist)).toBeGreaterThan(24);
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
