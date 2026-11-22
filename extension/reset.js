const $ = id => document.getElementById(id);
try {
  const result = await chrome.runtime.sendMessage({ type: 'GET' });
  if (!result.ok) throw Error(result.error);
  const { session, settings } = result.state;
  $('reset-intention').textContent = session ? `Your intention: ${session.title}` : 'Choose a new intention when you’re ready.';
  const videoId = session?.rules.videoId ?? settings.videoId;
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&rel=0&end=60`;
  iframe.title = 'Motivational reset video'; iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
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
