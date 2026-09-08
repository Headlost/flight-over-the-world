import { QUALITY } from './quality.js';

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem('fotw-settings') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}
const saved = readSettings();
// Map access is supplied by the deployment, never by players.
export const settings = {
  quality: QUALITY[saved.quality] ? saved.quality : 'performance',
  adaptive: saved.adaptive !== false,
  ion: import.meta.env.VITE_CESIUM_ION_KEY || '',
};
try { sessionStorage.removeItem('fotw-keys'); } catch { /* old setup is no longer used */ }

export function setupSettings(onQualityChange, onOpen) {
  const dialog = document.createElement('dialog');
  dialog.className = 'flight-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<form method="dialog">
    <div class="dialog-heading"><h2 id="settings-title">Flight settings</h2><button value="close" aria-label="Close settings">×</button></div>
    <p>Ready to fly online. Rendering uses one high-detail profile and prioritizes the area around you after landing.</p>
    <p class="settings-note"><strong>${QUALITY.performance.label}</strong> · up to 2560 × 1440, with extra terrain detail near the ground.</p>
    <label class="check"><input id="adaptive" type="checkbox"> Adapt resolution to keep flight smooth</label>
    <p class="settings-note" id="quality-warning">Adaptive resolution protects frame rate while nearby map tiles continue loading at high detail.</p>
    <button value="close">Done</button>
  </form>`;
  document.body.append(dialog);
  const a = dialog.querySelector('#adaptive'); a.checked = settings.adaptive;
  const change = () => {
    settings.quality = 'performance'; settings.adaptive = a.checked;
    try { localStorage.setItem('fotw-settings', JSON.stringify({ quality: 'performance', adaptive: a.checked })); } catch { /* optional */ }
    onQualityChange();
  };
  a.addEventListener('change', change);
  const button = document.createElement('button');
  button.id = 'settings-toggle'; button.type = 'button'; button.textContent = '⚙ Settings';
  const open = () => { onOpen(); if (!dialog.open) dialog.showModal(); };
  button.addEventListener('click', open); document.body.append(button);
  return { open };
}
