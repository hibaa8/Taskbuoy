import { FaceLandmarker, ObjectDetector, FilesetResolver } from './vendor/vision_bundle.mjs';
import { faceFeatures, calibration, observation, createCueFilter } from './vision-signals.js';
import { loadPhoneModel } from './model-loader.js';
const $ = id => document.getElementById(id);
let stream = null, faceModel = null, objectModel = null, baseline = null, samples = [], calibrating = true, running = false, starting = false;
let session = null, timer = null, lastPhoneCheck = 0, lastObjects = null, failures = 0;
let generation = 0;
let filterCue = createCueFilter();
const video = $('camera-preview');
async function report(status, detail) {
  const result = await chrome.runtime.sendMessage({ type: 'CAMERA_SAMPLE', status, detail, sessionId: session?.id });
  if (!result.ok) throw Error(result.error);
}
function status(title, detail) { $('camera-status').textContent = title; $('camera-detail').textContent = detail; }
function showError(text = '') { $('camera-error').hidden = !text; $('camera-error').textContent = text; }
function release() {
  generation += 1;
  running = false; clearTimeout(timer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; video.srcObject = null;
  faceModel?.close(); objectModel?.close(); faceModel = null; objectModel = null;
  $('camera-start').disabled = false; $('camera-stop').disabled = true; $('camera-calibrate').disabled = true;
  $('camera-indicator').textContent = 'CAMERA OFF';
}
async function stop() {
  release(); status('Camera is off', 'Your browser session can continue without camera tracking.');
  try { await report('off', 'Camera off'); } catch {}
}
async function step() {
  if (!running) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET' });
    if (!running) return;
    if (!response.ok) throw Error(response.error);
    const current = response.state.session;
    if (!current || current.id !== session.id) { await stop(); status('Camera stopped', 'Your focus session ended. Enable the camera again for a new session.'); return; }
    session = current;
    $('camera-session').textContent = `Session: ${session.title}. Sustained cues trigger a reminder after approximately ${session.rules.cameraDelaySeconds} seconds.`;
    if (session.breakUntil > Date.now()) {
      filterCue = createCueFilter();
      status('On a planned break', 'Camera preview is still on; analysis and reminders are paused.');
      await report('ready', 'Analysis paused during your break.');
    } else if (video.readyState >= 2) {
      const timestamp = performance.now();
      const face = faceModel.detectForVideo(video, timestamp);
      if (timestamp - lastPhoneCheck >= 1500) { lastObjects = objectModel.detectForVideo(video, timestamp); lastPhoneCheck = timestamp; }
      if (calibrating) {
        const feature = faceFeatures(face);
        if (feature) samples.push(feature);
        if (samples.length >= 16) { baseline = calibration(samples); calibrating = false; }
      }
      const cue = filterCue(calibrating ? { status: 'calibrating', detail: `Look around your normal screen area: calibration ${samples.length}/16 samples. Small natural movements are welcome.` } : observation(face, lastObjects, baseline), timestamp);
      status(cue.status === 'ready' || cue.status === 'phone-visible' ? 'Screen-facing estimate' : cue.status.replaceAll('-', ' '), cue.detail);
      await report(cue.status, cue.detail);
    }
    failures = 0;
  } catch (error) {
    showError(error.message); failures += 1;
    if (failures >= 3) { await stop(); status('Camera stopped after an error', 'Check permissions, then try enabling it again.'); return; }
  }
  if (running) timer = setTimeout(step, 650);
}
$('camera-start').addEventListener('click', async () => {
  if (running || starting) return;
  starting = true; $('camera-start').disabled = true; showError();
  const run = ++generation;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET' });
    if (!response.ok || !response.state.session) throw Error('Start a focus session from the extension popup before enabling the camera.');
    session = response.state.session;
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    if (run !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    video.srcObject = stream; await video.play();
    if (run !== generation) return;
    $('camera-stop').disabled = false;
    $('camera-indicator').textContent = '● CAMERA ON';
    status('Loading local vision models…', 'Camera frames stay on your device. The first load can take a few seconds.');
    await report('calibrating', 'Camera on; loading local models.');
    const files = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('vendor/wasm'));
    if (run !== generation) return;
    const loadedFace = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: chrome.runtime.getURL('models/face_landmarker.task'), delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6
    });
    if (run !== generation) { loadedFace.close(); return; }
    faceModel = loadedFace;
    const phoneModel = await loadPhoneModel(chrome.runtime.getURL('models/'));
    if (run !== generation) return;
    const loadedObjects = await ObjectDetector.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: phoneModel, delegate: 'CPU' },
      runningMode: 'VIDEO', scoreThreshold: 0.55, categoryAllowlist: ['cell phone'], maxResults: 2
    });
    if (run !== generation) { loadedObjects.close(); return; }
    objectModel = loadedObjects;
    calibrating = true; samples = []; baseline = null; failures = 0; running = true;
    lastObjects = null; lastPhoneCheck = 0; filterCue = createCueFilter();
    $('camera-stop').disabled = false; $('camera-calibrate').disabled = false;
    stream.getVideoTracks()[0].addEventListener('ended', () => stop(), { once: true });
    step();
  } catch (error) { if (run === generation) { release(); showError(`${error.message} If access was denied, allow this extension’s camera and Chrome camera access in macOS settings.`); } }
  finally { starting = false; }
});
$('camera-stop').addEventListener('click', stop);
$('camera-calibrate').addEventListener('click', () => { samples = []; baseline = null; calibrating = true; lastObjects = null; lastPhoneCheck = 0; filterCue = createCueFilter(); });
$('camera-return').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'RETURN' });
  if (!result.ok || result.state.notice) showError(result.error || result.state.notice);
});
window.addEventListener('pagehide', () => { release(); report('off', 'Camera tab closed').catch(() => {}); });
