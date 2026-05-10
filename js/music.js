'use strict';

(function () {
  // ── Chapter-specific songs ───────────────────────────────────────────────
  // Set a specific song for a chapter. Key = chapter number, Value = filename in playlist.json.
  // Example: { '10': '5. Purple Rain - Prince.mp3' }
  const CHAPTER_SONGS = {
    // '10': '5. Purple Rain - Prince.mp3',
  };

  const STATE_KEY   = 'goo-music-state';
  const FAB_POS_KEY = 'goo-fab-pos';
  const DEFAULT_START_TIME = 2;
  const isChapter   = window.location.pathname.includes('/chapters/');
  const BASE        = isChapter ? '../' : '';
  const PLAYLIST    = BASE + 'audio/playlist.json';
  const curChapter  = document.body.dataset.chapter || '';

  let songs      = [];
  let currentIdx = 0;
  let panelOpen  = false;
  let waitingForInteraction = false;

  const audio   = new Audio();
  audio.preload = 'auto';

  // ── State persistence ────────────────────────────────────────────────────
  // Saves filename + savedAt so the next page can seek to exact time position.
  function saveState() {
    if (!songs.length) return;
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        playing:  !audio.paused,
        index:    currentIdx,
        filename: songs[currentIdx]?.filename || '',
        time:     audio.currentTime,
        savedAt:  Date.now(),
        volume:   audio.volume,
        muted:    audio.muted,
      }));
    } catch {}
  }

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)); }
    catch { return null; }
  }

  window.addEventListener('beforeunload', saveState);
  window.addEventListener('pagehide',     saveState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState();
  });
  setInterval(() => { if (!audio.paused) saveState(); }, 4000);

  // ── Parse filename ───────────────────────────────────────────────────────
  function parseSong(filename) {
    const noExt = filename.replace(/\.[^.]+$/, '');
    const m = noExt.match(/^(\d+)\.\s*(.+?)\s*-\s*(.+)$/);
    if (m) return { order: parseInt(m[1]), title: m[2].trim(), artist: m[3].trim(), filename };
    return { order: 0, title: noExt, artist: '—', filename };
  }

  async function loadPlaylist() {
    try {
      const res = await fetch(PLAYLIST);
      if (!res.ok) return;
      const data = await res.json();
      songs = (Array.isArray(data) ? data : (data.songs || []))
        .map(parseSong).sort((a, b) => a.order - b.order);
    } catch {}
  }

  // ── Audio control ────────────────────────────────────────────────────────
  function loadSong(idx, seekTime) {
    if (!songs.length) return;
    currentIdx = Math.max(0, Math.min(idx, songs.length - 1));
    audio.src  = BASE + 'audio/' + songs[currentIdx].filename;
    if (typeof seekTime === 'number') {
      audio.addEventListener('loadedmetadata', function seek() {
        audio.currentTime = seekTime;
        audio.removeEventListener('loadedmetadata', seek);
      });
    }
    updateUI();
    saveState();
  }

  function togglePlay() {
    if (!songs.length) return;
    if (audio.paused) audio.play().catch(() => {});
    else              audio.pause();
  }

  function prevSong() { loadSong(currentIdx - 1 < 0 ? songs.length - 1 : currentIdx - 1); audio.play().catch(() => {}); }
  function nextSong() { loadSong((currentIdx + 1) % songs.length); audio.play().catch(() => {}); }

  audio.addEventListener('play',           () => { updatePlayBtn(); updateFab(); saveState(); });
  audio.addEventListener('pause',          () => { updatePlayBtn(); updateFab(); saveState(); });
  audio.addEventListener('ended',          nextSong);
  audio.addEventListener('timeupdate',     updateProgress);
  audio.addEventListener('loadedmetadata', updateProgress);

  // ── Autoplay helpers ─────────────────────────────────────────────────────
  function onFirstInteraction() {
    if (!audio.paused) return;
    waitingForInteraction = false;
    audio.play().catch(() => {});
  }

  function waitForInteraction() {
    if (waitingForInteraction) return;
    waitingForInteraction = true;
    document.addEventListener('click',      onFirstInteraction, { once: true });
    document.addEventListener('touchstart', onFirstInteraction, { once: true });
    document.addEventListener('keydown',    onFirstInteraction, { once: true });
  }

  // Immediate autoplay attempt: unmuted → muted → wait for gesture.
  // No 2500ms delay — tries right away.
  async function tryAutoplay() {
    if (!songs.length || !audio.paused) return;
    try {
      await audio.play();
      saveState();
      return;
    } catch {}
    // Muted fallback (allowed by all modern browsers even without gesture)
    audio.muted = true;
    try {
      await audio.play();
      audio.muted = false;
      updateVolIcon();
      saveState();
    } catch {
      audio.muted = false;
      waitForInteraction();
    }
  }

  // ── Early resume (minimize cross-page gap) ───────────────────────────────
  // Called BEFORE playlist fetch. Uses the saved filename to start the audio
  // element immediately, compensating for elapsed time since the last page saved state.
  // Link-click navigation transfers the user activation, so unmuted play usually works.
  function earlyResume() {
    const saved = loadState();
    if (!saved || !saved.playing || !saved.filename) return false;

    const elapsed = (Date.now() - (saved.savedAt || Date.now())) / 1000;
    const seekTo  = Math.max(0, (saved.time || 0) + elapsed);

    audio.volume = saved.volume ?? 0.5;
    audio.muted  = saved.muted  ?? false;
    audio.src    = BASE + 'audio/' + saved.filename;

    // Seek once metadata is ready (non-blocking)
    audio.addEventListener('loadedmetadata', function onMeta() {
      audio.removeEventListener('loadedmetadata', onMeta);
      if (audio.duration && seekTo < audio.duration) {
        audio.currentTime = seekTo;
      }
    }, { once: true });

    // Try to play — link click counts as user activation in same-origin navigation
    audio.play().catch(() => {
      audio.muted = true;
      audio.play()
        .then(() => setTimeout(() => {
          audio.muted = saved.muted ?? false;
          updateVolIcon();
        }, 80))
        .catch(() => waitForInteraction());
    });

    return true;
  }

  // ── Draggable FAB ────────────────────────────────────────────────────────
  function loadFabPos() {
    try { return JSON.parse(localStorage.getItem(FAB_POS_KEY)); } catch { return null; }
  }

  function saveFabPos(top, left) {
    try { localStorage.setItem(FAB_POS_KEY, JSON.stringify({ top, left })); } catch {}
  }

  function applyFabPos(fab, pos) {
    fab.style.top    = pos.top + 'px';
    fab.style.left   = pos.left + 'px';
    fab.style.bottom = 'auto';
    fab.style.right  = 'auto';
  }

  function positionPanel(fab, panel) {
    const fr = fab.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(258, vw - 28);

    if (fr.left < vw / 2) {
      panel.style.left  = Math.max(8, Math.min(fr.left, vw - pw - 8)) + 'px';
      panel.style.right = 'auto';
    } else {
      panel.style.right = Math.max(8, vw - fr.right) + 'px';
      panel.style.left  = 'auto';
    }

    if (fr.top > vh * 0.55) {
      panel.style.bottom = (vh - fr.top + 8) + 'px';
      panel.style.top    = 'auto';
    } else {
      panel.style.top    = (fr.bottom + 8) + 'px';
      panel.style.bottom = 'auto';
    }
  }

  function makeFabDraggable(fab, panel) {
    let dragStart  = null;
    let hasDragged = false;
    let rafId;

    function startDrag(cx, cy) {
      const fr = fab.getBoundingClientRect();
      dragStart  = { cx, cy, fabTop: fr.top, fabLeft: fr.left };
      hasDragged = false;
      fab.classList.add('dragging');
    }

    function moveDrag(cx, cy) {
      if (!dragStart) return;
      const dx = cx - dragStart.cx;
      const dy = cy - dragStart.cy;
      if (!hasDragged && Math.hypot(dx, dy) < 5) return;
      hasDragged = true;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newTop  = Math.max(8, Math.min(window.innerHeight - fab.offsetHeight - 8, dragStart.fabTop  + dy));
        const newLeft = Math.max(8, Math.min(window.innerWidth  - fab.offsetWidth  - 8, dragStart.fabLeft + dx));
        fab.style.top    = newTop + 'px';
        fab.style.left   = newLeft + 'px';
        fab.style.bottom = 'auto';
        fab.style.right  = 'auto';
      });
    }

    function endDrag() {
      if (!dragStart) return;
      fab.classList.remove('dragging');
      if (hasDragged) {
        const fr = fab.getBoundingClientRect();
        saveFabPos(fr.top, fr.left);
        if (panelOpen) positionPanel(fab, panel);
        fab.addEventListener('click', e => e.stopImmediatePropagation(), { once: true, capture: true });
      }
      dragStart = null;
    }

    fab.addEventListener('mousedown',  e => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup',   () => endDrag());

    fab.addEventListener('touchstart', e => {
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!dragStart) return;
      e.preventDefault();
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', () => endDrag());
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    // Start audio IMMEDIATELY before doing anything else — minimizes cross-page gap.
    const resumed = earlyResume();

    await loadPlaylist();
    buildUI();

    if (!songs.length) return;

    if (resumed) {
      // Audio already started — just sync the UI to what's playing.
      const saved = loadState();
      const idx = saved?.filename ? songs.findIndex(s => s.filename === saved.filename) : -1;
      currentIdx = idx >= 0 ? idx : (saved?.index || 0);
      updateVolSlider();
      updateUI();
      return;
    }

    // First visit or was not playing — normal init.
    const saved        = loadState();
    const overrideFile = CHAPTER_SONGS[curChapter];
    const overrideIdx  = overrideFile ? songs.findIndex(s => s.filename === overrideFile) : -1;

    if (overrideIdx >= 0) {
      loadSong(overrideIdx, DEFAULT_START_TIME);
      audio.play().catch(() => waitForInteraction());
    } else if (saved) {
      audio.volume = saved.volume ?? 0.5;
      audio.muted  = saved.muted  ?? false;
      loadSong(saved.index || 0, saved.time || 0);
      updateVolSlider();
      if (saved.playing) audio.play().catch(() => waitForInteraction());
    } else {
      audio.volume = 0.5;
      loadSong(0, DEFAULT_START_TIME);
      tryAutoplay(); // no delay — try immediately
    }
  }

  // ── Build UI ─────────────────────────────────────────────────────────────
  function buildUI() {
    const root = document.getElementById('music-player-root');
    if (!root) return;

    root.innerHTML = `
      <button class="music-fab" id="music-fab" aria-label="음악 플레이어">♪</button>
      <div class="music-panel" id="music-panel">
        ${songs.length ? `
          <div class="music-info">
            <div class="music-song-title"  id="music-title">—</div>
            <div class="music-song-artist" id="music-artist">—</div>
          </div>
          <div class="music-progress-wrap">
            <div class="music-progress-bar" id="music-progress-bar">
              <div class="music-progress-fill" id="music-progress-fill"></div>
            </div>
            <div class="music-time-row">
              <span id="music-time-cur">—:——</span>
              <span id="music-track-idx">—</span>
              <span id="music-time-dur">—:——</span>
            </div>
          </div>
          <div class="music-controls">
            <button class="music-ctrl-btn" id="music-prev" aria-label="이전">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            </button>
            <button class="music-ctrl-btn primary" id="music-play" aria-label="재생/정지">
              <svg id="play-icon-svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="music-ctrl-btn" id="music-next" aria-label="다음">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>
            </button>
          </div>
          <div class="music-volume-row">
            <button class="music-mute-btn" id="music-mute-btn" aria-label="음소거">
              <svg id="vol-icon-svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
            </button>
            <input type="range" class="music-volume-slider" id="music-vol" min="0" max="1" step="0.02" value="0.5">
          </div>
        ` : `
          <div class="music-no-songs">
            <div class="music-no-songs-icon">♪</div>
            audio/ 폴더에 노래를 넣고<br>playlist.json을 업데이트해줘
          </div>
        `}
      </div>
    `;

    const fab   = document.getElementById('music-fab');
    const panel = document.getElementById('music-panel');

    const savedPos = loadFabPos();
    if (savedPos) applyFabPos(fab, savedPos);

    makeFabDraggable(fab, panel);

    fab.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.classList.toggle('open', panelOpen);
      if (panelOpen && loadFabPos()) positionPanel(fab, panel);
    });

    if (!songs.length) return;

    document.getElementById('music-play').addEventListener('click', togglePlay);
    document.getElementById('music-prev').addEventListener('click', prevSong);
    document.getElementById('music-next').addEventListener('click', nextSong);

    const volSlider = document.getElementById('music-vol');
    volSlider.addEventListener('input', () => {
      audio.volume = parseFloat(volSlider.value);
      audio.muted  = false;
      updateVolIcon();
      saveState();
    });

    document.getElementById('music-mute-btn').addEventListener('click', () => {
      audio.muted = !audio.muted;
      updateVolIcon();
      saveState();
    });

    document.getElementById('music-progress-bar').addEventListener('click', e => {
      const bar = document.getElementById('music-progress-bar');
      if (!audio.duration || !bar) return;
      audio.currentTime = (e.offsetX / bar.offsetWidth) * audio.duration;
      saveState();
    });

    updateUI();
  }

  // ── UI updates ───────────────────────────────────────────────────────────
  function updateUI() {
    if (!songs.length) return;
    const s  = songs[currentIdx];
    const t  = document.getElementById('music-title');
    const ar = document.getElementById('music-artist');
    const tr = document.getElementById('music-track-idx');
    if (t)  t.textContent  = s.title;
    if (ar) ar.textContent = s.artist;
    if (tr) tr.textContent = `${currentIdx + 1} / ${songs.length}`;
    updatePlayBtn();
    updateFab();
  }

  function updatePlayBtn() {
    const svg = document.getElementById('play-icon-svg');
    if (!svg) return;
    svg.innerHTML = audio.paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  }

  function updateFab() {
    const fab = document.getElementById('music-fab');
    if (fab) fab.classList.toggle('playing', !audio.paused);
  }

  function updateVolIcon() {
    const svg = document.getElementById('vol-icon-svg');
    if (!svg) return;
    if (audio.muted || audio.volume === 0) {
      svg.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>';
    } else {
      svg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    }
    updateVolSlider();
  }

  function updateVolSlider() {
    const s = document.getElementById('music-vol');
    if (s) s.value = audio.muted ? 0 : audio.volume;
  }

  function fmt(s) {
    if (!s || isNaN(s)) return '—:——';
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  function updateProgress() {
    const fill = document.getElementById('music-progress-fill');
    const cur  = document.getElementById('music-time-cur');
    const dur  = document.getElementById('music-time-dur');
    if (fill && audio.duration) fill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    if (cur) cur.textContent = fmt(audio.currentTime);
    if (dur) dur.textContent = fmt(audio.duration);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
