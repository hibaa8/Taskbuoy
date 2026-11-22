# Focus Coach · v0.2.0

A local Chrome extension that helps you return to a work intention. It now includes a visible side coach, in-page reminders, sound, configurable work sites, and an optional experimental camera coach.

## Install from this repository

```sh
git clone https://github.com/hibaa8/focus-coach.git
cd focus-coach
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository's `extension` folder. Pin Focus Coach in the toolbar. The camera models and runtime are included, so no build, package installation, model download, account, or API key is needed to use the extension.

For future updates, end your session, run `git pull` in the same clone, press **Reload** on the extension card, and refresh your website tabs. Keeping the clone in the same location preserves the unpacked extension's identity and local records.

## Update your installed version

1. End any active focus session. Optionally export your records from the dashboard.
2. Extract the updated `Focus_Coach_MVP.zip`.
3. Copy the contents of its `focus-coach/extension` folder into the **same extension folder you originally loaded**, replacing the old files. Keep that original folder path to preserve the unpacked extension's identity and local records.
4. Open `chrome://extensions` and press the **Reload** icon on Focus Coach. Do not remove the extension if you want to retain its records.
5. Allow the added website access if Chrome asks. In the extension's Details, allow access on the sites where you want the side coach. Refresh your work and distracting tabs once.
6. Open the dashboard. Set your work websites, distracting websites, mode, and sound preferences. Save, then start a new session.

For a fresh installation: enable Developer mode on `chrome://extensions`, choose Load unpacked, select `focus-coach/extension`, then pin Focus Coach in the toolbar. No build, account, or API key is required.

## What's new

- **Approved work websites:** a persistent list that applies across tabs, plus a one-session “This website is work” action. Work allowances take priority over the distraction list. Unknown sites stay unclassified, rather than automatically being treated as distracting.
- **On-page coach:** a small monitoring icon and session countdown at the lower-right side of supported websites. Click it for controls. It distinguishes browser monitoring from camera monitoring.
- **Visible reminders:** an in-page “Go back to work” card, alongside the operating-system notification. A suppressed OS notification does not prevent the in-page card from appearing.
- **Close and return:** automatic mode activates the saved work tab, then closes the current distracting tab when this setting is enabled. The manual Return action also honors this setting. It does not close your work tab, approved sites, unclassified sites, or all other distracting tabs in the background. If the destination is unavailable, it leaves the source open and asks you to choose a work tab.
- **Sound:** a short original chime for reminders and session completion, played through an extension offscreen audio document. Sound can be disabled. Device mute, system output, and browser playback restrictions can affect it; use Test alerts & sound.
- **Motivational reset:** after repeated reminders, a separate reset panel opens with Shah Rukh Khan's TED talk, “Thoughts on humanity, fame and love.” The default is three reminders, with a five-minute escalation cooldown. Thirty seconds back on an approved work site clears the repeated-reminder count, unless a fresh camera concern is ongoing. You can change the video or disable escalation. The embedded player attempts muted autoplay and stops at the first minute. Use its controls for sound; there is a YouTube fallback link if embedding is unavailable. No SRK footage is downloaded or redistributed.
- **Trend insights:** top distracting websites and coarse time-of-day patterns calculated from your own records. These are transparent statistics and rules, not LLM-generated explanations or evidence of why you were distracted.
- **Optional camera coach:** local face landmarks, calibrated head-position/eye-direction cues, and a phone object detector. See the limits below.

## Try the updated core loop

1. In Settings, add work domains such as `github.com` or `docs.google.com`. Keep `instagram.com` in the distracting list. Choose a 30-second grace period, Automatic mode, and Close distracting tabs. Save.
2. Open a real work website, start a session, then visit Instagram in a **different tab**.
3. The side coach should show a distraction countdown. Near expiry, it shows a reminder and plays a chime; automatic return closes that distracting tab after selecting your work tab. Leave another distracting tab in the background to verify it stays open.
4. In a new session, try Gentle mode: the reminder and sound should appear while the tab stays open. Click Close & return to return manually.
5. Open an approved work website in another tab: it should count as estimated work and should not trigger a distracting-site reminder.
6. Take a five-minute break; reminders pause. Breaks do not extend the original session end time.
7. Let a short session finish and check the completion chime and on-page notice. Record what you finished in the dashboard.
8. Use Preview SRK reset to test the player. The video requires network access and may require clicking Play or opening the fallback link.

Chrome internal pages, the Chrome Web Store, and some built-in PDF viewers cannot host injected widgets. The toolbar icon remains available. Some websites or restricted profiles can prevent injection. Refresh regular website tabs after installing or updating. Browser timers are approximate and can run late when Chrome is busy or a computer sleeps.

## Enable and calibrate the camera

1. Start a focus session first.
2. Choose **Camera setup / stop** from the dashboard, popup, or side coach.
3. Click **Enable camera & calibrate**. Allow the camera prompt; macOS may also need Chrome camera access in System Settings.
4. Face your screen in your normal working position for about 10–15 seconds while calibration gathers 16 samples.
5. Click **Return to my work tab** and keep the camera tab open. Recalibrate if you reposition the camera or your seat.
6. A sustained estimated cue—looking down, head turned away, face absent, or phone visible—can trigger “Stay focused” after the configured 10, 15, 30, or 60 seconds. Camera reminders are limited to one per minute and pause during planned breaks.
7. Press **Stop camera**, close the camera tab, or end the session to stop camera access. Analysis pauses during breaks, while the camera preview remains on. The side icon identifies camera status separately from browser tracking; stale samples expire after six seconds.

**Limits:** this does not measure mental attention, guarantee eye contact, identify phone scrolling, or detect a phone outside the camera view. “Phone visible” is an object-detection estimate and does not prove use. Looking down could mean reading notes. Lighting, glasses, camera position, and detection mistakes affect the results. The bundled models and thresholds have not been evaluated for attention accuracy. Camera cues are kept separate from website work-time accounting.

The camera uses MediaPipe Face Landmarker and EfficientDet-Lite0 locally. Frames and landmarks are processed in memory and discarded, not recorded, saved, or uploaded. Only recent cue status and a capped log of reminder reasons/timestamps are retained.

## Time accounting and goals

Tracking runs only during a session. The selected work tab counts as estimated work while it remains on its selected hostname; approved domains also count. A website on the distraction list counts as distracting unless approved. Other sites are unclassified. Outside-Chrome and idle time is separate; it may include legitimate editor work or reading.

The distracting allowance accumulates across visits and resets on each website nudge. Breaks pause it. Time is updated on tab, window, idle, alarm, and UI events; a long unobserved gap over 65 seconds is conservatively unclassified. An idle signal reflects lack of recent computer input, not lack of attention. A browser restart archives the session rather than reusing old tab IDs.

Daily totals split intervals at local midnight. Up to 200 sessions and 100 reminder events per session are retained. Goals support an optional deadline and manually updated remaining minutes. Pacing divides that remaining effort by remaining calendar days, including today; it does not yet consider calendar availability or automatically infer completion.

## Privacy and permissions

Session history, goals, settings, and summaries stay in `chrome.storage.local` in this profile. Observed activity stores domain names, not browsing paths, page contents, screenshots, or raw camera data. Task descriptions, reflections, and reminder reasons are local records too.

Permissions:

- `tabs`: inspect tab metadata, select your work tab, and close the active distracting tab when configured.
- `storage`, `idle`, `alarms`, `notifications`: persistence, idle signals, deadlines, and system alerts.
- `scripting` and HTTP/HTTPS website access: attach the side coach and reminders to regular webpages. The script does not analyze or transmit webpage contents.
- `offscreen`: play a short audio cue even when the popup is closed.
- Camera access is a separate browser permission requested only when you click Enable camera in the camera tab. Audio input is never requested.

Vision SDK, WebAssembly files, and model weights are bundled, so camera inference does not need a cloud API or runtime model download. Playing the motivational video connects to YouTube and its services. No LLM service, analytics, account, cloud sync, or remote coaching API is included.

Export records as JSON from the dashboard. Delete all records resets local goals, history, and settings after a session ends. Removing the extension removes its local extension storage; exports are separate files. Import is not implemented.

## Development and validation

Production code uses JavaScript modules and browser APIs with bundled MediaPipe assets. Node.js 20+ runs the dependency-free suite:

```sh
cd focus-coach
npm test
```

**Verified in the build environment:** 35 accounting, worker integration with simulated Chrome APIs, migration, domain matching, closure protection, camera cue, reminder delay, sound-trigger, escalation, trend, and message-boundary tests pass. Optional DOM smoke checks also pass for popup/dashboard initialization and side-coach countdown/nudge rendering. SDK exports, model container structure, asset hashes, manifest/HTML references, and JavaScript syntax were checked.

Optional DOM checks:

```sh
npm install --no-save linkedom
node tests/ui-check.mjs
```

Optional real-browser smoke check:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser-smoke.mjs
```

Set `CHROME_PATH` to use an existing Chromium executable. The smoke test uses a disposable profile and local request interception for test websites.

**Not verified here:** the operating system blocks Chromium launch with a required socket operation denied. Real Chrome injection/rendering, system notification delivery, actual sound output, webcam permission and model inference, detection accuracy, hidden-camera-tab scheduling, video embedding, and service-worker suspension still need checks on your Mac. This is an unpacked development prototype.

## Source layout

- `engine.js`: accounting, domain classification, migration, video-link validation, and trend summaries.
- `background.js`: serialized event processing, notifications, tab actions, content-script messages, camera cue persistence, and escalation.
- `coach-widget.js`: isolated side coach, live countdown, and in-page reminders.
- `audio.html` / `audio.js` / `chime.wav`: offscreen audio.
- `camera.html` / `camera.js` / `vision-signals.js`: camera permission, local inference, calibration, and estimated cues.
- `reset.html` / `reset.js`: configurable motivational video and return/break controls.
- `vendor/`, `models/`, `MODEL_ASSETS.json`: pinned SDK, model assets, and SHA-256 inventory.
- `app.js`, popup/dashboard HTML, `styles.css`: settings, goals, history, and reports.

Model/runtime sources and attribution are listed in `THIRD_PARTY_NOTICES.md`. The implementation roadmap is in `IMPLEMENTATION_PLAN.md`.
