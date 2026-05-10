'use strict';

const STORAGE_KEY = 'goo-restaurant-eva-progress';

function getProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { completed: [] }; }
  catch { return { completed: [] }; }
}
function markCompleted(id) {
  const p = getProgress();
  if (!p.completed.includes(id)) { p.completed.push(id); localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
}
function isCompleted(id) { return getProgress().completed.includes(id); }
function isUnlocked(id)  { return id === 1 || isCompleted(id - 1); }

const CHAPTERS = [
  { id: 1,  numeral: 'I',    title: '나란 사람',                       desc: '최구라는 사람에 대하여',          price: '용인 한 봉지' },
  { id: 2,  numeral: 'II',   title: '그러다가 만난 박은비란 사람',      desc: '우연히 열린 문',                  price: '디스코드 DM 1통' },
  { id: 3,  numeral: 'III',  title: '나의 심리적 변화',                 desc: '설레임 한 순간',                  price: '설레임 두 스쿱' },
  { id: 4,  numeral: 'IV',   title: '내가 생각하는 은비',               desc: '알맞은 단어를 찾다가',            price: '박은비 그 자체' },
  { id: 5,  numeral: 'V',    title: '내가 박은비를 좋아하게 된 15가지 이유', desc: '사실 216조 개가 더 있음',   price: '216조개 중 15개' },
  { id: 6,  numeral: 'VI',   title: '변명',                             desc: '아니 내 말 좀 들어보쇼',         price: '꼭대기 레스토랑 예약금' },
  { id: 7,  numeral: 'VII',  title: '그 사이에 우리에게 생겼던 일들',   desc: '그동안의 시간이 어떻게 흘렀는지',  price: '왕복 2시간 × ∞' },
  { id: 8,  numeral: 'VIII', title: '메인메뉴',                         desc: '드디어, 메인이야',                price: '최구의 심장 전부' },
  { id: 9,  numeral: 'IX',   title: '최구의 고민',                      desc: '새벽 한 시의 솔직한 마음',        price: '새벽 1:24 am' },
  { id: 10, numeral: 'X',    title: '마무리',                           desc: '그럼에도 불구하고',               price: 'See You Soon' },
];

function navigateTo(url) {
  const overlay = document.getElementById('page-transition');
  overlay.classList.add('active');
  setTimeout(() => { window.location.href = url; }, 280);
}

function showUnlockToast() {
  const t = document.getElementById('unlock-toast');
  if (!t) return;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function renderMenu() {
  const newlyUnlocked = sessionStorage.getItem('newly-unlocked');
  sessionStorage.removeItem('newly-unlocked');

  const items = CHAPTERS.map(ch => {
    const completed = isCompleted(ch.id);
    const unlocked  = isUnlocked(ch.id);
    const locked    = !unlocked;
    const isNew     = String(ch.id) === newlyUnlocked;
    const stateClass = completed ? 'completed' : unlocked ? 'unlocked' : 'locked';

    const inner = `
      <span class="menu-item-numeral">${ch.numeral}</span>
      <span class="menu-item-title">${ch.title}</span>
      <span class="menu-item-desc">${ch.desc}</span>
    `;

    if (locked) {
      return `<li class="menu-item ${stateClass}${isNew ? ' just-unlocked' : ''}" data-id="${ch.id}">
        <div class="menu-item-btn">${inner}</div></li>`;
    }
    return `<li class="menu-item ${stateClass}${isNew ? ' just-unlocked' : ''}" data-id="${ch.id}">
      <button class="menu-item-btn" onclick="navigateTo('chapters/ch${ch.id}.html')">${inner}</button></li>`;
  }).join('');

  const allDone = CHAPTERS.every(ch => isCompleted(ch.id));

  document.getElementById('app').innerHTML = `
    <div class="menu-page">
      <div class="menu-inner">
        <header class="menu-header">
          <div class="menu-ornament">
            <div class="menu-ornament-line"></div>
            <span class="menu-ornament-symbol">✦</span>
            <div class="menu-ornament-line right"></div>
          </div>
          <h1 class="restaurant-name">구네식당</h1>
          <p class="restaurant-name-ko">Goo's Restaurant</p>
          <div class="menu-divider"></div>
        </header>

        <section class="chef-note">
          <div class="chef-note-label">구네식당 오너셰프, Chef Goo</div>

          <p>안녕 은비야! 지금 잘 가고 있지?? 난 사실 조금 비행기 무서워하는데 너는 많이 타봐서 괜찮지?? 세상에서 제일 바쁜 우리 은비, 비행기에서의 시간이 제일 여유로울 것 같아서, 매일 그렇게 바쁘게 살아도 비행기 안에서만큼은 덜 바쁠 것 같아서. 내가 이렇게 준비해 봤어. 이거 다 보는데 시간이 조금은 걸릴 수 있으니까 혹시 지금 영화를 보고 있었던가 아니면 다른 걸 하고 있었다면, 시간 괜찮을 때 한 번에 봐줘..!!!</p>

          <p class="chef-note-announcement">승객 여러분 안녕하십니까!! 대한항공 KE 36, 애틀랜타에서 서울특별시로 향하는 이번 항공의 운전을 맡은 기장의 그냥 아는 사람입니다. 세상에서 제일 잘 이쁘게 드시고 이제 너무나도 배고프시다는 한 손님의 요청에 따라 추가 기내식이 나갈 예정입니다. 이 기내식은 스페셜 메뉴로 전 세계에서 단 한 손님에게만 나갈 겁니다. 그러니 다른 손님들은 쳐다도 보지 마시고, 제발 그 분만 편히 이 코스요리를 즐기기 바랍니다. </p>

          <p>오늘 코스는 10개의 요리로 준비되어 있습니다. 하나씩 음미하고 느끼시며 천천히 즐기셨으면 좋겠습니다.</p>

          <p class="chef-note-announcement">그리고 무엇보다도!!! 이거 핸드폰보다는 아이패드나 노트북에서 보는 걸 매우 강력히 추천드립니다. 그러니까 조금 귀찮더라도 잠시 일어나서 기기 교체를 요청드립니다!!!</p>

          <p>그리고 여기 음악도 준비가 되어 있으니, 편하시게 기호에 맞게 시청 부탁드립니다. 근데 너 성격상 노래같이 듣는 게 뭔가 정신없을 수 있으니까 그냥 안 틀어도 되고...</p>

          <p>자! 이제 준비가 다 되셨나요? 편안한 시간이 되시길 바랍니다~~~!!! 지금까지 기장을 사칭한 최구였습니다…!!!!</p>

          <div class="chef-note-sig">— Chef Goo, 구네식당</div>
        </section>

        <p class="menu-section-label">Tasting Course — 10 Courses</p>
        <ul class="menu-list">${items}</ul>

        <div class="menu-footer">
          ${allDone
            ? `<p class="menu-footer-quote">"Never say goodbye because goodbye means going away<br>and going away means forgetting."</p>
               <p class="menu-footer-from">— 최구 드림, 2026</p>`
            : `<p class="menu-footer-quote">첫 번째 코스부터 시작해줘 :)</p>
               <p class="menu-footer-from">— 최구 드림</p>`}
        </div>
      </div>
    </div>
  `;

  if (newlyUnlocked) {
    const el = document.querySelector(`[data-id="${newlyUnlocked}"]`);
    if (el) setTimeout(() => el.classList.remove('just-unlocked'), 1600);
    showUnlockToast();
  }
}

window.addEventListener('DOMContentLoaded', renderMenu);
