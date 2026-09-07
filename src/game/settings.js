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
  quality: QUALITY[saved.quality] ? saved.quality : (matchMedia('(pointer: coarse)').matches ? 'performance' : 'balanced'),
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
    <p>Ready to fly online. Choose the picture quality that suits your device.</p>
    <label>Rendering quality<select id="quality">${Object.entries(QUALITY).map(([k,q]) => `<option value="${k}">${q.label}</option>`).join('')}</select></label>
    <label class="check"><input id="adaptive" type="checkbox"> Adapt resolution to keep flight smooth</label>
    <p class="settings-note">Ultra targets 3840 × 2160 at 16:9. Adaptive mode may lower resolution. Terrain detail depends on coverage, connection and GPU memory.</p>
    <button value="close">Done</button>
  </form>`;
  document.body.append(dialog);
  const q = dialog.querySelector('#quality'); q.value = settings.quality;
  const a = dialog.querySelector('#adaptive'); a.checked = settings.adaptive;
  const change = () => {
    settings.quality = q.value; settings.adaptive = a.checked;
    try { localStorage.setItem('fotw-settings', JSON.stringify({ quality: q.value, adaptive: a.checked })); } catch { /* optional */ }
    onQualityChange();
  };
  q.addEventListener('change', change); a.addEventListener('change', change);
  const button = document.createElement('button');
  button.id = 'settings-toggle'; button.type = 'button'; button.textContent = '⚙ Settings';
  const open = () => { onOpen(); if (!dialog.open) dialog.showModal(); };
  button.addEventListener('click', open); document.body.append(button);
  return { open };
}
