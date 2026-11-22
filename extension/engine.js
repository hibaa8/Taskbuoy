export const CATEGORIES = ['work', 'distraction', 'unknown', 'away', 'break'];
export const DEFAULT_SETTINGS = {
  domains: ['youtube.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'x.com'],
  graceSeconds: 60,
  mode: 'gentle',
  workDomains: [],
  closeDistractingTabs: true,
  sound: true,
  escalation: true,
  escalationAfter: 3,
  videoId: 'E9lAeMz1DaM',
  cameraDelaySeconds: 15
};
export function emptyState() {
  return { version: 3, settings: structuredClone(DEFAULT_SETTINGS), session: null, history: [], tasks: [], notice: '', camera: null, activeTabId: null, lastEvent: null, resetWindowId: null };
}
export function migrateState(state) {
  if (!state) return emptyState();
  if ((state.version ?? 1) < 3 && state.settings?.videoId === '0NV1KdWRHck') state.settings.videoId = DEFAULT_SETTINGS.videoId;
  state.version = 3;
  state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...state.settings };
  state.camera ??= null;
  if (state.session) {
    state.session.rules = { ...structuredClone(DEFAULT_SETTINGS), ...state.session.rules };
    state.session.allowedDomains ??= [];
    state.session.events ??= [];
  }
  return state;
}
export function hostOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : ''; }
  catch { return ''; }
}
export function normalizeDomain(value) {
  const raw = value.trim().toLowerCase();
  if (!raw) return '';
  const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (!/^https?:$/.test(u.protocol) || u.pathname !== '/' || u.search || u.hash || u.port || u.username || u.password || !u.hostname.includes('.')) throw new Error(`Enter a domain, such as youtube.com: ${value}`);
  return u.hostname.replace(/^www\./, '');
}
export function matchesHost(host, domains) {
  return domains.some(d => host === d || host.endsWith(`.${d}`));
}
export function classify(session, context, now) {
  if (session.breakUntil > now) return 'break';
  if (!context.focused || context.idle !== 'active') return 'away';
  const host = hostOf(context.url);
  if (context.tabId === session.workTabId && host === session.workHost) return 'work';
  if (host && matchesHost(host, session.allowedDomains)) return 'work';
  if (host && matchesHost(host, session.rules.workDomains ?? [])) return 'work';
  if (host && matchesHost(host, session.rules.domains)) return 'distraction';
  // Any observed, active Chrome tab is work unless explicitly classified as distracting.
  return context.tabId != null ? 'work' : 'unknown';
}
export function createSession({ id, title, durationMinutes, tab, rules, now, taskId = null }) {
  if (!title?.trim()) throw new Error('Give this session an intention.');
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) throw new Error('Choose a session between 1 and 240 minutes.');
  if (!hostOf(tab?.url)) throw new Error('Open a regular website in your work tab first.');
  return {
    id, title: title.trim().slice(0, 160), taskId, start: now, endAt: now + durationMinutes * 60000,
    workTabId: tab.id, workHost: hostOf(tab.url), allowedDomains: [], rules: structuredClone(rules),
    cursor: now, category: 'work', domain: hostOf(tab.url), breakUntil: 0,
    distractionSinceNudge: 0, interventions: 0, slices: [], events: [], outcome: ''
  };
}
export function parseVideoId(value) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') throw Error();
    let id = '';
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(u.hostname)) id = u.searchParams.get('v') || u.pathname.split('/').at(-1);
    if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
  } catch {}
  throw new Error('Use a valid HTTPS YouTube video link.');
}
export function trendInsights(sessions) {
  const sites = new Map();
  const hours = new Map();
  for (const s of sessions) for (const slice of s.slices) {
    const ms = slice.end - slice.start;
    if (slice.category === 'distraction') sites.set(slice.domain, (sites.get(slice.domain) ?? 0) + ms);
    // Group by the recorded interval start; this is a coarse time-of-day pattern.
    const hour = new Date(slice.start).getHours();
    const bucket = hours.get(hour) ?? { work: 0, distraction: 0 };
    if (slice.category in bucket) bucket[slice.category] += ms;
    hours.set(hour, bucket);
  }
  const ranked = [...sites].sort((a, b) => b[1] - a[1]);
  const notes = [];
  if (ranked.length) notes.push(`${ranked[0][0] || 'An unnamed site'} accounts for ${Math.ceil(ranked[0][1] / 60000)} minutes of recorded distracting browsing. Try a shorter allowance for your next work block.`);
  const candidates = [...hours].filter(([, v]) => v.work + v.distraction >= 10 * 60000);
  candidates.sort((a, b) => b[1].distraction / (b[1].work + b[1].distraction) - a[1].distraction / (a[1].work + a[1].distraction));
  if (sessions.length >= 3 && candidates[0]?.[1].distraction > 0) {
    const [hour, bucket] = candidates[0];
    notes.push(`Around ${String(hour).padStart(2, '0')}:00, ${Math.round(100 * bucket.distraction / (bucket.work + bucket.distraction))}% of classified browsing was distracting. Test a different time for your hardest task; this is a pattern, not a cause.`);
  }
  if (!notes.length) notes.push('Finish a few sessions to see which websites and times are associated with distracting browsing.');
  return { sites: ranked.slice(0, 5), notes };
}
export function addSlice(session, start, end, category, domain = '') {
  if (end <= start) return;
  const last = session.slices.at(-1);
  if (last && last.end === start && last.category === category && last.domain === domain) last.end = end;
  else session.slices.push({ start, end, category, domain });
  if (category === 'distraction') session.distractionSinceNudge += end - start;
}
// Event timestamps are persisted. Long unobserved gaps are unknown, never credited as work.
export function advance(session, now) {
  const end = Math.min(now, session.endAt);
  if (end <= session.cursor) return;
  const start = session.cursor;
  if (end - start > 65000) addSlice(session, start, end, 'unknown');
  else if (session.category === 'break' && session.breakUntil > start && session.breakUntil < end) {
    addSlice(session, start, session.breakUntil, 'break');
    addSlice(session, session.breakUntil, end, 'unknown');
  } else addSlice(session, start, end, session.category, session.domain);
  session.cursor = end;
}
export function totals(slices) {
  const result = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const slice of slices) result[slice.category] += slice.end - slice.start;
  return result;
}
export function slicesForDay(slices, day = new Date()) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return slices.filter(s => s.end > start && s.start < end).map(s => ({ ...s, start: Math.max(start, s.start), end: Math.min(end, s.end) }));
}
export function shouldNudge(session, context, now) {
  return now < session.endAt && classify(session, context, now) === 'distraction' && session.distractionSinceNudge >= session.rules.graceSeconds * 1000;
}
export function feedback(summary, sessions) {
  const observed = summary.work + summary.distraction + summary.unknown;
  if (!observed) return 'Start a focus session to learn how your browsing time is spent.';
  if (summary.distraction > summary.work && summary.distraction > 120000) return 'Distracting browsing exceeded estimated work time. Try a shorter work block or automatic return for your next session.';
  if (summary.unknown > observed * 0.35) return 'Some time remains unclassified, including older records or gaps such as sleep and missed updates. Unmarked active Chrome tabs now count as work by default.';
  if (!sessions.some(s => s.outcome)) return 'Your time is recorded. Add what you finished to a session so you can compare time spent with progress made.';
  return 'Review what you finished alongside your time breakdown, then choose one concrete next step for your next session.';
}
