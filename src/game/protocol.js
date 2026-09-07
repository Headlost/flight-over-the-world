const TYPES = new Set(['hello','welcome','roster','scope','mode','city','plane','ready','talk','snapped','go','rematch','start','pose','guess','done','roundEnd']);
const GUEST_TYPES = new Set(['hello','plane','ready','talk','snapped','rematch','pose','guess','done']);
const PLANES = new Set(['pa28','q400','citation','jet','rocket','parachutist']);
const finite = (n, low, high) => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
const location = d => finite(d.lat,-90,90) && finite(d.lon,-180,180);

export function validMessage(data, fromGuest = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !TYPES.has(data.t)) return false;
  if (fromGuest && !GUEST_TYPES.has(data.t)) return false;
  let size = 0;
  function safe(value, depth = 0) {
    if (++size > 500 || depth > 5) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= 500;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value !== 'object') return false;
    return Object.entries(value).every(([key,v]) => !['__proto__','constructor','prototype'].includes(key) && key.length <= 100 && safe(v,depth+1));
  }
  if (!safe(data)) return false;
  if (data.plane != null && !PLANES.has(data.plane)) return false;
  if (data.mode != null && !['free','home','guess'].includes(data.mode)) return false;
  if (data.scope != null && !['pl','eu','world'].includes(data.scope)) return false;
  if (data.name != null && (typeof data.name !== 'string' || data.name.length > 60)) return false;
  if (data.city != null && (typeof data.city !== 'string' || data.city.length > 240)) return false;
  if (['pose','guess','start'].includes(data.t) && !location(data)) return false;
  if (data.t === 'start' && data.mode === 'home' && !location({lat:data.homeLat,lon:data.homeLon})) return false;
  if (['pose','snapped','go'].includes(data.t)) {
    if (!finite(data.h,-12000,1e7) || !finite(data.heading,-1e5,1e5)) return false;
    if (data.t !== 'pose' && !finite(data.gh,-12000,1e7)) return false;
  }
  if (data.t === 'pose' && (!finite(data.pitch,-Math.PI,Math.PI) || !finite(data.roll,-Math.PI,Math.PI) || !finite(data.seq,0,Number.MAX_SAFE_INTEGER) || !finite(data.at,0,Number.MAX_SAFE_INTEGER))) return false;
  if (data.state != null && !['airborne','grounded','launching'].includes(data.state)) return false;
  if (data.motion != null && !finite(data.motion,0,1000)) return false;
  for (const key of ['roster','players']) if (data[key] != null && (!Array.isArray(data[key]) || data[key].length > 16 || !data[key].every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.length <= 60 && PLANES.has(p.plane) && (p.score == null || finite(p.score,0,1e9))))) return false;
  if (data.seats != null && (typeof data.seats !== 'object' || Array.isArray(data.seats) || Object.keys(data.seats).length > 16 || !Object.values(data.seats).every(n => Number.isInteger(n) && n >= 0 && n < 16))) return false;
  return true;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
