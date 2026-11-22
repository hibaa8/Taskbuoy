const $ = id => document.getElementById(id);
try {
  const result = await chrome.runtime.sendMessage({ type: 'GET' });
  if (!result.ok) throw Error(result.error);
  const { session, settings } = result.state;
  $('reset-intention').textContent = session ? `Your intention: ${session.title}` : 'Choose a new intention when you’re ready.';
  const videoId = session?.rules.videoId ?? settings.videoId;
  const iframe = document.createElement('iframe');
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw Error('Choose a valid YouTube video in Settings.');
  const playerOrigin = 'https://focus-coach-privacy-hiba.strollingpopcorn9.chatgpt.site';
  iframe.src = `${playerOrigin}/player.html?v=${encodeURIComponent(videoId)}`;
  iframe.sandbox = 'allow-scripts allow-same-origin allow-presentation allow-popups';
  iframe.title = 'Motivational reset video'; iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  const videoStatus = $('video-status');
  videoStatus.textContent = 'Loading the video player…';
  let receivedStatus = false;
  const statusText = { ready: 'Video ready · starting muted.', playing: 'Playing · use the player controls for sound.', paused: 'Paused · press Play inside the player to continue.', blocked: 'Your browser paused autoplay. Press Play inside the player.', ended: 'Your short reset is complete. Choose your next small step.', waiting: 'Press Play inside the player if it has not started.', error: 'This video could not play here. Choose a different video in Settings or use the YouTube link.' };
  window.addEventListener('message', event => {
    if (event.origin !== playerOrigin || event.source !== iframe.contentWindow || event.data?.type !== 'FOCUS_VIDEO_STATUS') return;
    const text = statusText[event.data.state]; if (!text) return;
    receivedStatus = true; videoStatus.dataset.state = event.data.state;
    videoStatus.textContent = text + (Number.isInteger(event.data.code) ? ` YouTube error ${event.data.code}.` : '');
  });
  setTimeout(() => { if (!receivedStatus) videoStatus.textContent = 'The hosted player has not responded. Check your connection or use the YouTube link.'; }, 22000);
  $('video-container').append(iframe);
  $('video-link').href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  for (const [id, type] of [['reset-return', 'RETURN'], ['reset-break', 'BREAK']]) {
    $(id).disabled = !session;
    $(id).addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type });
      if (response.ok && !response.state.notice) window.close();
      else { $('reset-error').hidden = false; $('reset-error').textContent = response.error || response.state.notice; }
    });
  }
} catch (error) { $('reset-error').hidden = false; $('reset-error').textContent = error.message; }
