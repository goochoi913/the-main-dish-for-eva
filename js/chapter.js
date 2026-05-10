'use strict';

// This file runs when a chapter HTML is opened directly (not via SPA).
// In normal use, the SPA (app.js) handles everything and this file is not executed.
(function () {
  var id    = parseInt(document.body.dataset.chapter || '1', 10);
  var total = parseInt(document.body.dataset.total   || '10', 10);
  var STORAGE_KEY = 'goo-restaurant-eva-progress';

  // Page transition fade-in
  var trans = document.getElementById('page-transition');
  if (trans) requestAnimationFrame(function () { trans.classList.remove('active'); });

  // Reading progress bar
  var bar = document.getElementById('reading-progress');
  if (bar) {
    window.addEventListener('scroll', function () {
      var h   = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? Math.min(100, h.scrollTop / max * 100) : 0) + '%';
    }, { passive: true });
  }

  // Animate-in via IntersectionObserver
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.animate-in').forEach(function (el) { observer.observe(el); });

  // Progress helpers
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { completed: [] }; }
    catch { return { completed: [] }; }
  }
  function markCompleted(chId) {
    var p = getProgress();
    if (!Array.isArray(p.completed)) p.completed = [];
    if (!p.completed.includes(chId)) { p.completed.push(chId); localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
  }

  // Complete button
  var wrap = document.getElementById('complete-btn-wrap');
  var btn  = document.getElementById('complete-btn');
  if (wrap && btn) {
    var p        = getProgress();
    var unlocked = Array.isArray(p.completed) && p.completed.includes(id);
    if (unlocked) wrap.classList.add('unlocked');

    window.addEventListener('scroll', function () {
      if (unlocked) return;
      var h = document.documentElement;
      if (h.scrollHeight <= h.clientHeight + 10 || h.scrollTop / (h.scrollHeight - h.clientHeight) > 0.8) {
        unlocked = true;
        wrap.classList.add('unlocked');
        markCompleted(id);
      }
    }, { passive: true });

    btn.addEventListener('click', function () {
      markCompleted(id);
      if (id >= total) {
        window.location.href = '../index.html';
      } else {
        sessionStorage.setItem('newly-unlocked', String(id + 1));
        window.location.href = 'ch' + (id + 1) + '.html';
      }
    });
  }
})();
