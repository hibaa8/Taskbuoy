chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'audio' || message.type !== 'PLAY_CHIME') return;
  const audio = document.getElementById('chime');
  audio.currentTime = 0;
  audio.play().then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message }));
  return true;
});
