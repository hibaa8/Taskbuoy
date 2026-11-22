# Implementation status · v0.2.0

## Implemented

1. Local focus sessions and domain-based time accounting.
2. Persistent work-site approvals and one-session allowances.
3. Side coach, live countdown, in-page reminders, native notifications, and offscreen chime playback.
4. Automatic or manual return that closes only the active classified distracting tab, after successful work-tab activation.
5. Repeated-reminder escalation to a configurable SRK motivational reset panel.
6. Opt-in local camera pipeline: MediaPipe Face Landmarker, median calibration, geometric/head-position and eye-direction cues, and EfficientDet-Lite0 visible-phone detection. Sustained-cue threshold, per-minute reminder cooldown, break suppression, stream cleanup, and stale-sample expiry.
7. Daily/weekly summaries, top distracting domains, coarse time-of-day insights, goals, remaining effort, reflections, export, and reset.
8. Version-1 state migration and a boundary that prevents webpage content scripts from accessing history or submitting camera observations.

## Validation completed

- 38 deterministic and simulated Chrome API tests pass.
- Popup/dashboard and side-widget DOM smoke checks pass.
- SDK exports, model file structure, asset hashes, syntax, and local manifest/HTML references verified.

## Immediate real-device validation

Reload the same unpacked extension folder in Chrome and refresh open websites. Check both intervention modes, close protection, approved-site behavior, system alerts versus in-page cards, and audible completion.

Enable the camera explicitly and calibrate in normal lighting. Verify that camera access ends on Stop, tab closure, and session end. Check latency and battery use with the camera tab in the background. Measure false reminders during reading/normal head movement. Test a visible phone and an out-of-frame phone; do not treat the results as verified scrolling detection.

Confirm that the SRK embed plays or that its fallback link works. Video starts muted because autoplay with sound may be blocked.

## Next improvements

- Tune vision thresholds and frame rate from actual device measurements, and add an accessible false-reminder correction action.
- Record return latency and user-rated nudge helpfulness; compare interventions using those outcomes.
- Add real-Chrome CI for injection, alarms, service-worker suspension, camera permission flow with synthetic test video, audio setup, and upgrade behavior.
- Optional user-provided local motivational clips for offline playback.
- Calendar-aware work blocks, explicit reminder times, and feasible deadline pacing.
- Optional AI coaching service based on selected aggregate summaries. Current trend explanations are deterministic and remain local; do not claim an LLM is running.
- A macOS companion for foreground native app tracking. Native app work and phone activity remain outside the browser's direct visibility.
