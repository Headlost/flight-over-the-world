import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:5179', viewport:{width:1440,height:1000}, launchOptions:{args:['--use-angle=swiftshader']} },
  webServer: {
    command:'npm run dev -- --port 5179 --strictPort --open false',
    url:'http://127.0.0.1:5179',
    reuseExistingServer:false,
    // Keep fixture tests independent of the developer's real map credentials.
    env:{ VITE_CESIUM_ION_KEY:'test-only', VITE_GEOCODING_URL:'https://photon.komoot.io/api/' },
  },
});
