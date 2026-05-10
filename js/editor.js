'use strict';

(function () {
  const DB_NAME       = 'goo-restaurant-editor';
  const DB_VER        = 2;
  const STICKER_STORE = 'stickers';
  const INLINE_STORE  = 'inline-images';
  const MIN_GUTTER_VW = 1000;
  const STICKER_W     = 160;
  // All possible chapter keys for full export
  const ALL_CHAPTER_IDS = ['menu', '1','2','3','4','5','6','7','8','9','10'];

  let db;
  let stickers   = [];
  let editActive = false;

  function getChapterId() {
    const fromBody = document.body.dataset.chapter;
    if (fromBody && fromBody !== '0') return fromBody;
    return 'menu';
  }

  let chapterId = getChapterId();

  // ── IndexedDB ─────────────────────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STICKER_STORE)) d.createObjectStore(STICKER_STORE);
        if (!d.objectStoreNames.contains(INLINE_STORE))  d.createObjectStore(INLINE_STORE);
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function dbGet(store, key) {
    return new Promise(resolve => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror   = ()  => resolve(null);
    });
  }

  function dbPut(store, value, key) {
    if (!db) return;
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
  }

  async function loadStickers(chId) {
    try {
      db = await openDB();
      const raw = (await dbGet(STICKER_STORE, chId)) || [];
      return raw.filter(s => s.anchorIdx != null);
    } catch { return []; }
  }

  function saveStickers() {
    dbPut(STICKER_STORE, stickers, chapterId);
  }

  // ── Committed stickers (from git / GitHub Pages) ──────────────────────────
  // Fetches images/stickers/sticker-config.json if it exists.
  // This is what Eva sees — Goo generates it with the Export button and commits it.
  async function loadCommittedStickers(chId) {
    try {
      const isChapter = window.location.pathname.includes('/chapters/');
      const base = isChapter ? '../' : '';
      const res = await fetch(base + 'images/stickers/sticker-config.json', { cache: 'no-cache' });
      if (!res.ok) return [];
      const all = await res.json();
      return (all[chId] || []).filter(s => s.anchorIdx != null);
    } catch { return []; }
  }

  // ── HEIC / file helpers ───────────────────────────────────────────────────
  async function convertIfHeic(file) {
    if (/\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif') {
      if (typeof heic2any === 'undefined') { alert('HEIC 변환을 위해 인터넷 연결이 필요해요.'); return null; }
      try {
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.88 });
        return Array.isArray(blob) ? blob[0] : blob;
      } catch { return null; }
    }
    return file;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ── Anchor elements ───────────────────────────────────────────────────────
  function getAnchors() {
    return Array.from(document.querySelectorAll('.chapter-content > *'));
  }

  // ── Position calculation ──────────────────────────────────────────────────
  function getStickerPos(anchorIdx, side) {
    const anchors   = getAnchors();
    const anchor    = anchors[anchorIdx];
    const contentEl = document.querySelector('.chapter-content');
    if (!anchor || !contentEl) return null;

    const aRect = anchor.getBoundingClientRect();
    const cRect = contentEl.getBoundingClientRect();
    const scrollTop = window.scrollY || 0;

    const y = aRect.top + scrollTop;
    const x = side === 'left'
      ? cRect.left - STICKER_W - 20
      : cRect.right + 20;

    if (x < 0 || x + STICKER_W > document.documentElement.clientWidth) return null;
    return { x, y };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function getLayer() { return document.getElementById('sticker-layer'); }

  function renderAll() {
    const layer = getLayer();
    if (!layer) return;
    layer.innerHTML = '';

    if (document.documentElement.clientWidth < MIN_GUTTER_VW) return;

    if (editActive) renderSlots(layer);

    stickers.forEach(s => {
      const el = makeStickerEl(s);
      if (el) layer.appendChild(el);
    });
  }

  function renderSlots(layer) {
    getAnchors().forEach((_, i) => {
      ['left', 'right'].forEach(side => {
        const pos = getStickerPos(i, side);
        if (!pos) return;

        const btn = document.createElement('button');
        btn.className = `margin-slot-btn margin-slot-${side}`;
        btn.style.left  = pos.x + 'px';
        btn.style.top   = pos.y + 'px';
        btn.style.width = STICKER_W + 'px';
        btn.textContent = '+';
        btn.title = '스티커 추가';
        btn.addEventListener('click', () => addStickerAt(i, side));
        layer.appendChild(btn);
      });
    });
  }

  function stickerImgSrc(s) {
    if (s.dataUrl) return s.dataUrl;
    // Committed stickers store a file path in s.src
    const isChapter = window.location.pathname.includes('/chapters/');
    const base = isChapter ? '../' : '';
    return base + s.src;
  }

  function makeStickerEl(s) {
    const pos = getStickerPos(s.anchorIdx, s.side);
    if (!pos) return null;

    const el = document.createElement('div');
    el.className  = 'margin-sticker';
    el.dataset.id = s.id;
    el.style.left      = pos.x + 'px';
    el.style.top       = pos.y + 'px';
    el.style.width     = STICKER_W + 'px';
    el.style.transform = `rotate(${s.rotation || 0}deg)`;

    const img = document.createElement('img');
    img.src = stickerImgSrc(s);
    img.draggable = false;
    el.appendChild(img);

    if (editActive) {
      const del = document.createElement('button');
      del.className   = 'margin-sticker-delete';
      del.textContent = '×';
      del.title = '삭제';
      del.addEventListener('click', e => { e.stopPropagation(); deleteSticker(s.id); });
      el.appendChild(del);
    } else {
      // Non-edit mode: click opens lightbox
      el.addEventListener('click', () => openLightbox(el, stickerImgSrc(s), s.rotation || 0));
    }

    return el;
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────
  // FLIP animation: image slides from sticker's position to center of screen.
  function openLightbox(stickerEl, dataUrl, rotation) {
    const existing = document.getElementById('sticker-lightbox');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sticker-lightbox';
    overlay.className = 'sticker-lightbox';

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.opacity  = '0';
    img.style.transition = 'none';
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    function startAnimation() {
      // "Last" position: image centered by CSS (read its rect)
      const finalRect = img.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // "First" position: the sticker's location
      const sRect = stickerEl.getBoundingClientRect();

      // Calculate transform: from final → first (FLIP invert)
      const fromX  = (sRect.left + sRect.width / 2) - (finalRect.left + finalRect.width / 2);
      const fromY  = (sRect.top  + sRect.height / 2) - (finalRect.top  + finalRect.height / 2);
      const scale  = Math.min(sRect.width / Math.max(finalRect.width, 1),
                              sRect.height / Math.max(finalRect.height, 1));

      // Apply inverted state (looks like it's at the sticker)
      img.style.transform = `translate(${fromX}px, ${fromY}px) scale(${scale}) rotate(${rotation}deg)`;
      img.style.opacity = '0.6';

      // Force reflow so the starting state is painted before transition
      img.offsetHeight;

      // Animate to center
      img.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.35, 0.64, 1), opacity 0.25s ease';
      overlay.classList.add('open');
      img.style.transform = 'translate(0,0) scale(1) rotate(0deg)';
      img.style.opacity   = '1';

      function close() {
        img.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.22s ease';
        img.style.transform  = `translate(${fromX}px, ${fromY}px) scale(${scale}) rotate(${rotation}deg)`;
        img.style.opacity    = '0';
        overlay.classList.remove('open');
        img.addEventListener('transitionend', () => overlay.remove(), { once: true });
      }

      overlay.addEventListener('click', close);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
    }

    // Need image natural dimensions for the FLIP calculation
    if (img.naturalWidth) {
      startAnimation();
    } else {
      img.onload = startAnimation;
    }
  }

  // ── Add / delete stickers ─────────────────────────────────────────────────
  async function addStickerAt(anchorIdx, side) {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.jpg,.jpeg,.png,.heic,.heif,image/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const converted = await convertIfHeic(file);
      if (!converted) return;
      const dataUrl = await fileToDataUrl(converted);
      stickers.push({
        id:        'sticker-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        anchorIdx,
        side,
        rotation:  +(Math.random() * 10 - 5).toFixed(1),
        dataUrl,
      });
      saveStickers();
      renderAll();
    });
    input.click();
  }

  function deleteSticker(id) {
    stickers = stickers.filter(s => s.id !== id);
    saveStickers();
    renderAll();
  }

  // ── Export all chapters → sticker-config.json ─────────────────────────────
  // Collects stickers from ALL chapter pages from IndexedDB, downloads as JSON.
  // User places the file at images/stickers/sticker-config.json and commits to GitHub.
  async function exportAllStickers() {
    if (!db) return;
    const all = {};
    for (const chId of ALL_CHAPTER_IDS) {
      const raw = (await dbGet(STICKER_STORE, chId)) || [];
      const valid = raw.filter(s => s.anchorIdx != null);
      if (valid.length) all[chId] = valid;
    }

    // Also include current page's stickers (might not be saved yet)
    if (stickers.length) all[chapterId] = stickers;

    if (!Object.keys(all).length) {
      alert('저장된 스티커가 없어요. 먼저 + 버튼으로 사진을 추가해주세요.');
      return;
    }

    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'sticker-config.json';
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      alert('✓ sticker-config.json 다운로드 완료!\n\n이 파일을 images/stickers/ 폴더에 넣고 GitHub에 올리면 Eva도 볼 수 있어.');
    }, 300);
  }

  // ── Inline image editing ──────────────────────────────────────────────────
  async function loadInlineImages() {
    if (!db) return;
    const figs = document.querySelectorAll('.chapter-image');
    for (let i = 0; i < figs.length; i++) {
      const dataUrl = await dbGet(INLINE_STORE, `${chapterId}-img-${i}`);
      if (dataUrl) {
        const fig = figs[i];
        const img = fig.querySelector('img');
        if (img) { img.src = dataUrl; fig.classList.remove('no-img'); }
      }
    }
  }

  function setupInlineEditing() {
    document.querySelectorAll('.chapter-image').forEach((fig, i) => {
      if (fig.querySelector('.fig-edit-overlay')) return;
      const overlay = document.createElement('div');
      overlay.className = 'fig-edit-overlay';
      overlay.innerHTML = '<span>📷 사진 바꾸기</span>';
      overlay.addEventListener('click', e => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = '.jpg,.jpeg,.png,.heic,.heif,image/*';
        input.addEventListener('change', async () => {
          const file = input.files[0];
          if (!file) return;
          const converted = await convertIfHeic(file);
          if (!converted) return;
          const dataUrl = await fileToDataUrl(converted);
          const img = fig.querySelector('img');
          if (img) { img.src = dataUrl; fig.classList.remove('no-img'); }
          dbPut(INLINE_STORE, dataUrl, `${chapterId}-img-${i}`);
        });
        input.click();
      });
      fig.appendChild(overlay);
    });
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  function setEditMode(active) {
    editActive = active;
    document.body.classList.toggle('edit-active', active);
    const btn = document.getElementById('edit-toggle');
    if (btn) btn.classList.toggle('active', active);

    const hint = document.querySelector('.edit-panel-hint');
    if (hint) {
      hint.textContent = active
        ? '마진의 + 버튼으로 사진 추가 (데스크탑 전용)'
        : '';
    }

    const uploadLabel = document.querySelector('.edit-upload-label');
    if (uploadLabel) uploadLabel.style.display = active ? 'none' : '';

    setupInlineEditing();
    renderAll();
  }

  async function loadChapterData() {
    chapterId = getChapterId();
    const local = await loadStickers(chapterId);
    const committed = await loadCommittedStickers(chapterId);
    stickers = local.length > 0 ? local : committed;
  }

  async function refreshForRoute() {
    await loadChapterData();
    renderAll();
    await loadInlineImages();
    setupInlineEditing();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    await loadChapterData(); // opens IndexedDB
    renderAll();
    await loadInlineImages();

    document.getElementById('edit-toggle')
      ?.addEventListener('click', () => setEditMode(!editActive));

    document.getElementById('edit-clear-btn')
      ?.addEventListener('click', () => {
        if (confirm('이 페이지의 모든 스티커를 삭제할까요?')) {
          stickers = []; saveStickers(); renderAll();
        }
      });

    // Inject export button into the edit panel (once)
    const panel = document.querySelector('.edit-panel');
    if (panel && !panel.querySelector('.edit-export-btn')) {
      const exportBtn = document.createElement('button');
      exportBtn.className   = 'edit-export-btn';
      exportBtn.textContent = '💾 GitHub 저장';
      exportBtn.title = '모든 스티커를 JSON으로 내보내기 (GitHub용)';
      exportBtn.addEventListener('click', exportAllStickers);
      panel.appendChild(exportBtn);
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderAll, 80);
    });

    // SPA route changes (index.html#chapter-X) should refresh sticker data
    window.addEventListener('goo:route-rendered', () => { refreshForRoute(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
