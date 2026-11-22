import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFeatures, calibration, observation, createCueFilter, isCameraConcern } from '../extension/vision-signals.js';
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
  assert.equal(observation(face(0.7), {}, baseline).status, 'looking-away');
  assert.equal(observation(face(0.5, 0.6), {}, baseline).status, 'head-down');
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
  assert.deepEqual(calibration(samples), { ...baseline, tolerance: { x: .38, y: .24, down: .5 } });
});

test('normal movement in either direction and moderate downward reading remain screen-facing', () => {
  for (const x of [.36, .5, .64]) assert.equal(observation(face(x, .56, .35), {}, baseline).status, 'ready');
});
test('calibration learns natural movement but caps permissive ranges', () => {
  const samples = Array.from({length: 16}, (_, i) => ({x: i % 2 ? -.3 : .3, y: i % 2 ? .1 : .4, down: i % 2 ? 0 : .2}));
  const learned = calibration(samples);
  assert.equal(learned.tolerance.x, .5);
  assert.ok(learned.tolerance.y >= .24 && learned.tolerance.y <= .32);
  assert.equal(observation(face(.68), {}, {...baseline, tolerance: learned.tolerance}).status, 'ready');
});
test('a phone only becomes a concern with downward cues, and cannot mask an absent face', () => {
  const objects = {detections:[{categories:[{categoryName:'cell phone',score:.9}]}]};
  const visible = observation(face(), objects, baseline);
  assert.equal(isCameraConcern(visible.status), false);
  const down = observation(face(.5, .5, .7), objects, baseline);
  assert.equal(down.status, 'phone-down'); assert.equal(isCameraConcern(down.status), true);
  assert.match(down.detail, /does not prove/);
  assert.equal(observation({}, objects, baseline).status, 'no-face');
});
test('blinks do not become downward-gaze concerns and talking scores are ignored', () => {
  const f=face(.5,.5,.8);
  f.faceBlendshapes[0].categories.push({categoryName:'eyeBlinkLeft',score:.9},{categoryName:'eyeBlinkRight',score:.9},{categoryName:'jawOpen',score:.9});
  assert.equal(observation(f,{},baseline).status,'ready');
});
test('temporal filter ignores short glances and dropouts, confirms sustained cues and recovers', () => {
  const filter=createCueFilter(), ready={status:'ready'}, down={status:'head-down'}, absent={status:'no-face'};
  assert.equal(filter(down,0).status,'ready');
  assert.equal(filter(down,650).status,'ready');
  assert.equal(filter(ready,1300).status,'ready');
  assert.equal(filter(absent,1950).status,'ready');
  assert.equal(filter(ready,2600).status,'ready');
  for(const t of [3250,3900,4550]) assert.equal(filter(down,t).status,'ready');
  assert.equal(filter(down,5200).status,'head-down');
  assert.equal(filter(ready,5850).status,'head-down');
  assert.equal(filter(ready,6500).status,'ready');
});
test('a long camera pause cannot turn two isolated observations into a sustained cue', () => {
  const filter=createCueFilter();
  filter({status:'no-face'},0);
  assert.equal(filter({status:'no-face'},10000).status,'ready');
  assert.equal(filter({status:'no-face'},11950).status,'no-face');
});
