// These are calibrated geometric cues, not a measure of attention or intent.
export function faceFeatures(result) {
  const points = result.faceLandmarks?.[0];
  if (!points?.[1] || !points[33] || !points[263]) return null;
  const left = points[33], right = points[263], nose = points[1];
  const span = Math.hypot(right.x - left.x, right.y - left.y);
  if (span < 0.015) return null;
  const scores = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map(c => [c.categoryName, c.score]));
  return {
    x: (nose.x - (left.x + right.x) / 2) / span,
    y: (nose.y - (left.y + right.y) / 2) / span,
    down: ((scores.eyeLookDownLeft ?? 0) + (scores.eyeLookDownRight ?? 0)) / 2,
    closed: ((scores.eyeBlinkLeft ?? 0) + (scores.eyeBlinkRight ?? 0)) / 2
  };
}
export function calibration(samples) {
  if (samples.length < 12) throw Error('Look toward your screen for a few more seconds to calibrate.');
  const median = key => samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  const center = { x: median('x'), y: median('y'), down: median('down') };
  // Learn a bounded screen-facing range without adapting toward a later distraction.
  const range = (key, floor, ceiling) => {
    const deviations = samples.map(s => Math.abs(s[key] - center[key])).sort((a, b) => a - b);
    return Math.min(ceiling, Math.max(floor, deviations[Math.floor((deviations.length - 1) * .9)] * 1.5));
  };
  return { ...center, tolerance: { x: range('x', .38, .5), y: range('y', .24, .32), down: range('down', .5, .65) } };
}
export const CAMERA_CONCERNS = ['looking-down', 'head-down', 'looking-away', 'no-face', 'phone-down'];
export function isCameraConcern(status) { return CAMERA_CONCERNS.includes(status); }
export function observation(face, objects, baseline) {
  const feature = faceFeatures(face);
  if (!feature) return { status: 'no-face', detail: 'No face is visible to the camera.' };
  if (!baseline) return { status: 'calibrating', detail: 'Look toward the screen to calibrate.' };
  const phone = objects?.detections?.some(d => d.categories?.some(c => ['cell phone', 'mobile phone'].includes(c.categoryName?.toLowerCase()) && c.score >= .65));
  const tolerance = baseline.tolerance ?? { x: .38, y: .24, down: .5 };
  const pitch = feature.y - baseline.y;
  const down = feature.down - baseline.down;
  // Blinks and modest head motion are normal. A phone sitting nearby is informational.
  const eyesDown = feature.closed < .55 && down > tolerance.down;
  const headDown = pitch > tolerance.y;
  if (phone && (eyesDown || headDown)) return { status: 'phone-down', detail: 'Looking down with a possible phone in view; this does not prove use or scrolling.' };
  if (headDown) return { status: 'head-down', detail: 'Your head appears lowered beyond your calibrated screen-facing range.' };
  if (eyesDown) return { status: 'looking-down', detail: 'Your eyes may be directed down beyond your normal screen-facing range.' };
  if (Math.abs(feature.x - baseline.x) > tolerance.x) return { status: 'looking-away', detail: 'Your head appears turned well beyond your calibrated screen-facing range.' };
  if (phone) return { status: 'phone-visible', detail: 'A possible phone is visible; this does not prove you are scrolling. No reminder for visibility alone.' };
  return { status: 'ready', detail: 'Face visible near your calibrated screen-facing position.' };
}

// Brief glances, tracking dropouts and one-frame model errors should not label a distraction.
export function createCueFilter() {
  let stable = { status: 'ready', detail: 'Face visible near your calibrated screen-facing position.' }, pending = null, since = 0, lastAt = null;
  return (cue, now) => {
    if (lastAt !== null && (now < lastAt || now - lastAt > 3000)) {
      stable = { status: 'ready', detail: 'Checking camera position after a pause.' }; pending = null;
    }
    lastAt = now;
    if (['off', 'error', 'calibrating'].includes(cue.status)) { stable = cue; pending = null; return cue; }
    if (cue.status === stable.status) { stable = cue; pending = null; return stable; }
    if (pending?.status !== cue.status) { pending = cue; since = now; }
    const delay = isCameraConcern(cue.status) ? 1600 : 650;
    if (now - since >= delay) { stable = cue; pending = null; }
    return stable;
  };
}
