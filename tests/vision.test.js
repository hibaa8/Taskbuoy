import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFeatures, calibration, observation } from '../extension/vision-signals.js';
function face(x = 0.5, y = 0.5, down = 0) {
  const points = Array.from({ length: 264 }, () => ({ x: 0.5, y: 0.5 }));
  points[33] = { x: 0.3, y: 0.4 }; points[263] = { x: 0.7, y: 0.4 }; points[1] = { x, y };
  return { faceLandmarks: [points], faceBlendshapes: [{ categories: [{ categoryName: 'eyeLookDownLeft', score: down }, { categoryName: 'eyeLookDownRight', score: down }] }] };
}
const baseline = { x: 0, y: 0.25, down: 0 };
test('camera observations remain estimates with no face or no calibration', () => {
  assert.equal(faceFeatures({}), null);
  assert.equal(observation({}, {}, baseline).status, 'no-face');
  assert.equal(observation(face(), {}, null).status, 'calibrating');
  assert.equal(observation(face(), {}, baseline).status, 'ready');
});
test('calibrated head changes and downward-eye cue are distinguished', () => {
  assert.equal(observation(face(0.65), {}, baseline).status, 'looking-away');
  assert.equal(observation(face(0.5, 0.6), {}, baseline).status, 'looking-down');
  assert.equal(observation(face(0.5, 0.5, 0.6), {}, baseline).status, 'looking-down');
});
test('a phone must meet confidence threshold and never implies scrolling', () => {
  const objects = score => ({ detections: [{ categories: [{ categoryName: 'cell phone', score }] }] });
  assert.equal(observation(face(), objects(0.4), baseline).status, 'ready');
  const cue = observation(face(), objects(0.9), baseline);
  assert.equal(cue.status, 'phone-visible'); assert.match(cue.detail, /does not prove.*scrolling/);
});
test('median calibration tolerates outliers and requires enough samples', () => {
  assert.throws(() => calibration([]));
  const samples = Array.from({ length: 15 }, () => baseline); samples.push({ x: 8, y: 8, down: 8 });
  assert.deepEqual(calibration(samples), baseline);
});
