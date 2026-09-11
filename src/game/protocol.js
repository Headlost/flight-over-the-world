const TYPES = new Set(['hello','welcome','roster','scope','mode','city','plane','name','chat','ready','talk','moderate','muted','removed','bump','snapped','go','rematch','start','pose','guess','done','roundEnd']);
const GUEST_TYPES = new Set(['hello','plane','name','chat','ready','talk','moderate','bump','snapped','rematch','pose','guess','done']);
const PLANES = new Set(['pa28','q400','citation','jet','rocket','parachutist']);
const PLAYER_ROLES = new Set(['admin','leader','player']);
const finite = (n, low, high) => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
const location = d => finite(d.lat,-90,90) && finite(d.lon,-180,180);
export const PLAYER_NAME_MAX = 24;
export const CHAT_MESSAGE_MAX = 280;

export function normalizePlayerName(value, fallback = 'Pilot') {
  const clean = input => String(input ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAYER_NAME_MAX);
  return clean(value) || clean(fallback) || 'Pilot';
}

export function normalizeChatMessage(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MESSAGE_MAX);
}

export function canModeratePlayer(actorRole, targetRole, isSelf = false) {
  if (isSelf) return false;
  if (actorRole === 'admin') return true;
  return actorRole === 'leader' && targetRole !== 'admin';
}

export function hasRankStartQuorum(players = []) {
  const required = players.filter(player => player?.role === 'admin' || player?.role === 'leader');
  return required.some(player => player.role === 'admin') && required.every(player => player.ready === true);
}

export function validMessage(data, fromGuest = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !TYPES.has(data.t)) return false;
  if (fromGuest && !GUEST_TYPES.has(data.t)) return false;
  let size = 0;
  function safe(value, depth = 0) {
    if (++size > (fromGuest ? 500 : 100000) || depth > 5) return false;
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
  if (data.name != null && (typeof data.name !== 'string' || data.name.length > PLAYER_NAME_MAX)) return false;
  if (data.text != null && (typeof data.text !== 'string' || data.text.length > CHAT_MESSAGE_MAX)) return false;
  if (data.role != null && (!PLAYER_ROLES.has(data.role) || fromGuest)) return false;
  if (data.city != null && (typeof data.city !== 'string' || data.city.length > 240)) return false;
  if (['pose','guess','start'].includes(data.t) && !location(data)) return false;
  if (data.t === 'start' && data.mode === 'home' && !location({lat:data.homeLat,lon:data.homeLon})) return false;
  if (['pose','snapped','go'].includes(data.t)) {
    if (!finite(data.h,-12000,1e7) || !finite(data.heading,-1e5,1e5)) return false;
    if (data.t !== 'pose' && !finite(data.gh,-12000,1e7)) return false;
  }
  if (data.t === 'pose' && (!finite(data.pitch,-Math.PI,Math.PI) || !finite(data.roll,-Math.PI,Math.PI) || !finite(data.seq,0,Number.MAX_SAFE_INTEGER) || !finite(data.at,0,Number.MAX_SAFE_INTEGER))) return false;
  if (data.t === 'bump' && (typeof data.target !== 'string' || data.target.length < 3 || data.target.length > 80 || !finite(data.ix,-8,8) || !finite(data.iy,-8,8) || !finite(data.iz,-8,8))) return false;
  if (data.t === 'moderate' && (!['mute','kick','approve'].includes(data.action) || typeof data.target !== 'string' || data.target.length < 3 || data.target.length > 80 || (data.action === 'mute' && typeof data.muted !== 'boolean') || (data.action === 'approve' && typeof data.approved !== 'boolean'))) return false;
  if (data.t === 'muted' && typeof data.muted !== 'boolean') return false;
  if (data.state != null && !['airborne','grounded','launching'].includes(data.state)) return false;
  if (data.motion != null && !finite(data.motion,0,1000)) return false;
  for (const key of ['roster','players']) if (data[key] != null && (!Array.isArray(data[key]) || !data[key].every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.length <= PLAYER_NAME_MAX && PLANES.has(p.plane) && (p.role == null || PLAYER_ROLES.has(p.role)) && (p.muted == null || typeof p.muted === 'boolean') && (p.approved == null || typeof p.approved === 'boolean') && (p.score == null || finite(p.score,0,1e9))))) return false;
  if (data.seats != null && (typeof data.seats !== 'object' || Array.isArray(data.seats) || !Object.values(data.seats).every(n => Number.isSafeInteger(n) && n >= 0))) return false;
  return true;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
