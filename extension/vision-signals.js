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
  return { x: median('x'), y: median('y'), down: median('down') };
}
export function observation(face, objects, baseline) {
  const phone = objects?.detections?.some(d => d.categories?.some(c => ['cell phone', 'mobile phone'].includes(c.categoryName?.toLowerCase()) && c.score >= 0.55));
  if (phone) return { status: 'phone-visible', detail: 'A possible phone is visible; this does not prove you are scrolling.' };
  const feature = faceFeatures(face);
  if (!feature) return { status: 'no-face', detail: 'No face is visible to the camera.' };
  if (!baseline) return { status: 'calibrating', detail: 'Look toward the screen to calibrate.' };
  if (Math.abs(feature.x - baseline.x) > 0.22) return { status: 'looking-away', detail: 'Your head appears turned away from its calibrated position.' };
  if (feature.y - baseline.y > 0.16 || (feature.closed < 0.55 && feature.down - baseline.down > 0.35)) return { status: 'looking-down', detail: 'You may be looking down compared with your calibrated position.' };
  return { status: 'ready', detail: 'Face visible near your calibrated screen-facing position.' };
}
