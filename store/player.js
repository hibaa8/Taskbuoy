// This HTTPS page has no extension APIs and receives only a validated video ID.
// Keep this source in the extension repository so reviewers can inspect it.
const status = document.getElementById('player-status');
const play = document.getElementById('play');
const fallback = document.getElementById('fallback');
const videoId = new URLSearchParams(location.search).get('v');
let player, finished = false;
function report(state, code) {
  window.parent.postMessage({ type: 'FOCUS_VIDEO_STATUS', state, code }, '*');
}
function show(text, state, code) { status.textContent = text; report(state, code); }
function unavailable(code) {
  play.hidden = true; fallback.hidden = false;
  show([101, 150].includes(code) ? 'The video owner does not allow embedded playback. Choose another video in settings.' : code === 100 ? 'This video is unavailable or private.' : code === 153 ? 'YouTube could not verify this player’s web origin.' : 'YouTube could not play this video. Try again or open it on YouTube.', 'error', code);
}
if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId || '')) {
  show('Choose a valid YouTube video in Taskbuoy settings.', 'error');
} else {
  fallback.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('player', {
      host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId,
      playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, end: 60, origin: location.origin },
      events: {
        onReady() { show('Ready · starting muted', 'ready'); player.mute(); player.playVideo(); play.hidden = false; },
        onStateChange(event) {
          if (event.data === 1) { play.hidden = true; show('Playing · use the player controls for sound', 'playing'); }
          else if (event.data === 3) { show('Buffering video…', 'buffering'); }
          else if (event.data === 2) { play.hidden = false; show('Paused · press Play to continue', 'paused'); }
          else if (event.data === 0) { finished = true; play.hidden = true; show('Reset complete · return to your next small step', 'ended'); }
        },
        onAutoplayBlocked() { play.hidden = false; show('Autoplay paused by your browser · press Play', 'blocked'); },
        onError(event) { unavailable(event.data); }
      }
    });
  };
  play.addEventListener('click', () => { if (player && !finished) player.playVideo(); });
  const api = document.createElement('script'); api.src = 'https://www.youtube.com/iframe_api';
  api.onerror = () => unavailable(); document.head.append(api);
  setTimeout(() => {
    if (!finished && (!player?.getPlayerState || [-1, 3, 5].includes(player.getPlayerState()))) {
      play.hidden = !player?.playVideo; fallback.hidden = false;
      show('If playback has not started, press Play or open the video on YouTube.', 'waiting');
    }
  }, 18000);
  setInterval(() => {
    if (!finished && player?.getCurrentTime?.() >= 60) {
      finished = true; player.stopVideo(); play.hidden = true;
      show('One-minute reset complete · return to your next small step', 'ended');
    }
  }, 500);
}
