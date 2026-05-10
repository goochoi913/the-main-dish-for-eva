'use strict';

(function () {
  // ── Helpers (mirrors menu.js so available without import) ─────────────────
  const STORAGE_KEY = 'goo-restaurant-eva-progress';

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { completed: [] }; }
    catch { return { completed: [] }; }
  }

  // ── Page transition ───────────────────────────────────────────────────────
  function showTransition() {
    const t = document.getElementById('page-transition');
    if (t) t.classList.add('active');
  }
  function hideTransition() {
    const t = document.getElementById('page-transition');
    if (t) requestAnimationFrame(() => t.classList.remove('active'));
  }

  // ── Shell chrome (back button + progress bar) ─────────────────────────────
  function setChapterShell(visible) {
    const back = document.getElementById('chapter-back');
    const bar  = document.getElementById('reading-progress');
    if (back) back.style.display = visible ? '' : 'none';
    if (bar)  bar.style.width   = '0%';
  }

  // ── Load chapter via fetch — audio element is never destroyed ─────────────
  function loadChapter(id) {
    showTransition();
    fetch('chapters/ch' + id + '.html')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const app = document.getElementById('app');
        app.innerHTML = '';

        const hero    = doc.querySelector('header.chapter-hero');
        const content = doc.querySelector('main.chapter-content');
        const footer  = doc.querySelector('footer.chapter-footer');
        if (hero)    app.appendChild(document.adoptNode(hero));
        if (content) app.appendChild(document.adoptNode(content));
        if (footer)  app.appendChild(document.adoptNode(footer));

        document.body.dataset.chapter = id;
        document.body.dataset.total   = doc.body.dataset.total || '10';

        setChapterShell(true);
        window.scrollTo(0, 0);
        initChapter(id);
        hideTransition();
        window.dispatchEvent(new CustomEvent('goo:route-rendered'));
      })
      .catch(function () { hideTransition(); });
  }

  // ── Load menu ─────────────────────────────────────────────────────────────
  function loadMenu() {
    showTransition();
    document.body.dataset.chapter = '0';
    setChapterShell(false);
    cleanupChapterListeners();
    if (typeof renderMenu === 'function') renderMenu();
    window.scrollTo(0, 0);
    hideTransition();
    window.dispatchEvent(new CustomEvent('goo:route-rendered'));
  }

  // ── Chapter scroll listener cleanup ──────────────────────────────────────
  var _progressFn     = null;
  var _scrollUnlockFn = null;

  function cleanupChapterListeners() {
    if (_progressFn)     { window.removeEventListener('scroll', _progressFn);     _progressFn = null; }
    if (_scrollUnlockFn) { window.removeEventListener('scroll', _scrollUnlockFn); _scrollUnlockFn = null; }
  }

  // ── Chapter init (runs after content is injected into #app) ───────────────
  function initChapter(id) {
    cleanupChapterListeners();

    // Reading progress bar
    var bar = document.getElementById('reading-progress');
    _progressFn = function () {
      if (!bar) return;
      var h   = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? Math.min(100, h.scrollTop / max * 100) : 0) + '%';
    };
    window.addEventListener('scroll', _progressFn, { passive: true });

    // Animate-in via IntersectionObserver
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.animate-in').forEach(function (el) { observer.observe(el); });

    // Complete button
    var wrap  = document.getElementById('complete-btn-wrap');
    var btn   = document.getElementById('complete-btn');
    if (!wrap || !btn) return;

    var total  = parseInt(document.body.dataset.total || '10', 10);
    var isLast = id >= total;
    var p      = getProgress();
    var done   = Array.isArray(p.completed) && p.completed.includes(id);
    if (done) wrap.classList.add('visible');

    var unlocked = done;

    function unlock() {
      if (unlocked) return;
      unlocked = true;
      wrap.classList.add('visible');
      if (typeof markCompleted === 'function') markCompleted(id);
    }

    _scrollUnlockFn = function () {
      if (unlocked) return;
      var h = document.documentElement;
      if (h.scrollHeight <= h.clientHeight + 10) { unlock(); return; }
      if (h.scrollTop / (h.scrollHeight - h.clientHeight) > 0.8) unlock();
    };
    window.addEventListener('scroll', _scrollUnlockFn, { passive: true });

    // Swap button node to clear any prior listeners from the previous chapter
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener('click', function () {
      if (typeof markCompleted === 'function') markCompleted(id);
      if (isLast) {
        loadMenu();
      } else {
        sessionStorage.setItem('newly-unlocked', String(id + 1));
        loadChapter(id + 1);
      }
    });
  }

  // ── Override menu.js navigateTo for SPA routing ───────────────────────────
  // menu.js defines navigateTo as a global. We overwrite it so chapter clicks
  // go through fetch-routing instead of full page navigation.
  // Music in the shell (index.html) is never interrupted.
  window.navigateTo = function (url) {
    var m = url.match(/ch(\d+)\.html/);
    if (m) loadChapter(parseInt(m[1], 10));
    else   loadMenu();
  };

  // ── Back button wiring + initial transition clear ─────────────────────────
  // menu.js registers its DOMContentLoaded listener first (loaded before app.js),
  // so renderMenu() already ran by the time this fires.
  document.addEventListener('DOMContentLoaded', function () {
    var back = document.getElementById('chapter-back');
    if (back) {
      back.addEventListener('click', function (e) {
        e.preventDefault();
        loadMenu();
      });
    }
    // Remove the initial page-transition overlay (added in HTML to prevent flash).
    hideTransition();
  });

  window.App = { loadChapter: loadChapter, loadMenu: loadMenu };
})();
