// DV3 Atlas — 화면 동작 (교배 조합 · 부모로 예측 · 최단 루트 · 시도·비용 · 타이머 · 컬렉션)
(function () {
  'use strict';
  const E = window.DV3Engine, META = window.DV3_META, ALL = window.DV3_DRAGONS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dv3lab.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('dv3lab.' + k, JSON.stringify(v)); } catch {} },
  };
  const byId = E.byId();
  const img = (d) => d.img || `images/dragons/${d.code}.webp`;
  const elColor = (d) => META.elements[d.elements[0]]?.color ?? '#ccc';
  const face = (d, cls = '') => `<img class="face ${cls}" src="${img(d)}" alt="" loading="lazy" style="--c:${elColor(d)}" onerror="this.outerHTML='<div class=\\'face txt ${cls}\\' style=\\'--c:${elColor(d)};width:'+this.width+'px;height:'+this.height+'px\\'>${esc(d.name[0])}</div>'">`;
  const pct = (p) => (p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p.toFixed(3)) + '%';
  const probClass = (p) => (p >= 30 ? 'hi' : p >= 12 ? 'mid' : 'lo');
  const rarity = (d) => META.rarity[d.rarity] ?? `R${d.rarity}`;
  const elChips = (d) => `<span class="els">${d.elements.map((e) => { const m = META.elements[e] || { ko: e, color: '#888' }; return `<span class="el" style="--c:${m.color}"><i></i>${esc(m.ko)}</span>`; }).join('')}</span>`;
  const obtainable = E.obtainable;
  const num = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '∞';
  // 골드는 게임 표기처럼 K·M 단위로: 1만 미만은 그대로, 1만 이상은 32.6K, 100만 이상은 1.23M
  const gold = (n) => { if (!Number.isFinite(n)) return '∞'; const trim = (s) => s.replace(/\.?0+$/, ''); return n >= 1e6 ? trim((n / 1e6).toFixed(2)) + 'M' : n >= 1e4 ? trim((n / 1e3).toFixed(1)) + 'K' : num(n); };

  const TARGETS = ALL.filter((d) => d.tier >= 3).sort((a, b) => a.tier - b.tier || a.id - b.id);
  const PARENTS = E.parents();
  const STARTERS = ALL.filter((d) => d.tier <= 2 && d.canBreed).map((d) => d.id);

  const state = {
    view: 'breed', target: null, co: [], have: null,
    royal: store.get('royal', 0), guild: store.get('guildGrade', 0), userLv: store.get('userLv', null), sort: store.get('sort', 'prob-desc'),
    minProb: 0, mine: store.get('mine', false), owned: new Set(store.get('owned', [])), shown: 60, recent: [], // 최근 검색은 저장하지 않음(링크로 열면 항상 초기 화면)
    noBook: new Set(store.get('noBook', [])), // 비밀 교배서가 없어 후보에서 뺄 드래곤 id
    pA: null, pB: null, routeTarget: null, routeFrom: 'owned', tmA: null, tmB: null,
    timers: store.get('timers', []),
  };
  let recipes = [], view = [], expandedKeys = new Set();
  const opts = () => ({ userLv: state.userLv || 999, rateUp: E.activeRateUp(), exclude: state.noBook });
  // 비밀 교배서로만 교배 목록에 추가되는 드래곤: 교배서가 없으면 후보에서 빠져 같은 티어 확률이 달라진다
  const BOOKS = ALL.filter((d) => d.book || (!d.canBreed && !d.reqParentEle && obtainable(d)));
  const guildOf = () => META.guild.find((g) => g.id === +state.guild);
  const rsec = (s) => E.royalSec(s, state.royal, guildOf()?.pct || 0);
  const cutPct = () => Math.round(((META.royal.find((r) => r.id === +state.royal)?.pct || 0) + (guildOf()?.pct || 0)) * 1000) / 10;

  // ───────── 공통: 검색 콤보박스 ─────────
  function combobox({ input, list, items, onPick, ownedTag = true }) {
    let cur = -1, rows = [];
    const render = (q) => {
      const s = q.trim().toLowerCase();
      rows = items().filter((d) => !s || d.name.toLowerCase().includes(s) || d.code.includes(s));
      if (s) rows.sort((a, b) => (+!a.name.toLowerCase().startsWith(s)) - (+!b.name.toLowerCase().startsWith(s)) || a.tier - b.tier || a.id - b.id);
      cur = rows.length ? 0 : -1;
      list.innerHTML = rows.length
        ? rows.slice(0, 80).map((d, i) => `<button type="button" class="opt" role="option" data-id="${d.id}" aria-selected="${i === cur}"><img src="${img(d)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="nm">${esc(d.name)}${ownedTag && state.owned.has(d.id) ? ' <span class="own">보유</span>' : ''}</span>${elChips(d)}<span class="tier">T${d.tier}</span>${obtainable(d) || !TARGETS.includes(d) ? '' : '<span class="na">교배 획득 불가</span>'}</button>`).join('')
        : '<div class="none">검색 결과가 없습니다</div>';
    };
    const open = () => { render(input.value); list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const pick = (id) => { const d = byId.get(id); if (!d) return; close(); onPick(d); };
    input.addEventListener('focus', () => { input.select(); open(); });
    input.addEventListener('input', open);
    input.addEventListener('keydown', (e) => {
      if (list.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) open();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!rows.length) return;
        cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        $$('.opt', list).forEach((el, i) => el.setAttribute('aria-selected', String(i === cur)));
        list.querySelector('.opt[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); if (cur >= 0 && rows[cur]) pick(rows[cur].id); }
      else if (e.key === 'Escape') { close(); input.blur(); }
    });
    list.addEventListener('mousedown', (e) => { const b = e.target.closest('.opt'); if (b) { e.preventDefault(); pick(+b.dataset.id); } });
    document.addEventListener('click', (e) => { if (!input.parentElement.contains(e.target)) close(); });
  }

  // ───────── 뷰 전환 ─────────
  const VIEWS = ['breed', 'predict', 'route', 'tries', 'timer', 'collection', 'colo', 'arena', 'meta', 'dex', 'gems', 'gacha', 'odds', 'stats']; // stats 는 탭에 없는 관리자용(#stats)
  function showView(name, push = true) {
    if (!VIEWS.includes(name)) name = 'breed';
    state.view = name;
    for (const v of VIEWS) $('#view-' + v).hidden = v !== name;
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === name));
    if (push) { try { history.replaceState(null, '', location.pathname + location.search + '#' + name); } catch {} }
    ({ predict: renderPredict, route: renderRoute, tries: renderTries, timer: renderTimers, collection: renderCollection, colo: renderColo, arena: renderArena, meta: renderMeta, stats: renderStats, dex: renderDex, gems: renderGems, gacha: renderGacha, odds: renderOdds })[name]?.();
    window.scrollTo({ top: 0 });
    trackVisit(name);
  }
  // 방문자 집계: 탭을 볼 때마다 집계 워커(tools/counter-worker)에 신호만 보낸다. IP 는 워커가 그날의 소금과 해시해 방문자 구분에만 쓰고 저장하지 않는다.
  const COUNTER = 'https://dv3-atlas-counter.pet-receipt-server.workers.dev';
  const trackVisit = (name) => { if (location.protocol !== 'https:' || name === 'stats') return; try { fetch(`${COUNTER}/hit?p=${encodeURIComponent(name)}`, { method: 'POST', mode: 'cors', keepalive: true }).catch(() => {}); } catch {} };
  // 관리자용 방문자 통계(#stats): 키가 맞아야 집계 서버가 답한다. 키는 localStorage 에만 둔다.
  const TABS_KO = { breed: '교배 조합', predict: '부모로 예측', route: '최단 루트', tries: '시도·비용', timer: '타이머', collection: '내 컬렉션', colo: '콜로 방어덱', arena: '아레나', meta: '아레나 통계', dex: '드래곤 도감', gems: '젬 강화·추천', gacha: '뽑기 계산', odds: '공식 확률표', stats: '방문자 통계' };
  async function renderStats() {
    const out = $('#statsOut'), keyEl = $('#statsKey');
    let key = ''; try { key = localStorage.getItem('dv3.statsKey') || ''; } catch {}
    if (keyEl.value === '' && key) keyEl.value = key;
    key = keyEl.value.trim(); if (!key) { out.innerHTML = '<p class="note">키를 넣고 불러오기를 누르세요.</p>'; return; }
    out.innerHTML = '<p class="note">불러오는 중…</p>';
    let s; try { const r = await fetch(`${COUNTER}/stats`, { headers: { 'X-Stats-Key': key } }); if (r.status === 403) { out.innerHTML = '<p class="notice warn">키가 맞지 않습니다.</p>'; return; } s = await r.json(); } catch { out.innerHTML = '<p class="notice warn">집계 서버에 연결하지 못했습니다.</p>'; return; }
    try { localStorage.setItem('dv3.statsKey', key); } catch {}
    const days = s.days.slice().reverse(), maxUv = Math.max(1, ...days.map((d) => d.uv));
    const week = days.slice(-7), sum = (a, k) => a.reduce((x, d) => x + d[k], 0);
    out.innerHTML = `<div class="summary">
        <div class="stat"><div class="k">오늘 방문자</div><div class="v">${num(s.today.uv)}</div><div class="s">페이지뷰 ${num(s.today.pv)} · ${esc(s.today.day)}</div></div>
        <div class="stat"><div class="k">최근 7일 방문자</div><div class="v">${num(sum(week, 'uv'))}</div><div class="s">페이지뷰 ${num(sum(week, 'pv'))}</div></div>
        <div class="stat"><div class="k">전체 방문자</div><div class="v">${num(s.total.uv)}</div><div class="s">페이지뷰 ${num(s.total.pv)} · 집계 시작 ${esc(days[0]?.day || '-')}</div></div>
      </div>
      <h3 style="font-family:var(--serif);font-size:15px;color:var(--gold);margin:14px 0 8px">날짜별 (최근 30일) <span class="hint">막대는 방문자, 숫자는 방문자 / 페이지뷰</span></h3>
      <div class="trend">${days.map((d) => `<div class="tr"><span class="mono">${esc(d.day)}</span><div class="bar"><i style="width:${(d.uv / maxUv * 100).toFixed(1)}%"></i></div><b>${num(d.uv)} / ${num(d.pv)}</b></div>`).join('') || '<p class="note">아직 기록이 없습니다.</p>'}</div>
      <h3 style="font-family:var(--serif);font-size:15px;color:var(--gold);margin:14px 0 8px">오늘 많이 본 탭</h3>
      <div class="chips">${s.pages.map((p) => `<span class="chip">${esc(TABS_KO[p.path] || p.path)} <b class="mono">${num(p.n)}</b></span>`).join('') || '<p class="note">아직 없음</p>'}</div>
      <p class="note" style="margin-top:10px">방문자는 접속 정보를 그날의 임의 값과 섞은 해시로 구분한 하루 단위 수치이고, 페이지뷰는 탭을 연 횟수입니다. 원본 주소는 저장하지 않습니다.</p>`;
  }
  window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'breed', false));

  // ───────── 드래곤 도감 (data/dex.js: 능력치·스킬) ─────────
  const DEX = window.DV3_DEX || {}, GM = window.DV3_GEMS;
  const STAT_KEYS = ['hp', 'atk', 'def', 'mag', 'mr', 'spd'], STAT_KO = { hp: '체력', atk: '공격', def: '방어', mag: '마력', mr: '저항', spd: '속도' };
  const dexOf = (d) => DEX[d.id];
  const DEX_VALS = Object.values(DEX), STAT_MAX = STAT_KEYS.map((k, i) => Math.max(1, ...DEX_VALS.map((x) => x.st[i])));
  const pctl = (i, v) => DEX_VALS.filter((x) => x.st[i] <= v).length / Math.max(1, DEX_VALS.length); // 전체 종 중 이 값 이하의 비율
  const dexState = { q: '', el: 'all', rar: 'all', get: 'all', sort: 'tier' };
  function renderDex() {
    const q = dexState.q.trim().toLowerCase(), si = STAT_KEYS.indexOf(dexState.sort);
    const sv = (d) => { const x = dexOf(d); return !x ? -1 : dexState.sort === 'sum' ? x.st.reduce((a, b) => a + b, 0) : x.st[si]; };
    const list = ALL.filter((d) => (!q || d.name.toLowerCase().includes(q) || d.code.includes(q)) && (dexState.el === 'all' || d.elements.includes(dexState.el)) && (dexState.rar === 'all' || d.rarity === +dexState.rar)
      && (dexState.get === 'all' || (dexState.get === 'breed' ? obtainable(d) : dexState.get === 'other' ? !obtainable(d) : state.owned.has(d.id))));
    list.sort(dexState.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ko') : dexState.sort === 'tier' ? (a, b) => b.tier - a.tier || b.rarity - a.rarity || a.id - b.id : (a, b) => sv(b) - sv(a));
    const showV = !['tier', 'name'].includes(dexState.sort);
    $('#dexCount').textContent = `${list.length}종 / 전체 ${ALL.length}종`;
    $('#dexGrid').innerHTML = list.length ? list.map((d) => `<button type="button" class="dex-c r${d.rarity}" data-id="${d.id}"><span class="t">T${d.tier}</span>${state.owned.has(d.id) ? '<span class="own">보유</span>' : ''}${face(d)}<div class="nm">${esc(d.name)}</div>${elChips(d)}${showV && dexOf(d) ? `<div class="sv">${dexState.sort === 'sum' ? '합계' : STAT_KO[dexState.sort]} ${num(sv(d))}</div>` : ''}</button>`).join('') : '<div class="empty">조건에 맞는 드래곤이 없습니다.</div>';
  }
  const skillHtml = (label, s) => s ? `<div class="skill"><b>${label} · ${esc(s.n)}</b> <span class="tag ${s.k === 'mag' ? 'pin' : 'up'}">${s.k === 'mag' ? '마법' : '물리'}</span><span class="tag gold">위력 ${s.p}</span>${s.once ? '<span class="tag new">전투당 1회</span>' : ''}<p>${esc(s.d)}</p></div>` : '';
  function openDex(d) {
    const x = dexOf(d), dlg = $('#dexDlg'); dlg.dataset.id = d.id;
    const cond = []; if (d.reqUserLv > 1) cond.push(`테이머 Lv ${d.reqUserLv}`); if (d.reqEleIds?.length) cond.push(`부모 속성에 ${d.reqEleIds.map((e) => META.elements[e]?.ko || e).join('·')} 포함`); if (d.reqEleCnt) cond.push(`부모 속성 ${d.reqEleCnt}종 이상`); if (BOOKS.includes(d)) cond.push('비밀 교배서'); if (d.estimated) cond.push('확률·교배 시간은 추정');
    const how = obtainable(d) ? (d.fixed ? '교배 (고정 확률종)' : '교배') : d.canBreed ? '교배로는 못 얻음 · 부모로는 사용 가능' : '교배로는 못 얻음';
    dlg.innerHTML = `<div class="dlg-head"><h2>${esc(d.name)}</h2><span class="chip">T${d.tier} · ${esc(rarity(d))}</span><button class="btn sm" data-close type="button">닫기</button></div>
      <div class="dlg-body">
        <div class="dex-head">${face(d)}<div class="info">${elChips(d)}<div class="kv2" style="margin-top:10px">
          <div><b>획득</b>${how}</div><div><b>교배시간</b>${E.fmtTime(d.brdSec)}<small>감소 전</small></div>${cond.length ? `<div><b>교배 조건</b>${cond.join(' · ')}</div>` : ''}<div><b>보유</b>${state.owned.has(d.id) ? '있음' : '없음'}</div>${(() => { const r = statsFor(d); return r ? `<div><b>아레나</b>승 ${pct(r.win)} · 픽 ${pct(r.pick)} · 밴 ${pct(r.ban)}${r.combos[0] ? ' · ' + esc(r.combos[0].sets.join('+')) : ''} <a href="#meta" data-meta-open="${d.id}">통계</a></div>` : ''; })()}
        </div></div></div>
        ${x ? `<h3>능력치 <span class="hint">만렙 50 · 성체 · 5성 기준 (젬·보주 제외)</span></h3><div class="stats">${STAT_KEYS.map((k, i) => `<span>${STAT_KO[k]}</span><div class="bar"><i style="width:${(x.st[i] / STAT_MAX[i] * 100).toFixed(1)}%"></i></div><span class="v">${num(x.st[i])}</span>`).join('')}</div>
          <h3>스킬</h3>${skillHtml('일반 공격', x.bs)}${skillHtml('필살기', x.ul)}${x.ab ? `<div class="skill"><b>어빌리티 · ${esc(x.ab.n)}</b><p>${esc(x.ab.d)}</p></div>` : ''}`
        : '<p class="note">이 드래곤의 능력치·스킬 데이터는 아직 준비 중입니다 (2026-09-10 추가 종).</p>'}
        <div class="row" style="margin-top:16px"><button class="btn primary" data-go="breed" type="button">교배 조합 보기</button><button class="btn" data-go="route" type="button">최단 루트</button><button class="btn" data-go="gems" type="button">젬 추천</button></div>
      </div>`;
    dlg.showModal();
  }
  function goFromDex(where, d) {
    if (where === 'breed') { setTarget(d); location.hash = 'breed'; }
    else if (where === 'route') { state.routeTarget = d; $('#routeInput').value = `${d.name} · T${d.tier}`; location.hash = 'route'; }
    else { gemState.d = d; $('#gemDInput').value = d.name; location.hash = 'gems'; renderGems(); }
  }

  // ───────── 젬 강화 · 추천 (data/gems.js: 공식 확률표) ─────────
  // 추천 기준(Atlas 방식): 옵션이 +5까지 오를 때의 기대 상승분이 이 드래곤의 만렙 능력치에서 몇 %인지로 가치를 매긴다.
  //  · 필살기·일반 공격이 물리면 마력 옵션, 마법이면 공격 옵션은 의미가 없다(고대주니어처럼 둘이 다르면 양쪽 다 씀)
  //  · 속도는 선공을 정하므로 항상 가치가 크고, 체력·방어·저항은 단단한 드래곤(체력·방어/저항 상위)일수록 무겁게 본다
  //  · 확률 옵션은 기대 피해 증가분으로 환산: 더블 어택 +x%p ≈ 피해 +x%, 트리플 ≈ 2x%, 치명타 피해는 치명타가 떠야 하므로 40%만 인정
  const gemState = { d: null };
  const raiseTable = (sub) => GM.raise[sub in GM.raise ? sub : 'stat'];
  const meanRaise = (sub) => raiseTable(sub).reduce((a, [v, q]) => a + v * q, 0);
  function gemRole(d) {
    const x = dexOf(d); if (!x || !x.ul || !x.bs) return null;
    const dmg = x.ul.k === x.bs.k ? (x.ul.k === 'mag' ? '마법' : '물리') : '쌍두';
    const fast = pctl(5, x.st[5]) >= 0.75, tank = pctl(0, x.st[0]) >= 0.6 && (pctl(2, x.st[2]) >= 0.65 || pctl(4, x.st[4]) >= 0.65);
    const striker = (dmg !== '마법' && pctl(1, x.st[1]) >= 0.7) || (dmg !== '물리' && pctl(3, x.st[3]) >= 0.7); // 공격(또는 마력)이 상위 30%면 단단해도 딜러 구성을 먼저
    return { x, dmg, fast, tank, striker, tags: [`${dmg} 딜러`, striker ? '강타 (공격력 상위 30%)' : null, fast ? '빠름 (속도 상위 25%)' : null, tank ? '단단함 (체력·방어/저항 상위)' : null].filter(Boolean) };
  }
  function subValue(sub, role) {
    const gain = 5 / 3 * meanRaise(sub); // 3옵션 젬을 +5까지 올릴 때 옵션 하나의 기대 상승 (5회 중 평균 5/3회)
    const i = STAT_KEYS.indexOf(sub);
    if (i >= 0) {
      const w = sub === 'atk' ? (role.dmg === '마법' ? 0 : 1) : sub === 'mag' ? (role.dmg === '물리' ? 0 : 1) : sub === 'spd' ? 1 : role.tank ? 0.8 : 0.55;
      const rel = gain / role.x.st[i];
      return { v: rel * w, gain: `+${Math.round(gain)} · ${(rel * 100).toFixed(1)}%`, why: w === 0 ? `${role.dmg} 드래곤에게는 쓸모없는 능력치` : sub === 'spd' ? '선공 순서를 정하는 능력치' : i === 0 || i === 2 || i === 4 ? (role.tank ? '단단한 드래곤이라 방어 계열도 가치 있음' : '보조 능력치') : `${role.dmg} 피해의 원천`, dead: w === 0 };
    }
    if (sub === 'dbl') return { v: gain / 100, gain: `+${gain.toFixed(1)}%p`, why: '추가 공격 확률 → 피해 기대치 비슷하게 증가' };
    if (sub === 'tri') return { v: gain / 100 * 2, gain: `+${gain.toFixed(2)}%p`, why: '두 번 추가 공격, 확률은 작음' };
    return { v: gain / 100 * 0.4, gain: `+${gain.toFixed(1)}%p`, why: '치명타가 떠야 효과 (40%만 인정)' };
  }
  // 세트 구성 추천(Atlas 기준): 6칸 = 2세트 셋 또는 4세트+2세트. 역할에 맞는 세트와 이유
  function setPlan(role) {
    const S = GM.sets, P = (n, why) => ({ n, pieces: S[n].pieces, effect: S[n].effect, why });
    const main = [], alt = [];
    if (role.tank && !role.striker) {
      main.push(P('무덤', '매 턴 최대 체력의 1/16 회복 — 오래 버티는 드래곤에게 가장 큰 효과'), P('결벽', '상대 스킬·어빌리티로 능력치가 떨어지지 않음'));
      alt.push(P('흡혈', '준 피해의 1/8 회복 — 공격도 잘하는 탱커라면 무덤 대신'), P('무지개', '체력 절반 이하로 맞으면 1/4 회복 (전투당 1회)'));
    } else {
      main.push(role.dmg === '마법' ? P('조화', '마력 스킬 위력 +10%') : P('파괴', '물리 스킬 위력 +10%'), P('수력', '약점 속성을 때릴 때 스킬 위력 +20%'), role.fast ? P('돌풍', '20% 확률로 우선도 +0.5 — 선공을 더 굳힘') : P('화염', '등장 시 치명타 확률 1단계'));
      if (role.dmg === '쌍두') alt.push(P('조화', '마력 스킬도 쓰므로 파괴 대신 고려'));
      alt.push(P('칠흑', '가하는 피해 +30%, 대신 매 턴 최대 체력의 1/10 반동 — 한 방에 끝내는 공격덱용'), P(role.fast ? '화염' : '돌풍', role.fast ? '등장 시 치명타 확률 1단계' : '20% 확률로 우선도 +0.5'));
      if (role.tank) alt.push(P('무덤', '단단한 드래곤이라 방어덱(콜로)용으로는 무덤 4 + 결벽 2도 좋음'), P('결벽', '능력치 하락 무효'));
    }
    return { main, alt };
  }
  const setRow = (p) => `<div class="gem-opt"><span class="rk">${p.pieces}</span><span><b>${esc(p.n)}</b> <span class="why" style="display:inline">${esc(p.why)}</span><span class="why">${esc(p.effect)}</span></span><span class="gain">${p.pieces}세트</span></div>`;
  function renderGems() {
    if (!$('#gemSets').innerHTML) $('#gemSets').innerHTML = `<tr><th>세트</th><th class="n">개수</th><th>효과</th></tr>` + Object.entries(GM.sets).map(([n, s]) => `<tr><td><b>${esc(n)}</b></td><td class="n">${s.pieces}세트</td><td>${esc(s.effect)}</td></tr>`).join('');
    const d = gemState.d, out = $('#gemReco');
    if (!d) {
      const s0 = AS.seasons[0], rows0 = s0 ? (s0.tiers[Object.keys(s0.tiers)[0]] || { rows: [] }).rows : [], tr = rows0.length ? trendSets(rows0) : null;
      out.innerHTML = '<div class="empty">드래곤을 고르면 실전 메타(아레나 상위 구간에서 실제로 끼는 세트·보주)와, 젬 6종마다 이 드래곤에게 가치 있는 서브 옵션 순서, 주속성에 맞는 보주 목록이 나옵니다.</div>'
        + (tr ? `<div class="gem-slot meta" style="margin-top:10px"><h3>이번 시즌 세트 트렌드 <span class="tag gold" style="margin:0">아레나 ${esc(s0.id)} · ${esc(Object.keys(s0.tiers)[0])} 구간</span></h3><div class="chips">${tr.combos.slice(0, 5).map(([k, v]) => `<span class="cb">${k.split('+').map((n) => setChip(n, true)).join('<span class="plus">+</span>')}<small class="mono">${(v * 100).toFixed(0)}%</small></span>`).join('')}</div><p class="note" style="margin:6px 0 0"><a href="#meta">아레나 통계에서 드래곤별로 보기</a></p></div>` : '');
      renderGemCalc(); return;
    }
    const role = gemRole(d);
    let html = `<div class="dex-head" style="margin-bottom:6px">${face(d)}<div class="info"><div style="font-family:var(--serif);font-size:20px">${esc(d.name)}</div>${elChips(d)}<div class="role">${(() => { const rg = roleGroup(statsFor(d), role); return rg ? `<span class="tag gold" style="margin:0;font-size:12px;padding:3px 9px" title="${esc(rg.why)}">역할군 · ${esc(rg.n)}</span>` : ''; })()}${role ? role.tags.map((t) => `<span class="tag new" style="margin:0;font-size:12px;padding:3px 9px">${esc(t)}</span>`).join('') : '<span class="hint">능력치 데이터가 없어 역할을 정하지 못했습니다 (2026-09-10 추가 종)</span>'}</div></div></div>`;
    html += metaBlock(d);
    if (role) {
      const plan = setPlan(role);
      html += `<div class="gem-slot" style="margin-bottom:10px"><h3>세트 구성 <span class="tag new" style="margin:0">Atlas 능력치 기준</span> <span class="tag gold" style="margin:0">${plan.main.map((p) => p.n + ' ' + p.pieces).join(' + ')} = 6칸</span></h3>${plan.main.map(setRow).join('')}<p class="note" style="margin:8px 0 4px">대안</p>${plan.alt.map(setRow).join('')}</div>`;
      html += `<p class="note" style="margin:0 0 6px">서브 옵션 값은 옵션이 +5까지 오를 때의 기대 상승(평균 5/3회 × 회당 평균)과, 그것이 만렙 능력치에서 차지하는 비율입니다. 젬마다 붙을 수 있는 옵션이 정해져 있어 젬 종류별로 보여줍니다.</p><div class="gem-slots">`;
      for (const slot of GM.slots) {
        const ranked = GM.subPool[slot].map((s) => ({ s, ...subValue(s, role) })).sort((a, b) => b.v - a.v);
        html += `<div class="gem-slot"><h3>${GM.ko[slot]} 젬 <span class="tag new">서브 옵션 우선순위</span></h3>${ranked.map((r, i) => `<div class="gem-opt${r.dead ? ' dead' : ''}"><span class="rk">${r.dead ? '×' : i + 1}</span><span>${GM.ko[r.s]}<span class="why">${esc(r.why)}</span></span><span class="gain">${r.dead ? '의미 없음' : r.gain}</span></div>`).join('')}</div>`;
      }
      html += '</div>';
    }
    const els = d.elements, orbs = GM.orbs.filter((o) => els.includes(o.el)).sort((a, b) => els.indexOf(a.el) - els.indexOf(b.el) || b.r - a.r);
    html += `<h3 style="font-family:var(--serif);font-size:15px;color:var(--gold);margin:16px 0 8px">속성이 맞는 보주 <span class="hint" style="font-family:var(--sans);font-size:12px;color:var(--faint);font-weight:600">주속성 ${esc(META.elements[els[0]]?.ko || els[0])}이면 위력 ×${GM.orbRule.sameMainElementPower}</span></h3>`;
    html += orbs.length ? `<div class="orbs">${orbs.map((o) => { const sk = GM.orbSkills[o.n]; return `<div class="orb r${o.r}" title="${sk ? esc(sk.desc) : ''}"><i style="background:${META.elements[o.el]?.color || '#999'}"></i>${esc(o.n)}${o.el === els[0] ? ' <span class="tag gold" style="margin-left:2px">×1.5</span>' : ''}<small>${GM.rarityKo[o.r]}${o.craft ? ' · 제작소' : GM.orbRate[o.r] ? ' · ' + GM.orbRate[o.r] : ''}${sk && sk.power ? ' · 위력 ' + sk.power : ''}</small></div>`; }).join('')}</div>
      <p class="note">보주는 드래곤이 추가로 쓰는 스킬이고 칸은 2개입니다. 주속성과 같은 속성의 보주는 위력이 1.5배가 되므로(게임 화면의 ×1.5) 주속성 보주를 우선 고르고, 나머지 한 칸은 부속성이나 방어형(빛의 방패처럼 위력 없는 변화 스킬)을 씁니다. 뽑기 확률은 공식 확률표의 고급 뽑기 기준이며, 스킬 설명은 확인된 것만 마우스를 올리면 보입니다.</p>`
      : '<p class="note">이 드래곤의 속성에 해당하는 보주가 공식 목록에 없습니다 (특수 속성). 보주 칸 2개에는 부속성 보주를 씁니다.</p>';
    out.innerHTML = html;
    renderGemCalc();
  }
  // 목표 달성 확률·비용 (공식 상승폭 표 그대로): 상승 단계마다 3옵션 중 하나가 균등하게 뽑혀 표의 폭만큼 오른다.
  // 상태 = 목표 옵션들의 누적 상승(정수 단위: 능력치 10, 확률 옵션 0.1%p). 남은 상승으로 목표에 못 미치는 젬은 그 자리에서 포기(비용 중단)한다.
  // 반환: success(젬 하나가 목표를 이룰 확률), expCost(포기 포함 젬 하나의 기대 골드)
  const gemUnit = (k) => (STAT_KEYS.includes(k) ? 10 : 0.1);
  function gemTargetDP(subs, need, costs) {
    const keys = Object.keys(need); if (!keys.length) return { success: 1, expCost: costs.reduce((a, b) => a + b, 0) };
    const tab = Object.fromEntries(subs.filter((k) => k !== '_').map((k) => [k, raiseTable(k).map(([v, p]) => [Math.round(v / gemUnit(k)), p])]));
    const maxStep = Object.fromEntries(keys.map((k) => [k, Math.max(...tab[k].map((x) => x[0]))]));
    const viable = (tot, left) => keys.reduce((a, k, i) => a + Math.max(0, Math.ceil((need[k] - tot[i]) / maxStep[k])), 0) <= left;
    let dist = new Map([[keys.map(() => 0).join(','), 1]]), expCost = 0;
    if (!viable(keys.map(() => 0), costs.length)) return { success: 0, expCost: 0 };
    for (let L = 0; L < costs.length; L++) {
      let alive = 0; for (const p of dist.values()) alive += p; expCost += alive * costs[L];
      const nd = new Map();
      for (const [key, p] of dist) { const tot = key.split(',').map(Number);
        for (const k of subs) { const ti = keys.indexOf(k); if (ti < 0) { nd.set(key, (nd.get(key) || 0) + p / 3); continue; }
          for (const [v, q] of tab[k]) { const t2 = tot.slice(); t2[ti] += v; const nk = t2.join(','); nd.set(nk, (nd.get(nk) || 0) + p / 3 * q); } } }
      dist = new Map(); const left = costs.length - L - 1;
      for (const [key, p] of nd) if (viable(key.split(',').map(Number), left)) dist.set(key, p);
    }
    let success = 0; for (const [key, p] of dist) { const tot = key.split(',').map(Number); if (keys.every((k, i) => tot[i] >= need[k])) success += p; }
    return { success, expCost };
  }
  // 강화 계산: 상승 횟수 = (목표−현재) 중 옵션이 이미 3개인 단계 수. 각 상승은 3개 중 하나가 균등하게 오른다고 본다 → 한 옵션의 상승 횟수는 이항(n, 1/3)
  function renderGemCalc() {
    const slot = $('#gemSlot').value, rar = +$('#gemRar').value, cur = +$('#gemCur').value; let to = +$('#gemTo').value; if (to <= cur) { to = Math.min(GM.maxLevel, cur + 1); $('#gemTo').value = to; }
    const subs0 = GM.baseSubs[rar], pool = GM.subPool[slot], have = Math.min(3, subs0 + cur);
    $$('#gemSubs .field').forEach((f, i) => { const s = $('select', f); f.hidden = i >= have; if (s.dataset.slot !== slot) { s.dataset.slot = slot; s.innerHTML = pool.map((k) => `<option value="${k}">${GM.ko[k]}</option>`).join(''); s.value = pool[i]; } });
    const chosen = $$('#gemSubs .field').filter((f) => !f.hidden).map((f) => $('select', f).value);
    let raises = 0; for (let L = cur + 1; L <= to; L++) if (subs0 + L - 1 >= 3) raises++;
    const adds = to - cur - raises, remain = pool.filter((k) => !chosen.includes(k));
    const binom = (n, k, p) => { let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return c * p ** k * (1 - p) ** (n - k); };
    const rows = chosen.map((k) => { const t = raiseTable(k), unit = GM.unit[k] || '', mx = Math.max(...t.map((x) => x[0])); const ev = raises / 3 * meanRaise(k), p0 = binom(raises, 0, 1 / 3), p2 = 1 - p0 - binom(raises, 1, 1 / 3);
      return `<tr><td>${GM.ko[k]}</td><td class="n">+${unit ? ev.toFixed(2) : ev.toFixed(0)}${unit}</td><td class="n">${(p0 * 100).toFixed(0)}%</td><td class="n">${(p2 * 100).toFixed(0)}%</td><td class="n">+${unit ? (mx * raises).toFixed(1) : mx * raises}${unit}</td></tr>`; }).join('');
    const c = GM.cost; let goldSum = 0, approx = false; for (let L = cur + 1; L <= to; L++) { goldSum += c.perLevel[L]; if (L >= c.approxFrom) approx = true; }
    $('#gemCalc').innerHTML = `<div class="summary" style="margin-top:12px">
        <div class="stat"><div class="k">상승 ${raises}회</div><div class="v">${adds ? `옵션 추가 ${adds}회` : '옵션 추가 없음'}</div><div class="s">${GM.rarityKo[rar]} 젬 +${cur} → +${to} · 주능력치 ${GM.main[cur]} → ${GM.main[to]}</div></div>
        <div class="stat"><div class="k">골드</div><div class="v">${approx ? '약 ' : ''}${gold(goldSum)}</div><div class="s">단계별 ${[...Array(to - cur)].map((_, i) => gold(c.perLevel[cur + 1 + i])).join(' + ')} · 게임 표시값</div></div>
      </div>
      ${chosen.length ? `<div style="overflow-x:auto"><table class="tbl"><tr><th>옵션</th><th class="n">기대 상승</th><th class="n">0회</th><th class="n">2회↑</th><th class="n">최대</th></tr>${rows}</table></div><p class="note" style="margin-top:6px">0회 = 목표까지 한 번도 안 오를 확률, 2회↑ = 두 번 이상 오를 확률, 최대 = 매번 최고 폭으로 올랐을 때.</p>` : ''}
      ${adds ? `<p class="note">옵션이 추가되는 ${adds}단계에는 아직 없는 옵션(${remain.map((k) => GM.ko[k]).join('·')}) 중 하나가 각 ${(100 / remain.length).toFixed(0)}%로 붙습니다. 그 뒤 단계부터 상승이 시작됩니다.</p>` : ''}
      <p class="note">상승 폭: 능력치 20/30/40/50 (33.2/33.2/33.2/0.3%), 치명타 피해 1.0~2.0%, 더블 어택 0.5~1.0%, 트리플 어택 0.2~0.5% — 공식 확률 공지. 어느 옵션이 오르는지는 공지에 없어 3개 균등으로 가정했습니다.</p>`;
    // ── 목표 모드: 원하는 옵션·최소 상승 → 젬 하나의 성공 확률, 기대 젬 수, 기대 골드 ──
    const tsel = $$('#gemTargets select'), tval = $$('#gemTargets input');
    tsel.forEach((s) => { if (s.dataset.slot !== slot) { s.dataset.slot = slot; s.innerHTML = '<option value="">없음</option>' + pool.map((k) => `<option value="${k}">${GM.ko[k]}</option>`).join(''); } });
    const targets = {}; tsel.forEach((s, i) => { const v = +tval[i].value; if (s.value && v > 0) targets[s.value] = v; });
    const tkeys = Object.keys(targets);
    if (!tkeys.length) { $('#gemGoal').innerHTML = '<p class="note">목표 옵션과 최소 상승을 넣으면 젬 하나가 그 목표를 이룰 확률과, 이룰 때까지 드는 젬 수·골드가 나옵니다.</p>'; return; }
    const C = (n, r) => { if (r < 0 || r > n) return 0; let x = 1; for (let i = 0; i < r; i++) x = x * (n - i) / (i + 1); return x; };
    const missing = tkeys.filter((k) => !chosen.includes(k)), remainN = pool.length - chosen.length;
    const pAdd = missing.length ? C(remainN - missing.length, adds - missing.length) / C(remainN, adds) : 1; // 아직 없는 목표 옵션이 추가 단계에서 붙을 확률
    const subs3 = [...chosen, ...missing]; while (subs3.length < 3) subs3.push('_'); // 남은 자리는 어떤 옵션이든 상관없음
    const lv = []; for (let L = cur + 1; L <= to; L++) lv.push(L);
    const addCost = lv.filter((L) => subs0 + L - 1 < 3).reduce((a, L) => a + c.perLevel[L], 0), raiseCosts = lv.filter((L) => subs0 + L - 1 >= 3).map((L) => c.perLevel[L]);
    const fullCost = addCost + raiseCosts.reduce((a, b) => a + b, 0);
    const need = Object.fromEntries(tkeys.map((k) => [k, Math.round(targets[k] / gemUnit(k))]));
    const r = gemTargetDP(subs3, need, raiseCosts), success = pAdd * r.success, smart = addCost + pAdd * r.expCost;
    const fmtV = (k, v) => STAT_KEYS.includes(k) ? `+${v}` : `+${v}%p`;
    const goalTxt = tkeys.map((k) => `${GM.ko[k]} ${fmtV(k, targets[k])} 이상`).join(' 그리고 ');
    let html = `<h3 style="font-family:var(--serif);font-size:15px;color:var(--gold);margin:16px 0 8px">목표 · ${esc(goalTxt)}</h3>`;
    if (!success) html += `<p class="notice warn">이 조건으로는 목표에 닿을 수 없습니다 (상승 ${raises}회 × 최대 폭으로도 부족하거나, 옵션이 추가될 단계가 없습니다).</p>`;
    else html += `<div class="summary">
        <div class="stat good"><div class="k">젬 하나가 성공할 확률</div><div class="v">${(success * 100).toFixed(1)}%</div><div class="s">${missing.length ? `옵션이 붙을 확률 ${(pAdd * 100).toFixed(0)}% 포함 · ` : ''}+${cur} → +${to}</div></div>
        <div class="stat"><div class="k">성공까지 기대 젬 수</div><div class="v">${(1 / success).toFixed(1)}개</div><div class="s">같은 종류·희귀도 새 젬으로 반복</div></div>
        <div class="stat"><div class="k">기대 골드 · 가망 없으면 중단</div><div class="v">${approx ? '약 ' : ''}${gold(smart / success)}</div><div class="s">젬 하나 평균 ${gold(smart)} (남은 상승으로 못 닿으면 그 단계에서 멈춤)</div></div>
        <div class="stat"><div class="k">기대 골드 · 끝까지 강화</div><div class="v">${approx ? '약 ' : ''}${gold(fullCost / success)}</div><div class="s">젬 하나 ${gold(fullCost)} × ${(1 / success).toFixed(1)}개</div></div>
      </div>`;
    // 첫 목표 옵션의 목표치별 표 — 얼마를 노리면 얼마가 드는지 한눈에
    const k0 = tkeys[0], u = gemUnit(k0), stepMax = Math.max(...raiseTable(k0).map((x) => x[0])) * raises;
    const cands = (STAT_KEYS.includes(k0) ? [20, 40, 60, 80, 100, 120, 150, 200, 250] : k0 === 'crit' ? [1, 2, 3, 4, 5, 6, 8, 10] : k0 === 'dbl' ? [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] : [0.2, 0.4, 0.6, 1, 1.5, 2, 2.5]).filter((v) => v <= stepMax + 1e-9);
    let rows2 = '';
    for (const v of cands) { const nd = { ...need, [k0]: Math.round(v / u) }; const rr = gemTargetDP(subs3, nd, raiseCosts); const s = pAdd * rr.success; const sm = addCost + pAdd * rr.expCost;
      if (s < 0.001) { rows2 += `<tr><td class="n">${fmtV(k0, v)}</td><td colspan="4" style="color:var(--muted)">사실상 불가 (젬 하나 성공 확률 ${(s * 100).toFixed(3)}% 이하)</td></tr>`; break; }
      rows2 += `<tr class="${v === targets[k0] ? 'mark' : ''}"><td class="n">${fmtV(k0, v)}</td><td class="n">${(s * 100).toFixed(1)}%</td><td class="n">${(1 / s).toFixed(1)}개</td><td class="n">${gold(sm / s)}</td><td class="n">${gold(fullCost / s)}</td></tr>`; }
    html += `<div style="overflow-x:auto;margin-top:10px"><table class="tbl"><tr><th class="n">${esc(GM.ko[k0])} 최소 상승</th><th class="n">확률</th><th class="n">기대 젬</th><th class="n">골드(중단)</th><th class="n">골드(끝까지)</th></tr>${rows2}</table></div>
      <p class="note">${tkeys.length > 1 ? '표는 첫 번째 목표만 바꿔 본 것이고 두 번째 목표는 그대로 둔 값입니다. ' : ''}"중단"은 남은 상승 횟수로는 목표에 못 닿는 것이 확실해진 단계에서 그 젬을 포기하는 방식이라 골드가 덜 듭니다. 강화 폭·옵션 추가 규칙은 공식 확률 공지 그대로이고, 어느 옵션이 오르는지만 3개 균등으로 가정했습니다.</p>`;
    $('#gemGoal').innerHTML = html;
  }

  // ───────── 공식 확률표 (data/odds.js: 라운지 공지의 표 전부) ─────────
  const OD = window.DV3_ODDS || { tables: [] };
  const oddsState = { sec: null };
  function renderOdds() {
    const secs = [...new Set(OD.tables.map((t) => t.path[0]))]; if (!secs.includes(oddsState.sec)) oddsState.sec = secs[0];
    $('#oddsIntro').textContent = `하이브로 공식 "${(OD.title || '게임 내 각종 확률 정보 안내').replace(/\s*:.*$/, '')}"(${OD.updated} 갱신)의 표 ${OD.tables.length}개를 그대로 옮겼습니다. 게임 안 확률 안내(ⓘ)가 연결되는 바로 그 글입니다.`;
    $('#oddsSec').innerHTML = secs.map((s) => `<button type="button" class="fc${s === oddsState.sec ? ' on' : ''}" data-sec="${esc(s)}">${esc(s.replace(/^\d\.\s*/, ''))}</button>`).join('');
    $('#oddsBody').innerHTML = OD.tables.filter((t) => t.path[0] === oddsState.sec && t.rows.length).map((t) => {
      const [head, ...rows] = t.rows;
      return `<div class="card" style="margin-top:10px"><h2>${esc(t.path.slice(1).join(' › ') || t.path[0])}</h2>${t.notes.map((n) => `<p class="note" style="margin:0 0 8px">${esc(n)}</p>`).join('')}
        <div style="overflow-x:auto"><table class="tbl odds"><tr>${head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td class="${/%$|^[\d,.]+$/.test(c) ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
    }).join('') + `<p class="note">출처: <a href="${esc(OD.source)}" target="_blank" rel="noopener" style="text-decoration:underline">${esc(OD.source)}</a></p>`;
  }

  // ───────── 뽑기 기대 비용 (data/gacha.js: 공식 확률표 + 천장) ─────────
  const GA = window.DV3_GACHA;
  const gaState = { kind: 'premium' };
  // 천장 규칙을 그대로 따르는 상태 전이: 상태 = (아이템 미등장 연속 횟수 c, 다음 전설은 픽업 확정 플래그 f).
  // 한 번 뽑을 때: 천장(c = pity-1)이면 해당 등급 아이템 확정, 아니면 pAny. 그중 목표일 확률: f면 전부, 천장이면 pityShare, 아니면 pTarget/pAny.
  // 목표가 아닌 등급 아이템이 나오면 c=0 (픽업이면 f=1), 등급 아이템이 안 나오면 c+1. guarantee 회째에는 무조건 성공(200회 확정 게이지)
  function gachaCurve(cfg, maxN, c0 = 0, g0 = 0) {
    let dist = new Map([[`${c0}:0`, 1]]); const cum = [0]; let done = 0;
    for (let n = 1; n <= maxN; n++) {
      if (cfg.guarantee && g0 + n >= cfg.guarantee) { cum.push(1); break; }
      const nd = new Map(); let hit = 0;
      for (const [key, m] of dist) {
        const [c, f] = key.split(':').map(Number); const pity = c >= cfg.pity - 1;
        const pAny = pity ? 1 : cfg.pAny, pT = f ? pAny : pity ? cfg.pityShare : cfg.pTarget;
        hit += m * pT;
        const miss = m * (pAny - pT); if (miss > 1e-15) { const k = `0:${cfg.nextGuaranteed ? 1 : 0}`; nd.set(k, (nd.get(k) || 0) + miss); }
        const none = m * (1 - pAny); if (none > 1e-15) { const k = `${c + 1}:${f}`; nd.set(k, (nd.get(k) || 0) + none); }
      }
      done += hit; cum.push(done); dist = nd;
    }
    return cum;
  }
  function renderGacha() {
    const kind = gaState.kind, sel = $('#gaTarget'), pk = kind === 'pickup';
    const active = EV.pickup.find((e) => { const n = new Date(); return n >= parseDate(e.start) && n <= parseDate(e.end); }) || EV.pickup[0];
    const targets = pk ? (active?.dragonIds || []).map((id) => byId.get(id)).filter(Boolean).map((d) => [String(d.id), d.name + ' (픽업)']) : [...Object.keys(GA.premium.legendaryEggs).map((n) => ['L:' + n, n + ' · 전설']), ...Object.keys(GA.premium.heroEggs).map((n) => ['H:' + n, n + ' · 영웅'])];
    if (sel.dataset.kind !== kind) { sel.dataset.kind = kind; sel.innerHTML = targets.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join(''); }
    $$('#gaKind button').forEach((b) => b.classList.toggle('on', b.dataset.v === kind));
    $('#gaHeroField').hidden = pk || !sel.value.startsWith('H:'); $('#gaGaugeField').hidden = !pk;
    const c0 = Math.max(0, Math.min(119, +$('#gaPity').value || 0)), h0 = Math.max(0, Math.min(9, +$('#gaHeroPity').value || 0)), g0 = Math.max(0, Math.min(199, +$('#gaGauge').value || 0));
    let cfg, label, note;
    if (pk) { const P = GA.pickup; cfg = { pAny: P.legendaryAny, pTarget: P.pickupEgg, pity: P.pity, pityShare: P.pityPickup, nextGuaranteed: true, guarantee: P.guarantee }; label = sel.options[sel.selectedIndex]?.text || '픽업 드래곤'; note = `픽업 알 0.45% · 전설 아이템 0.9% · 120회 천장에서 픽업 50%(다른 전설이면 다음 전설은 픽업 확정) · ${P.guarantee}회 확정 게이지 · 티켓 1개 = 다이아 ${P.ticketDia}`; }
    else { const P = GA.premium, hero = sel.value.startsWith('H:'), name = sel.value.slice(2), [rate, share] = (hero ? P.heroEggs : P.legendaryEggs)[name] || [0, 0];
      cfg = hero ? { pAny: P.heroOrBetter, pTarget: rate, pity: P.pityHero, pityShare: share } : { pAny: P.legendaryAny, pTarget: rate, pity: P.pityLegendary, pityShare: share }; label = name;
      note = hero ? `${name} 알 ${(rate * 100).toFixed(4)}% · 영웅 이상 아이템 6% · 10회 천장에서 이 알 ${(share * 100).toFixed(2)}%` : `${name} 알 ${(rate * 100).toFixed(5)}% · 전설 아이템(알+보주) 0.9% · 120회 천장에서 이 알 ${(share * 100).toFixed(3)}%`; }
    $('#gaNote').textContent = note;
    if (!targets.length) { $('#gaOut').innerHTML = '<h2>결과</h2><div class="empty">진행 중인 픽업이 없습니다.</div>'; $('#gaTable').innerHTML = ''; return; }
    const maxN = pk ? 200 : (cfg.pity === 10 ? 2000 : 9000), start = pk ? c0 : (cfg.pity === 10 ? h0 : c0);
    const cum = gachaCurve(cfg, maxN, start, g0);
    const q = (p) => { const i = cum.findIndex((v) => v >= p); return i < 0 ? null : i; };
    let ev = 0; for (let n = 0; n < cum.length - 1; n++) ev += 1 - cum[n]; if (cum[cum.length - 1] < 0.999) ev += (1 - cum[cum.length - 1]) / cfg.pTarget; // 꼬리는 천장 없는 근사
    const dia = (n) => pk ? ` <span class="s">다이아 ${num(n * GA.pickup.ticketDia)}</span>` : '';
    const stat = (k, v, s) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    renderArms();
    $('#gaOut').innerHTML = `<h2>결과 · ${esc(label)}</h2><div class="kv" style="margin-top:8px">
      ${stat('기대 횟수', num(ev) + '회', pk ? '다이아 약 ' + num(ev * GA.pickup.ticketDia) : '티켓 기준')}
      ${stat('50% 확률로 획득', (q(0.5) ?? '—') + '회', pk && q(0.5) != null ? '다이아 ' + num(q(0.5) * GA.pickup.ticketDia) : '둘 중 하나는 이 안에')}
      ${stat('90% 확률로 획득', (q(0.9) ?? '—') + '회', pk && q(0.9) != null ? '다이아 ' + num(q(0.9) * GA.pickup.ticketDia) : '열에 아홉은 이 안에')}
      ${stat('99% 확률로 획득', (q(0.99) ?? '—') + '회', pk && q(0.99) != null ? '다이아 ' + num(q(0.99) * GA.pickup.ticketDia) : '거의 확실')}
    </div><p class="note">${pk ? '200회 확정 게이지 덕분에 최대 200회(누적 포함) 안에는 반드시 얻습니다.' : '천장은 "어떤 전설이든 하나"라서 특정 드래곤은 천장 때마다 ' + (cfg.pityShare * 100).toFixed(2) + '% 확률로만 나옵니다.'}</p>`;
    const ns = pk ? [10, 20, 30, 50, 80, 100, 120, 150, 200] : (cfg.pity === 10 ? [10, 20, 30, 50, 100, 150, 200, 300, 500] : [50, 100, 120, 200, 240, 300, 500, 720, 1000, 1500, 2000, 3000, 5000, 8000]);
    $('#gaTable').innerHTML = `<tr><th class="n">횟수</th><th class="n">누적 확률</th><th></th>${pk ? '<th class="n">다이아</th>' : ''}</tr>` + ns.filter((n) => n < cum.length || pk).map((n) => { const p = (cum[Math.min(n, cum.length - 1)] || 0) * 100; return `<tr><td class="n">${n}회</td><td class="n">${p.toFixed(1)}%</td><td style="min-width:120px"><div class="minibar" style="width:${p}%"></div></td>${pk ? `<td class="n">${num(n * GA.pickup.ticketDia)}</td>` : ''}</tr>`; }).join('');
  }

  // ───────── 테이머 암즈 스킨: 뽑기 → 합성 → 최종 피해 기대값 (data/gacha.js arms) ─────────
  // 합성 규칙(게임 도움말): 같은 등급 3개 → 성공 시 3개 소모·위 등급 1개, 실패 시 2개 소모(메인 재료는 남음). 성공 1개당 기대 소모 = 3 + (1/p − 1)×2 = 2/p + 1
  // 기대값 사슬: 등급별 기대 개수 = 뽑힌 수 + 아래 등급 기대 개수 × p/(2+p). 확률·최고 옵션은 몬테카를로(아래 등급부터 3개 이상 남는 동안 계속 합성)
  const armsRate = (p) => p / (2 + p);
  function armsExpect(N) {
    const A = GA.arms, g = A.grades, e = {}; e[g[0]] = N * A.pull[g[0]];
    for (let i = 1; i < g.length; i++) e[g[i]] = N * (A.pull[g[i]] || 0) + (g[i] === '영웅' ? N / A.heroBoxEvery : 0) + e[g[i - 1]] * armsRate(A.synth[g[i - 1]]); // 200회마다 영웅 상자 1개(평균으로 반영)
    return e;
  }
  function armsSim(N, runs = 4000) {
    const A = GA.arms, g = A.grades, atLeast = Object.fromEntries(g.map((x) => [x, 0])), sumBest = { v: 0 }, sumCnt = Object.fromEntries(g.map((x) => [x, 0]));
    const cum = []; let acc = 0; for (const x of g) { acc += A.pull[x] || 0; cum.push([x, acc]); }
    for (let r = 0; r < runs; r++) {
      const cnt = Object.fromEntries(g.map((x) => [x, 0])); let best = 0;
      for (let i = 0; i < N; i++) { const u = Math.random(); for (const [x, c] of cum) if (u < c) { cnt[x]++; break; } }
      cnt['영웅'] += Math.floor(N / A.heroBoxEvery); // 200회마다 영웅 스킨 선택 상자
      for (let i = 0; i < g.length - 1; i++) { while (cnt[g[i]] >= A.synthUse) { if (Math.random() < A.synth[g[i]]) { cnt[g[i]] -= A.synthUse; cnt[g[i + 1]]++; } else cnt[g[i]] -= A.synthFailLose; } }
      for (const x of g) { sumCnt[x] += cnt[x]; if (cnt[x] > 0) { atLeast[x]++; const s = A.stat[x]; let b = 0; for (let j = 0; j < cnt[x]; j++) b = Math.max(b, s[Math.floor(Math.random() * s.length)]); best = Math.max(best, b); } }
      sumBest.v += best;
    }
    return { atLeast: Object.fromEntries(g.map((x) => [x, atLeast[x] / runs])), mean: Object.fromEntries(g.map((x) => [x, sumCnt[x] / runs])), bestStat: sumBest.v / runs };
  }
  function renderArms() {
    const N = Math.max(1, Math.min(5000, +$('#armsN').value || 0)), dia = +$('#armsDia').value || 0;
    const A = GA.arms, g = A.grades, sim = armsSim(N), perPull = armsExpect(1);
    $('#armsCost').textContent = dia ? `${N}회 = 다이아 ${num(N * dia)}` : '';
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    $('#armsOut').innerHTML = `<div class="summary" style="margin-top:12px">
        <div class="stat good"><div class="k">전설 스킨 1개당 기대 뽑기</div><div class="v">${num(1 / perPull['전설'])}회</div><div class="s">${dia ? '다이아 약 ' + num(dia / perPull['전설']) + ' · ' : ''}아래 등급을 전부 합성에 쓴다고 볼 때</div></div>
        <div class="stat"><div class="k">${N}회로 전설을 얻을 확률</div><div class="v">${(sim.atLeast['전설'] * 100).toFixed(1)}%</div><div class="s">영웅 이상 ${(sim.atLeast['영웅'] * 100).toFixed(1)}% · 희귀 이상 ${(sim.atLeast['희귀'] * 100).toFixed(1)}%</div></div>
        <div class="stat"><div class="k">${N}회 뒤 가장 좋은 스킨의 최종 피해</div><div class="v">+${sim.bestStat.toFixed(2)}%</div><div class="s">가진 스킨 중 최고 옵션의 기대값</div></div>
        <div class="stat"><div class="k">영웅 1개당 기대 뽑기</div><div class="v">${num(1 / perPull['영웅'])}회</div><div class="s">희귀 1개당 ${num(1 / perPull['희귀'])}회 · 고급 1개당 ${(1 / perPull['고급']).toFixed(1)}회</div></div>
      </div>
      <div style="overflow-x:auto"><table class="tbl"><tr><th>등급</th><th class="n">뽑혀 나옴</th><th class="n">합성까지 기대</th><th class="n">1개 이상 확률</th><th class="n">최종 피해</th><th class="n">기대 옵션</th></tr>${g.map((x) => `<tr><td><b>${x}</b></td><td class="n">${(N * (A.pull[x] || 0) + (x === '영웅' ? Math.floor(N / A.heroBoxEvery) : 0)).toFixed(2)}${x === '영웅' && Math.floor(N / A.heroBoxEvery) ? ` <span class="hint">(상자 ${Math.floor(N / A.heroBoxEvery)})</span>` : ''}</td><td class="n">${sim.mean[x].toFixed(2)}</td><td class="n">${(sim.atLeast[x] * 100).toFixed(1)}%</td><td class="n">${A.stat[x][0]}${A.stat[x].length > 1 ? '~' + A.stat[x].at(-1) : ''}%</td><td class="n">+${avg(A.stat[x]).toFixed(2)}%</td></tr>`).join('')}</table></div>
      <p class="note">"합성까지 기대"는 아래 등급 스킨이 3개 이상 남는 동안 계속 합성해 위로 올린 뒤 남는 개수의 평균입니다(몬테카를로 4,000회). 성공 1개에 드는 같은 등급 스킨은 평균 ${g.slice(0, -1).map((x) => `${x} ${(2 / A.synth[x] + 1).toFixed(1)}개`).join(' · ')}입니다. 합성 자체에 드는 골드·다이아는 넣지 않았습니다.</p>`;
  }

  // 직전 기록(prev) 대비 점수 변동 표시. ti = 행에서 테이머 이름의 위치. 이름이 있으면 같은 사람과 비교(직전 20위에 없던 사람은 NEW), 없으면 같은 순위 자리와 비교
  // 직전 기록 대비 등수 변동 (같은 테이머 기준): ▲ 올라감, ▼ 내려감, — 그대로, NEW 는 직전 20위에 없던 테이머
  const rankDeltaOf = (prev, t, ti) => {
    if (!prev || !t[ti]) return '';
    const p = prev.teams.find((x) => x[ti] === t[ti]); if (!p) return '<span class="delta new">NEW</span>';
    const d = p[0] - t[0]; return d > 0 ? `<span class="delta up">▲${d}</span>` : d < 0 ? `<span class="delta down">▼${-d}</span>` : '<span class="delta flat">—</span>';
  };
  const ptsDelta = (prev, t, ti) => {
    if (!prev) return ''; let base;
    if (t[ti]) { const p = prev.teams.find((x) => x[ti] === t[ti]); if (!p) return ' <span class="delta new">NEW</span>'; base = p[1]; }
    else base = (prev.teams.find((x) => x[0] === t[0]) || [])[1];
    if (base == null) return ''; const d = t[1] - base;
    return ` <span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${d}</span>`;
  };
  const metaLine = (s, prev) => `${esc(s.captured)} 기준 · ${s.final ? '시즌 최종 순위' : '시즌 진행 중 (종료 ' + esc(s.ends || '') + ')'}${s.note ? ' · ' + esc(s.note) : ''}${prev ? ' · ± 는 직전 기록(' + esc(prev.captured) + ') 대비 변동, NEW 는 직전 20위에 없던 테이머' : ''}`;
  const seasonOf = (data, sel, metaEl) => {
    const seasons = (data && data.seasons) || [];
    if (!sel.options.length) sel.innerHTML = seasons.map((s, i) => `<option value="${i}">${esc(s.name)}${s.final ? ' (최종)' : ''}</option>`).join('');
    const s = seasons[+sel.value || 0]; if (!s) metaEl.textContent = '기록된 시즌이 없습니다.';
    return s;
  };

  // ───────── 아레나 랭킹 (data/arena.js): [순위, 점수, 테이머] ─────────
  function renderArena() {
    const s = seasonOf(window.DV3_ARENA, $('#arenaSeason'), $('#arenaMeta')); if (!s) return;
    const T = s.teams, prev = s.prev && s.prev.teams ? s.prev : null, dPts = (t) => ptsDelta(prev, t, 2), last = T[T.length - 1];
    $('#arenaMeta').innerHTML = metaLine(s, prev);
    const name = (t) => t[2] ? esc(t[2]) : '<span class="delta flat" title="아직 이름을 확인하지 못했습니다">?</span>';
    $('#arenaSummary').innerHTML = [
      ['1위 점수', num(T[0][1]) + dPts(T[0]), T[0][2] || '?'],
      ['20위 점수', num(last[1]) + dPts(last), last[2] || '?'],
      ['1위와 20위 차', num(T[0][1] - last[1]), '20위 안의 점수 폭'],
      ['평균 점수', num(T.reduce((a, t) => a + t[1], 0) / T.length), '1~20위 평균'],
    ].map(([k, v, sub]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${esc(sub)}</div></div>`).join('');
    const rankDelta = (t) => rankDeltaOf(prev, t, 2);
    $('#arenaTeams').innerHTML = `<tr><th class="n">순위</th><th>테이머</th><th class="n">점수</th><th class="n">위와 차</th><th class="n">등수 변동</th></tr>` +
      T.map((t, i) => `<tr><td class="n">${t[0]}</td><td class="tamer">${name(t)}</td><td class="n">${num(t[1])}${dPts(t)}</td><td class="n">${i ? '−' + num(T[i - 1][1] - t[1]) : ''}</td><td class="n">${rankDelta(t)}</td></tr>`).join('');
  }

  // ───────── 아레나 통계 (data/arena-stats.js: 게임 안 통계 창을 상위 구간 기준으로 옮긴 값) ─────────
  const AS = window.DV3_ARENA_STATS || { seasons: [], orbs: {}, setColors: {} };
  const SET_COLORS = Object.assign({ '희망': '#ff80c0', '화염': '#f54052', '무덤': '#8467c0', '칠흑': '#9ba4b5', '파괴': '#ff8538' }, AS.setColors || {});
  const SET_KIND = { 파괴: 'atk', 조화: 'atk', 칠흑: 'atk', 수력: 'atk', 화염: 'atk', 돌풍: 'atk', 무덤: 'sus', 흡혈: 'sus', 무지개: 'sus', 몽환: 'sus', 희망: 'util', 결벽: 'util', 적응: 'util', 창공: 'util', 의욕: 'util' };
  const metaState = { season: 0, tier: '', sort: 'pick', q: '' };
  const pc = (v, d = 1) => (v == null ? '—' : v.toFixed(d) + '%');
  const setChip = (n, small = false) => `<span class="sc${small ? ' sm' : ''}" style="--c:${SET_COLORS[n] || '#8a8f9c'}" title="${esc(GM.sets[n]?.effect || '')}">${esc(n)}<small>${GM.sets[n]?.pieces || ''}</small></span>`;
  const comboHtml = (c, small = false) => c.sets.map((n) => setChip(n, small)).join('<span class="plus">+</span>');
  const tierOf = (s) => (s && s.tiers[metaState.tier] ? metaState.tier : s ? Object.keys(s.tiers)[0] : null);
  const metaSeason = () => AS.seasons[metaState.season] || AS.seasons[0] || null;
  const metaRows = () => { const s = metaSeason(); const t = tierOf(s); return s && t ? s.tiers[t].rows : []; };
  const statsIndex = new Map(); // id → 최신 시즌·기본 구간(첫 구간)의 행
  { const s = AS.seasons[0]; if (s) for (const r of (s.tiers[Object.keys(s.tiers)[0]] || { rows: [] }).rows) statsIndex.set(r.id, r); }
  const statsFor = (d) => statsIndex.get(d.id) || null;
  // 역할군: 가장 많이 쓰는 세트 조합의 성격(공격·유지·보조)과 능력치 역할을 합친다
  function roleGroup(row, role) {
    const c = row?.combos?.[0];
    const kinds = c ? c.sets.map((n) => SET_KIND[n] || 'util') : [];
    const sus = kinds.includes('sus'), atk = kinds.includes('atk');
    let n, why;
    if (role && role.tank && !role.striker) { n = '탱커'; why = '체력·방어/저항이 높아 오래 버티는 역할' + (sus ? ' · 회복 세트로 더 굳힘' : ''); }
    else if (!c) { if (!role) return null; n = role.dmg + ' 딜러'; why = '능력치 기준'; }
    else if (sus) { n = '브루저'; why = '공격력이 있는 드래곤이 회복 세트(무덤·흡혈·무지개)로 버티며 때리는 구성'; }
    else if (atk) { n = '딜러'; why = '공격 세트로 화력에 집중'; }
    else { n = '서포터'; why = '보조 세트 위주'; }
    return { n: (role && role.fast && n !== '탱커' ? '스피드 ' : '') + n, why };
  }
  // 통계에 없는 드래곤: 능력치 모양이 비슷하고(코사인 유사도) 공격 종류·주속성이 같은 드래곤을 통계에서 찾는다
  function similarWithStats(d, n = 2) {
    const x = dexOf(d); if (!x || !statsIndex.size) return [];
    const v = x.st.map((s, i) => s / STAT_MAX[i]), kind = x.ul && x.bs ? (x.ul.k === x.bs.k ? x.ul.k : 'both') : null;
    const cos = (a, b) => a.reduce((s, ai, i) => s + ai * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b) || 1);
    const KW = ['날씨', '회복', '속도', '치명타', '방어', '저항', '공격', '마력', '상태', '등장', '피격', '명중', '우선', '반동', '무시'];
    const kws = (y) => new Set(KW.filter((k) => (y.ab?.d || '').includes(k) || (y.ul?.d || '').includes(k)));
    const mine = kws(x);
    return [...statsIndex.keys()].filter((id) => id !== d.id && DEX[id]).map((id) => { const y = DEX[id], o = byId.get(id); const yk = y.ul && y.bs ? (y.ul.k === y.bs.k ? y.ul.k : 'both') : null;
      const shared = [...kws(y)].filter((k) => mine.has(k)).length; // 어빌리티·필살기 설명에 같은 낱말(날씨·회복·속도…)이 있으면 비슷한 역할로 본다
      const c0 = cos(v, y.st.map((s, i) => s / STAT_MAX[i])); return { d: o, row: statsIndex.get(id), cos: c0, sim: c0 + (kind && kind === yk ? 0.08 : 0) + (o.elements[0] === d.elements[0] ? 0.05 : 0) + Math.min(0.06, shared * 0.02) }; })
      .sort((a, b) => b.sim - a.sim).slice(0, n);
  }
  function trendSets(rows) {
    const set = new Map(), combo = new Map(), tot = rows.reduce((a, r) => a + (r.pick || 0), 0) || 1;
    for (const r of rows) for (const c of r.combos) { const w = (r.pick || 0) * (c.pick || 0) / 100; const key = c.sets.join('+'); combo.set(key, (combo.get(key) || 0) + w); for (const n of c.sets) set.set(n, (set.get(n) || 0) + w); }
    const top = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([k, w]) => [k, w / tot]);
    return { sets: top(set), combos: top(combo) };
  }
  function trendOrbs(rows) {
    const m = new Map(), tot = rows.reduce((a, r) => a + (r.pick || 0), 0) || 1;
    for (const r of rows) for (const o of r.orbs) { const e = m.get(o.n) || { w: 0, n: 0, win: 0 }; e.w += (r.pick || 0) / Math.max(1, r.orbs.length); e.n++; if (o.win != null) { e.win += o.win; } m.set(o.n, e); }
    return [...m].map(([k, e]) => ({ n: k, share: e.w / tot, users: e.n, win: e.n ? e.win / e.n : null })).sort((a, b) => b.share - a.share);
  }
  const orbLine = (n, extra = '', showDesc = false) => { const o = AS.orbs[n] || {}; return `<div class="orb${o.kind === '변화' ? ' r3' : ''}${showDesc ? ' wd' : ''}" title="${esc(o.desc || '')}">${esc(n)}${o.kind ? ` <span class="tag ${o.kind === '마법' ? 'pin' : o.kind === '물리' ? 'up' : 'new'}">${esc(o.kind)}</span>` : ''}<small>${[o.power ? '위력 ' + o.power : '', o.energy ? '소모 ' + o.energy : ''].filter(Boolean).join(' · ')}${extra}</small>${showDesc && o.desc ? `<span class="od">${esc(o.desc)}</span>` : ''}</div>`; };
  function renderMeta() {
    const sel = $('#metaSeason');
    if (!sel.options.length) sel.innerHTML = AS.seasons.map((s, i) => `<option value="${i}">아레나 ${esc(s.id)} 시즌</option>`).join('');
    metaState.season = +sel.value || 0;
    const s = metaSeason(); if (!s) { $('#metaMeta').textContent = '아직 기록된 통계가 없습니다.'; return; }
    const tsel = $('#metaTier'), tiers = Object.keys(s.tiers);
    if (tsel.dataset.season !== String(metaState.season)) { tsel.innerHTML = tiers.map((t) => `<option value="${esc(t)}">${esc(t)} 구간</option>`).join(''); tsel.dataset.season = String(metaState.season); }
    metaState.tier = tsel.value || tiers[0];
    const tier = s.tiers[metaState.tier], rows = tier.rows;
    $('#metaMeta').innerHTML = `${esc(tier.captured)} 기준 · 아레나 ${esc(s.id)} 시즌 ${esc(metaState.tier)} 구간 · 픽률·밴율은 이 구간 전체 경기 기준, 승률은 그 드래곤이 나온 경기 기준`;
    const tr = trendSets(rows), to = trendOrbs(rows);
    $('#metaTrend').innerHTML = `<div class="card"><h2>이번 시즌 젬 세트 트렌드</h2><p class="note" style="margin:0 0 8px">드래곤 픽률 × 세트 조합 픽률로 가중한 사용 비중</p>
        <div class="trend">${tr.combos.slice(0, 6).map(([k, v]) => `<div class="tr"><span>${k.split('+').map((n) => setChip(n, true)).join('<span class="plus">+</span>')}</span><div class="bar"><i style="width:${Math.min(100, v * 100 * 1.5).toFixed(1)}%"></i></div><b>${(v * 100).toFixed(0)}%</b></div>`).join('')}</div>
        <p class="note" style="margin:10px 0 4px">세트별</p><div class="chips">${tr.sets.slice(0, 8).map(([n, v]) => `${setChip(n, true)}<small class="mono">${(v * 100).toFixed(0)}%</small>`).join(' ')}</div></div>
      <div class="card"><h2>많이 쓰는 보주</h2><p class="note" style="margin:0 0 8px">끼운 드래곤 수(픽률 가중)와 그 보주를 꼈을 때의 평균 승률</p>
        <div class="orbs one">${to.slice(0, 8).map((o) => orbLine(o.n, ` · ${o.users}종 · 승 ${pc(o.win)}`)).join('')}</div></div>`;
    const q = metaState.q.trim().toLowerCase();
    const list = rows.map((r) => ({ r, d: byId.get(r.id) })).filter((x) => x.d && (!q || x.d.name.toLowerCase().includes(q)));
    const key = metaState.sort; list.sort(key === 'name' ? (a, b) => a.d.name.localeCompare(b.d.name, 'ko') : (a, b) => (b.r[key] ?? -1) - (a.r[key] ?? -1));
    $('#metaCount').textContent = `${list.length}종`;
    $('#metaTable').innerHTML = `<tr><th class="n">#</th><th>드래곤</th><th class="n">승률</th><th class="n">픽률</th><th class="n">밴율</th><th>주 세트</th><th>보주</th></tr>` + list.map(({ r, d }, i) => { const rg = roleGroup(r, gemRole(d)); const c = r.combos[0];
      return `<tr data-id="${d.id}" tabindex="0"><td class="n">${i + 1}</td><td class="dg"><span class="colo-d">${face(d)}${esc(d.name)}</span>${rg ? `<span class="tag gold">${esc(rg.n)}</span>` : ''}</td><td class="n">${pc(r.win)}</td><td class="n">${pc(r.pick)}</td><td class="n">${pc(r.ban)}</td><td class="sets">${c ? comboHtml(c, true) + `<small class="mono">${pc(c.pick, 0)}</small>` : ''}</td><td class="orbc">${r.orbs.slice(0, 2).map((o) => esc(o.n.replace(/ 보주$/, ''))).join(' · ')}</td></tr>`; }).join('');
  }
  function openMeta(d, row = null) {
    const r = row || metaRows().find((x) => x.id === d.id) || statsFor(d); if (!r) return;
    const dlg = $('#metaDlg'), role = gemRole(d), rg = roleGroup(r, role), s = metaSeason();
    const dl = (list, cls) => list.length ? `<div class="faces">${list.map((c) => { const o = byId.get(c.id); return o ? `<button type="button" class="fc" data-open="${o.id}" title="${esc(o.name)}">${face(o)}<span>${esc(o.name)}</span><b class="${cls}">${pc(c.win)}</b></button>` : ''; }).join('')}</div>` : '<p class="note">없음</p>';
    dlg.dataset.id = d.id;
    dlg.innerHTML = `<div class="dlg-head"><h2>${esc(d.name)}</h2><span class="chip">아레나 ${esc(s?.id || '')} · ${esc(metaState.tier || '')}</span><button class="btn sm" data-close type="button">닫기</button></div>
      <div class="dlg-body">
        <div class="dex-head">${face(d)}<div class="info">${elChips(d)}<div class="role">${rg ? `<span class="tag gold" style="margin:0;font-size:12px;padding:3px 9px">${esc(rg.n)}</span><span class="hint">${esc(rg.why)}</span>` : ''}</div>
          <div class="summary s3" style="margin:8px 0 0"><div class="stat"><div class="k">승률</div><div class="v">${pc(r.win, 2)}</div></div><div class="stat"><div class="k">픽률</div><div class="v">${pc(r.pick, 2)}</div></div><div class="stat"><div class="k">밴율</div><div class="v">${pc(r.ban, 2)}</div></div></div></div></div>
        <h3>젬 세트 조합 <span class="hint">이 드래곤을 쓴 경기에서의 비중과 승률</span></h3>
        <table class="tbl">${r.combos.map((c) => `<tr><td>${comboHtml(c)}</td><td class="n">${pc(c.pick, 2)}</td><td class="n">승 ${pc(c.win, 2)}</td></tr>`).join('') || '<tr><td>기록 없음</td></tr>'}</table>
        <h3>장착한 보주 <span class="hint">그 보주를 꼈을 때 승률</span></h3>
        <div class="orbs one">${r.orbs.map((o) => orbLine(o.n, ` · 승 ${pc(o.win, 2)}`, true)).join('') || '<p class="note">기록 없음</p>'}</div>
        <h3>카운터 <span class="hint">이 드래곤이 상대로 만났을 때의 승률 — 낮을수록 어려운 상대</span></h3>${dl(r.counters, 'bad')}
        <h3>시너지 <span class="hint">같은 팀일 때의 승률</span></h3>${dl(r.synergies, 'good')}
        <div class="row" style="margin-top:16px"><button class="btn primary" data-go="gems" type="button">젬·보주 추천</button><button class="btn" data-go="dex" type="button">도감</button><button class="btn" data-go="breed" type="button">교배 조합</button></div>
      </div>`;
    if (!dlg.open) dlg.showModal();
  }
  // 젬 추천에 끼워 넣는 "실전 메타" 블록: 통계가 있으면 그 드래곤, 없으면 비슷한 드래곤의 세팅
  function metaBlock(d) {
    const r = statsFor(d), s = AS.seasons[0]; if (!s) return '';
    const tierName = Object.keys(s.tiers)[0];
    const combos = (row) => row.combos.map((c) => `<div class="gem-opt"><span class="rk">${pc(c.pick, 0)}</span><span>${comboHtml(c, true)}<span class="why">이 조합의 승률 ${pc(c.win)}</span></span><span class="gain">6칸</span></div>`).join('');
    const orbs = (row) => row.orbs.length ? `<div class="orbs one" style="margin-top:6px">${row.orbs.map((o) => orbLine(o.n, ` · 승 ${pc(o.win)}`, true)).join('')}</div>` : '';
    if (r) return `<div class="gem-slot meta" style="margin-bottom:10px"><h3>실전 메타 <span class="tag gold" style="margin:0">아레나 ${esc(s.id)} · ${esc(tierName)} 구간</span></h3><p class="note" style="margin:0 0 6px">승률 ${pc(r.win)} · 픽률 ${pc(r.pick)} · 밴율 ${pc(r.ban)} — 실제로 많이 끼는 세트 조합과 보주입니다. <a href="#meta" data-meta-open="${d.id}">카운터·시너지 보기</a></p>${combos(r)}${orbs(r)}</div>`;
    const sim = similarWithStats(d); if (!sim.length) return '';
    const t = sim[0];
    return `<div class="gem-slot meta" style="margin-bottom:10px"><h3>비슷한 드래곤의 실전 메타 <span class="tag new" style="margin:0">통계에 없는 종</span></h3><p class="note" style="margin:0 0 6px">${esc(d.name)}은(는) 상위 구간 통계에 없어, 능력치 모양과 공격 종류가 가장 비슷한 <b>${esc(t.d.name)}</b>(능력치 모양 유사도 ${(t.cos * 100).toFixed(0)}%)의 세팅을 참고합니다${sim[1] ? ` · 다음 후보 ${esc(sim[1].d.name)}` : ''}.</p>${combos(t.row)}${orbs(t.row)}</div>`;
  }

  // ───────── 콜로세움 상위 방어덱 (data/colo.js) ─────────
  function renderColo() {
    const seasons = (window.DV3_COLO && window.DV3_COLO.seasons) || [];
    const sel = $('#coloSeason');
    if (!sel.options.length) sel.innerHTML = seasons.map((s, i) => `<option value="${i}">${esc(s.name)}${s.final ? ' (최종)' : ''}</option>`).join('');
    const s = seasons[+sel.value || 0];
    if (!s) { $('#coloMeta').textContent = '기록된 시즌이 없습니다.'; return; }
    const byName = new Map(ALL.map((d) => [d.name, d]));
    const pic = (n) => { const d = byName.get(n); return `<span class="colo-d">${d ? `<img src="${img(d)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}${esc(n)}</span>`; };
    const T = s.teams, mean = T.reduce((a, t) => a + t[1], 0) / T.length;
    const prev = s.prev && s.prev.teams ? s.prev : null, dPts = (t) => ptsDelta(prev, t, 5);
    $('#coloMeta').innerHTML = `${esc(s.captured)} 기준 · ${s.final ? '시즌 최종 순위' : '시즌 진행 중 (종료 ' + esc(s.ends || '') + ')'}${s.note ? ' · ' + esc(s.note) : ''}${prev ? ' · ± 는 직전 기록(' + esc(prev.captured) + ') 대비 변동, NEW 는 직전 20위에 없던 테이머' : ''}`;
    // 드래곤별 집계
    const st = new Map();
    for (const t of T) t.slice(2, 5).forEach((n, p) => { const v = st.get(n) || { n: 0, pos: [0, 0, 0], pts: 0 }; v.n++; v.pos[p]++; v.pts += t[1]; st.set(n, v); });
    const rows = [...st].sort((a, b) => b[1].n - a[1].n || b[1].pts / b[1].n - a[1].pts / a[1].n);
    const prevCnt = new Map(); if (prev) for (const t of prev.teams) for (const n of t.slice(2, 5)) prevCnt.set(n, (prevCnt.get(n) || 0) + 1);
    const dCnt = (n, c) => { if (!prev) return ''; const d = c - (prevCnt.get(n) || 0); return d ? ` <span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''; };
    const prevMean = prev ? prev.teams.reduce((a, t) => a + t[1], 0) / prev.teams.length : null;
    const delta = (v) => { const d = v.pts / v.n - mean; return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${Math.round(d)}</span>`; };
    $('#coloSummary').innerHTML = [
      ['평균 점수', num(mean) + (prevMean != null ? ` <span class="delta ${mean - prevMean >= 0 ? 'up' : 'down'}">${mean - prevMean >= 0 ? '+' : ''}${Math.round(mean - prevMean)}</span>` : ''), '1~20위 평균'],
      ['가장 많이 쓰인', esc(rows[0][0]), `${rows[0][1].n}팀 / 20`],
      ['서로 다른 종', String(rows.length), '20팀에 등장한 드래곤 종 수'],
      ['1위 팀 점수', num(T[0][1]) + dPts(T[0]), (T[0][5] ? T[0][5] + ' · ' : '') + T[0].slice(2, 5).join(' · ')],
    ].map(([k, v, sub]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${esc(sub)}</div></div>`).join('');
    $('#coloDragons').innerHTML = `<tr><th>드래곤</th><th class="n">팀</th><th class="n">1·2·3번</th><th class="n">팀 평균</th></tr>` +
      rows.map(([n, v]) => `<tr><td>${pic(n)}</td><td class="n">${v.n}${dCnt(n, v.n)}</td><td class="n">${v.pos.join(' / ')}</td><td class="n">${num(v.pts / v.n)} ${delta(v)}</td></tr>`).join('');
    // 자리별 1순위
    $('#coloSlots').innerHTML = [0, 1, 2].map((p) => {
      const top = rows.map(([n, v]) => [n, v.pos[p]]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return `<div class="colo-slot"><b>${p + 1}번</b>${top.map(([n, c]) => `${pic(n)} <small>${c}팀</small>`).join('')}</div>`;
    }).join('');
    // 조합
    const combos = new Map();
    for (const t of T) { const k = t.slice(2, 5).slice().sort().join('|'); const v = combos.get(k) || { n: 0, pts: 0 }; v.n++; v.pts += t[1]; combos.set(k, v); }
    const cl = [...combos].filter(([, v]) => v.n > 1).sort((a, b) => b[1].n - a[1].n);
    $('#coloCombos').innerHTML = cl.length ? cl.map(([k, v]) => `<div class="colo-slot">${k.split('|').map((n) => pic(n)).join('')}<small>${v.n}팀 · 평균 ${num(v.pts / v.n)}</small></div>`).join('') : '<p class="note" style="margin:0">같은 조합이 두 번 이상 나오지 않았습니다.</p>';
    // 20팀 표
    $('#coloTeams').innerHTML = `<tr><th class="n">순위</th><th>테이머</th><th class="n">점수</th><th class="n">등수 변동</th><th>방어팀 (1번 → 3번)</th></tr>` +
      T.map((t) => `<tr><td class="n">${t[0]}</td><td class="tamer">${t[5] ? esc(t[5]) : '<span class="delta flat" title="아직 이름을 확인하지 못했습니다">?</span>'}</td><td class="n">${num(t[1])}${dPts(t)}</td><td class="n rk">${rankDeltaOf(prev, t, 5)}</td><td class="team">${t.slice(2, 5).map(pic).join('')}</td></tr>`).join('');
  }

  // ───────── 교배 조합 (메인) ─────────
  function recompute() {
    if (!state.target) { recipes = []; return; }
    recipes = E.findRecipes([state.target.id, ...state.co.map((d) => d.id)], opts());
    expandedKeys = new Set();
  }
  const ownedWithSig = (sig) => PARENTS.filter((d) => state.owned.has(d.id) && E.sig(d) === sig);
  function applyFilters() {
    let list = recipes;
    if (state.have) {
      const hs = E.sig(state.have);
      list = list.filter((r) => r.parents.some((p) => E.sig(p) === hs)).map((r) => { const ps = [...r.parents]; const i = E.sig(ps[0]) === hs ? 0 : 1; ps[i] = state.have; return { ...r, parents: ps, pinned: i }; });
    }
    if (state.mine) {
      list = list.map((r) => {
        const a = r.pinned === 0 ? [r.parents[0]] : ownedWithSig(E.sig(r.parents[0]));
        const b = r.pinned === 1 ? [r.parents[1]] : ownedWithSig(E.sig(r.parents[1]));
        if (!a.length || !b.length) return null;
        return { ...r, parents: [a[0], b[0]], mineAlts: [a.slice(1), b.slice(1)] };
      }).filter(Boolean);
    }
    if (state.minProb > 0) list = list.filter((r) => r.probs[0].p >= state.minProb);
    const p = (r) => r.probs[0].p, t = (r) => r.expSec;
    const cmp = { 'prob-desc': (a, b) => p(b) - p(a) || t(a) - t(b), 'prob-asc': (a, b) => p(a) - p(b) || t(a) - t(b), 'time-asc': (a, b) => t(a) - t(b) || p(b) - p(a), 'time-desc': (a, b) => t(b) - t(a) || p(b) - p(a) }[state.sort];
    view = [...list].sort(cmp);
  }
  function renderTargetCard() {
    const d = state.target, rs = rsec(d.brdSec);
    const cut = rs !== d.brdSec ? ` <span class="tag gold" title="로얄클래스·길드 버프 합산">-${cutPct()}%</span>` : '';
    $('#targetCard').innerHTML = `<div class="target">${face(d)}<div><div class="nm">${esc(d.name)}</div><div class="meta">T${d.tier} · ${rarity(d)} · 교배 <b>${E.fmtTime(rs)}</b>${cut}${state.owned.has(d.id) ? '<span class="tag own">보유</span>' : ''}</div><div style="margin-top:6px">${elChips(d)}</div></div></div>
      <div class="row" style="margin-top:12px"><button class="btn sm" type="button" data-go="route">최단 루트 보기</button><button class="btn sm" type="button" data-go="collection">내 컬렉션</button></div>`;
  }
  function rateUpNotice() {
    const ru = E.activeRateUp();
    if (!ru) return '';
    const names = ru.dragonIds.map((id) => byId.get(id)?.name).filter(Boolean).join(', ');
    return `<div class="notice warn">🔥 교배 확률업 진행 중 · ${esc(names)} · ${esc(ru.end.slice(0, 16).replace(/-/g, '.'))}까지 · ${ru.multiplier}배</div>`;
  }
  function renderNotices() {
    const out = [rateUpNotice()];
    for (const d of [state.target, ...state.co]) {
      const lim = E.limitedState(d); if (!lim) continue;
      const fmt = (x) => (x ? x.toLocaleDateString('ko-KR') : '');
      if (lim.state === 'past') out.push(`<div class="notice bad"><b>${esc(d.name)}</b>은(는) 기간 한정 드래곤으로 ${fmt(lim.end)}에 교배 획득이 끝났습니다.</div>`);
      else if (lim.state === 'future') out.push(`<div class="notice info"><b>${esc(d.name)}</b>은(는) ${fmt(lim.start)}부터 교배로 얻을 수 있습니다.</div>`);
      else out.push(`<div class="notice gold"><b>${esc(d.name)}</b>은(는) 기간 한정 드래곤입니다. ${fmt(lim.end)}까지 교배 가능.</div>`);
    }
    if (!obtainable(state.target)) out.push(`<div class="notice bad"><b>${esc(state.target.name)}</b>은(는) 교배로 얻을 수 없는 드래곤입니다(교배 가중치 0).</div>`);
    $('#notices').innerHTML = out.join('');
  }
  function renderSummary() {
    const s = $('#summary');
    if (!view.length) { s.innerHTML = ''; return; }
    const best = view.reduce((a, r) => (r.probs[0].p > a.probs[0].p ? r : a), view[0]);
    const fast = view.reduce((a, r) => (r.expSec < a.expSec ? r : a), view[0]);
    const pr = (r) => `${esc(r.parents[0].name)} + ${esc(r.parents[1].name)}`;
    const st = E.attemptStats(best.probs[0].p, rsec(best.expSec));
    s.innerHTML = `
      <div class="stat good"><div class="k">최고 확률</div><div class="v mono">${pc(best.probs[0].p)}</div><div class="s" title="${pr(best)}">${pr(best)}</div></div>
      <div class="stat"><div class="k">최고 확률 조합의 기대 시도</div><div class="v">${num(st.expected)}회</div><div class="s">90% 확보 ${num(st.n90)}회 · 기대 ${E.fmtTime(st.expectedSec)}</div></div>
      <div class="stat"><div class="k">가장 짧은 기대 교배시간</div><div class="v">${E.fmtTime(rsec(fast.expSec))}</div><div class="s" title="${pr(fast)}">${pr(fast)}</div></div>
      <div class="stat"><div class="k">목표 교배시간</div><div class="v">${E.fmtTime(rsec(state.target.brdSec))}</div><div class="s">이 시간이 뜨면 ${esc(state.target.name)}일 수 있어요</div></div>`;
  }
  function parentHtml(p, alts, pinned) {
    const shown = alts.slice(0, 3).map((a) => `<b>${esc(a.name)}</b>`).join(', ');
    const more = alts.length > 3 ? ` 외 ${alts.length - 3}` : '';
    return `<div class="par">${face(p)}<div style="min-width:0"><div class="nm">${esc(p.name)}${pinned ? '<span class="tag pin">지정</span>' : ''}${state.owned.has(p.id) ? '<span class="tag own">보유</span>' : ''}</div><div>${elChips(p)}</div>${alts.length ? `<div class="alt">또는 ${shown}${more}</div>` : ''}</div></div>`;
  }
  function recipeHtml(r, i) {
    const ru = E.activeRateUp();
    const key = r.parents[0].id + '-' + r.parents[1].id;
    const alts = r.mineAlts || r.parents.map((p) => E.alternatives(p));
    const main = r.probs[0];
    const co = r.probs.slice(1).map((c) => `<span>${esc(c.name)}${ru && ru.ids.has(c.id) ? '<span class="tag up">확률업</span>' : ''}<b>${pc(c.p)}</b></span>`).join('');
    const others = r.pool.filter((x) => !r.probs.some((q) => q.id === x.dragon.id));
    const notOwned = others.filter((x) => !state.owned.has(x.dragon.id));
    const self = r.pool.length === 1 && r.pool[0].via === 'self';
    return `<li class="rc${i === 0 && state.sort === 'prob-desc' ? ' best' : ''}" data-key="${key}">
      <div class="rank">${i + 1}</div>
      <div class="pair">${parentHtml(r.parents[0], alts[0], r.pinned === 0)}<span class="plus">+</span>${parentHtml(r.parents[1], alts[1], r.pinned === 1)}</div>
      <div class="prob ${probClass(main.p)}"><div class="num pct">${pc(main.p)}${self ? '<span class="tag self">확정</span>' : ''}${ru && ru.ids.has(main.id) ? '<span class="tag up">확률업</span>' : ''}</div><div class="bar"><i style="width:${Math.min(100, main.p)}%"></i></div>${co ? `<div class="co">${co}</div>` : ''}</div>
      <div class="time"><div>기대 교배시간<b>${E.fmtTime(rsec(r.expSec))}</b></div><div class="sub">목표 ${E.fmtTime(rsec(r.sec))}</div></div>
      <div class="foot">
        ${others.length ? `<button type="button" class="more-btn" data-key="${key}" aria-expanded="${expandedKeys.has(key)}"><span class="chev">▾</span> 다른 자손 ${others.length}종${state.owned.size ? ` · 미보유 ${notOwned.length}종` : ''}</button>` : '<span class="more-btn" style="cursor:default">다른 자손 없음</span>'}
        <span class="act">
          <button type="button" class="more-btn" data-try="${main.p}" data-sec="${Math.round(rsec(r.expSec))}">🎲 시도 계산</button>
          <button type="button" class="more-btn" data-timer="${r.parents[0].id},${r.parents[1].id}" data-sec="${Math.round(rsec(r.sec))}">⏱ 타이머</button>
          <button type="button" class="more-btn" data-copy="${esc(r.parents[0].name)} + ${esc(r.parents[1].name)} → ${esc(main.name)} ${pc(main.p)}">📋 복사</button>
        </span>
      </div>
      ${others.length ? `<div class="others" data-others="${key}" ${expandedKeys.has(key) ? '' : 'hidden'}>${expandedKeys.has(key) ? othersHtml(others) : ''}</div>` : ''}
    </li>`;
  }
  function othersHtml(others) {
    const ru = E.activeRateUp();
    return others.map((x) => `<div class="ot"><img src="${img(x.dragon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="n">${esc(x.dragon.name)}${state.owned.size ? (state.owned.has(x.dragon.id) ? '<span class="tag own">보유</span>' : '<span class="tag new">미보유</span>') : ''}${ru && ru.ids.has(x.dragon.id) ? '<span class="tag up">확률업</span>' : ''}<small>T${x.dragon.tier} · ${rarity(x.dragon)} · ${E.fmtTime(rsec(x.dragon.brdSec))}</small></div><span class="pct ${probClass(x.p)}">${pc(x.p)}</span></div>`).join('');
  }
  function renderList() {
    const list = $('#list'), empty = $('#empty'), more = $('#moreBtn');
    const total = view.length;
    $('#count').innerHTML = total ? `조합 <span>${total}</span>개` : '';
    if (!total) {
      list.innerHTML = '';
      let msg;
      if (!obtainable(state.target)) msg = `<b>${esc(state.target.name)}</b>은(는) 교배로 얻을 수 없어 조합이 없습니다.`;
      else if (state.mine && !state.owned.size) msg = `보유 드래곤이 등록되어 있지 않습니다. 상단의 <b>보유 드래곤</b> 버튼으로 등록하거나 "보유 드래곤으로만 조합"을 끄세요.`;
      else if (state.mine) msg = `보유 드래곤만으로는 <b>${esc(state.target.name)}</b>이(가) 나오는 조합이 없습니다. <a href="#route" style="color:var(--accent);font-weight:700">최단 루트</a>에서 몇 단계가 필요한지 확인해 보세요.`;
      else if (state.have) msg = `<b>${esc(state.have.name)}</b>이(가) 들어간 조합으로는 <b>${esc(state.target.name)}</b>이(가) 나오지 않습니다.`;
      else if (state.co.length) msg = `<b>${esc(state.target.name)}</b>과(와) 추가한 드래곤이 함께 나오는 조합이 없습니다.`;
      else if (state.minProb > 0) msg = `최소 확률 ${state.minProb}% 이상인 조합이 없습니다. 슬라이더를 낮춰 보세요.`;
      else msg = `조건에 맞는 조합이 없습니다.`;
      empty.innerHTML = msg; empty.hidden = false; more.hidden = true; return;
    }
    empty.hidden = true;
    list.innerHTML = view.slice(0, state.shown).map(recipeHtml).join('');
    const rest = total - state.shown;
    more.hidden = rest <= 0;
    more.textContent = `더 보기 (${Math.max(0, rest)}개 남음)`;
  }
  function renderChips() {
    $('#coChips').innerHTML = state.co.map((d) => `<span class="tag-chip">${esc(d.name)}<button type="button" data-co="${d.id}" aria-label="${esc(d.name)} 제거">×</button></span>`).join('');
    $('#haveChip').innerHTML = state.have ? `<span class="tag-chip">${esc(state.have.name)}<button type="button" data-have="1" aria-label="지정 해제">×</button></span>` : '';
    $('#mineHint').textContent = state.owned.size ? `(${state.owned.size}종 등록됨)` : '(등록된 드래곤 없음)';
    $('#ownedCnt').textContent = String(state.owned.size);
    const royal = META.royal.find((r) => r.id === +state.royal);
    $('#condSummary').textContent = [state.userLv ? `Lv ${state.userLv}` : 'Lv 전체', royal ? royal.name : null, state.guild ? `길드 ${guildOf()?.name ?? ''}` : null, state.noBook.size ? `교배서 ${BOOKS.length - state.noBook.size}/${BOOKS.length}` : null, state.co.length ? `동시 ${state.co.length}` : null, state.have ? `부모 ${state.have.name}` : null, state.mine ? '보유만' : null, state.minProb ? `${state.minProb}% 이상` : null].filter(Boolean).join(' · ');
  }
  function renderRecent() {
    const box = $('#recent');
    const ids = state.recent.filter((id) => byId.has(id));
    box.hidden = !ids.length;
    box.innerHTML = ids.length ? `<span class="lbl">최근</span>` + ids.map((id) => { const d = byId.get(id); return `<button type="button" class="pick" data-pick="${id}"><img src="${img(d)}" alt="" onerror="this.style.visibility='hidden'">${esc(d.name)}</button>`; }).join('') : '';
  }
  // 검색 상태(목표·동시·부모)는 주소에 쓰지 않는다. 예전에는 ?target= 을 붙여서, 그 주소를 북마크·방문 기록으로 다시 열면 목표와 최근 검색이 되살아났다(사용자: 링크로 들어오면 항상 초기 화면).
  function syncUrl() {
    if (location.search) { try { history.replaceState(null, '', location.pathname + (location.hash || '')); } catch {} }
  }
  // ───────── 지금 진행 중인 이벤트 (data/events.js) ─────────
  const EV = window.DV3_EVENTS || { rateUp: [], pickup: [] };
  const parseDate = (s) => new Date(String(s).replace(' ', 'T'));
  function activeOf(list) { const now = new Date(); return (list || []).find((e) => now >= parseDate(e.start) && now <= parseDate(e.end)) || null; }
  function latestOf(list) { return (list || []).slice().sort((a, b) => parseDate(b.end) - parseDate(a.end))[0] || null; }
  function whenHtml(e) {
    const end = parseDate(e.end), now = new Date();
    const left = end - now;
    const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000);
    const dday = left <= 0 ? '종료' : d >= 1 ? `D-${d}` : `${Math.max(1, h)}시간 남음`;
    return `<span class="feat-when">${e.end.slice(5, 16).replace(/-/g, '.')}까지<span class="dday">${dday}</span></span>`;
  }
  function renderFeatured() {
    const box = $('#featured'), show = $('#heroShow');
    const ru = activeOf(EV.rateUp), pk = activeOf(EV.pickup);
    const ruShown = ru || latestOf(EV.rateUp), pkShown = pk || latestOf(EV.pickup);
    const dragon = (id, extra, clickable) => {
      const d = byId.get(id); if (!d) return '';
      const inner = `<img src="${img(d)}" alt="" style="--c:${elColor(d)}" onerror="this.style.visibility='hidden'"><span><span class="n">${esc(d.name)}</span><span class="s">${extra}</span></span>`;
      return clickable ? `<button type="button" class="feat-d" data-target="${d.id}" style="--c:${elColor(d)}">${inner}</button>` : `<div class="feat-d" style="--c:${elColor(d)}">${inner}</div>`;
    };
    const els = (d) => d.elements.map((e) => META.elements[e]?.ko ?? e).join('·');
    const rateHtml = `<div class="feat feat-rate"><div class="feat-head"><span>🔥</span><b>교배 확률업</b>${ruShown ? whenHtml(ruShown) : ''}</div>
      ${ruShown ? `<div class="feat-dragons">${ruShown.dragonIds.map((id) => dragon(id, `×${ruShown.multiplier} · ${obtainable(byId.get(id) || {}) ? '조합 보기 →' : '교배 획득 불가'}`, obtainable(byId.get(id) || {}))).join('')}</div>${ruShown.mainDragonId && byId.get(ruShown.mainDragonId) ? `<div class="feat-orbs">확정 획득: <b>${esc(byId.get(ruShown.mainDragonId).name)}</b> · 기본 교배시간 1분당 1게이지, ${(ruShown.gauge || 100000).toLocaleString()} 도달 시 알 수령</div>` : ''}${ru ? '' : '<div class="feat-orbs">최근 항목입니다. 새 확률업이 시작되면 data/events.js 를 갱신하세요.</div>'}` : '<div class="none">등록된 확률업 정보가 없습니다.</div>'}</div>`;
    const pickHtml = `<div class="feat feat-pick"><div class="feat-head"><span>✨</span><b>픽업 뽑기</b>${pkShown ? whenHtml(pkShown) : ''}</div>
      ${pkShown ? `<div class="feat-dragons">${pkShown.dragonIds.map((id) => { const d = byId.get(id); return d ? dragon(id, `${els(d)} · ${obtainable(d) ? '교배로도 가능 →' : '뽑기 전용'}`, obtainable(d)) : ''; }).join('')}</div>${pkShown.orbs?.length ? `<div class="feat-orbs">보주 픽업: <b>${pkShown.orbs.map(esc).join('</b>, <b>')}</b></div>` : ''}${pk ? '' : '<div class="feat-orbs">최근 항목입니다. 새 픽업이 시작되면 data/events.js 를 갱신하세요.</div>'}` : '<div class="none">등록된 픽업 정보가 없습니다.</div>'}</div>`;
    box.innerHTML = rateHtml + pickHtml;
    // 제목 오른쪽 쇼케이스: 확률업 드래곤 + 픽업 드래곤을 크고 선명하게
    const showItems = [
      ...(ruShown ? ruShown.dragonIds.map((id) => ({ id, kind: 'show-rate', tag: `🔥 확률업 ×${ruShown.multiplier}` })) : []),
      ...(pkShown ? pkShown.dragonIds.map((id) => ({ id, kind: 'show-pick', tag: '✨ 픽업' })) : []),
    ].slice(0, 3);
    show.innerHTML = showItems.map(({ id, kind, tag }) => {
      const d = byId.get(id); if (!d) return '';
      const ok = obtainable(d);
      const inner = `<span class="glow"></span><img src="${img(d)}" alt="${esc(d.name)}" onerror="this.style.visibility='hidden'"><span class="cap"><span class="stag">${tag}</span>${esc(d.name)}<span class="sub">${ok ? '조합 보기 →' : els(d) + ' · 뽑기 전용'}</span></span>`;
      return ok ? `<button type="button" class="show-d ${kind}" data-target="${d.id}" style="--c:${elColor(d)}" title="${esc(d.name)} 조합 보기">${inner}</button>` : `<figure class="show-d ${kind}" style="--c:${elColor(d)}">${inner}</figure>`;
    }).join('');
  }

  function refresh({ recalc = false } = {}) {
    renderChips();
    if (!state.target) { $('#workspace').hidden = true; $('#homeTiles').hidden = false; syncUrl(); return; }
    $('#workspace').hidden = false; $('#homeTiles').hidden = true;
    if (recalc) recompute();
    applyFilters();
    state.shown = 60;
    renderTargetCard(); renderNotices(); renderSummary(); renderList();
    $$('#sortSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
    syncUrl();
  }
  function setTarget(d) {
    state.target = d;
    state.co = state.co.filter((c) => c.id !== d.id);
    $('#targetInput').value = `${d.name} · T${d.tier}`;
    $('#targetClear').hidden = false;
    state.recent = [d.id, ...state.recent.filter((id) => id !== d.id)].slice(0, 8);
    renderRecent();
    if (!state.routeTarget) { state.routeTarget = d; $('#routeInput').value = `${d.name} · T${d.tier}`; }
    refresh({ recalc: true });
    document.title = `${d.name} 교배 조합 · DV3 Atlas`;
  }

  // ───────── 부모로 예측 ─────────
  function parentCard(d) {
    if (!d) return '<p class="note" style="margin:0">아직 선택하지 않았습니다.</p>';
    return `<div class="target">${face(d)}<div><div class="nm" style="font-size:17px">${esc(d.name)}${state.owned.has(d.id) ? '<span class="tag own">보유</span>' : ''}</div><div class="meta">T${d.tier} · ${rarity(d)}</div><div style="margin-top:6px">${elChips(d)}</div></div></div>`;
  }
  function renderPredict() {
    $('#pACard').innerHTML = parentCard(state.pA);
    $('#pBCard').innerHTML = parentCard(state.pB);
    const out = $('#predictOut');
    if (!state.pA || !state.pB) { out.innerHTML = '<div class="empty">부모 두 마리를 고르면 결과가 여기에 나옵니다. 보유 드래곤은 검색 목록에서 <b>보유</b> 표시로 구분됩니다.</div>'; return; }
    const A = state.pA, B = state.pB;
    if (A.id === B.id) { out.innerHTML = '<div class="empty">같은 드래곤끼리는 교배할 수 없습니다. 다른 드래곤을 골라 주세요.</div>'; return; }
    const pool = E.computePool(A.elements, B.elements, { ...opts(), didA: A.id, didB: B.id });
    if (!pool.length) { out.innerHTML = `<div class="empty">${esc(A.name)} + ${esc(B.name)} 조합으로 나올 수 있는 자손이 없습니다.</div>`; return; }
    const exp = E.expectedSec(pool);
    const ru = E.activeRateUp();
    const goal = state.target?.id;
    const union = [...new Set([...A.elements, ...B.elements])];
    out.innerHTML = `${rateUpNotice()}
      <div class="summary">
        <div class="stat"><div class="k">나올 수 있는 자손</div><div class="v">${pool.length}종</div><div class="s">부모 속성 합집합: ${union.map((e) => META.elements[e]?.ko ?? e).join(' · ')}</div></div>
        <div class="stat"><div class="k">기대 교배시간</div><div class="v">${E.fmtTime(rsec(exp))}</div><div class="s">각 자손의 확률로 가중한 평균</div></div>
        <div class="stat good"><div class="k">가장 높은 확률</div><div class="v mono">${pc(pool[0].p)}</div><div class="s">${esc(pool[0].dragon.name)}</div></div>
        ${goal ? (() => { const g = pool.find((x) => x.dragon.id === goal); return `<div class="stat"><div class="k">목표 ${esc(state.target.name)}</div><div class="v mono">${g ? pc(g.p) : '0%'}</div><div class="s">${g ? '이 조합으로 나올 수 있어요' : '이 조합으로는 나오지 않아요'}</div></div>`; })() : ''}
      </div>
      <ul class="pool">${pool.map((x) => `<li class="pr ${probClass(x.p)}${x.dragon.id === goal ? ' goal' : ''}">${face(x.dragon)}<div><div class="nm">${esc(x.dragon.name)}${x.dragon.id === goal ? '<span class="tag gold">목표</span>' : ''}${state.owned.has(x.dragon.id) ? '<span class="tag own">보유</span>' : state.owned.size ? '<span class="tag new">미보유</span>' : ''}${ru && ru.ids.has(x.dragon.id) ? '<span class="tag up">확률업</span>' : ''}</div><div class="meta">T${x.dragon.tier} · ${rarity(x.dragon)}</div><div class="bar" style="max-width:220px"><i style="width:${Math.min(100, x.p)}%"></i></div></div><span class="t">⏱ ${E.fmtTime(rsec(x.dragon.brdSec))}</span><span class="pct">${pc(x.p)}</span></li>`).join('')}</ul>`;
  }

  // ───────── 최단 루트 ─────────
  function renderRoute() {
    const out = $('#routeOut'), note = $('#routeNote');
    $$('#routeFrom button').forEach((b) => b.classList.toggle('on', b.dataset.from === state.routeFrom));
    const t = state.routeTarget;
    let from = state.routeFrom, avail = from === 'owned' ? [...state.owned] : STARTERS;
    if (from === 'owned' && !state.owned.size) { avail = STARTERS; note.textContent = '보유 드래곤이 등록되어 있지 않아 기본 드래곤(1~2티어)에서 출발합니다. 상단 "보유 드래곤"에서 등록하면 내 상황에 맞는 루트가 나옵니다.'; }
    else note.textContent = from === 'owned' ? `보유 드래곤 ${state.owned.size}종에서 출발합니다.` : '처음 시작하는 테이머 기준: 기본 속성 드래곤 8종과 램곤·깨비곤에서 출발합니다.';
    if (!t) { out.innerHTML = '<div class="empty">목표 드래곤을 고르면 루트가 여기에 나옵니다.</div>'; return; }
    if (!obtainable(t)) { out.innerHTML = `<div class="empty"><b>${esc(t.name)}</b>은(는) 교배로 얻을 수 없는 드래곤입니다.</div>`; return; }
    const r = E.roadmap(t.id, avail, opts());
    if (!r) { out.innerHTML = `<div class="empty">현재 조건으로는 <b>${esc(t.name)}</b>까지 이어지는 루트를 찾지 못했습니다. 테이머 레벨 제한이나 기간 한정 여부를 확인해 보세요.</div>`; return; }
    if (r.steps === 0) { out.innerHTML = `<div class="empty"><b>${esc(t.name)}</b>은(는) 이미 보유하고 있습니다.</div>`; return; }
    const availSet = new Set(avail);
    let totalTries = 0, totalSec = 0;
    const steps = r.chain.map((s, i) => {
      const st = E.attemptStats(s.p, rsec(s.expSec));
      totalTries += st.expected; totalSec += st.expectedSec;
      const who = (d) => `<span class="who ${availSet.has(d.id) ? 'owned' : 'made'}"><img src="${img(d)}" alt="" onerror="this.style.visibility='hidden'">${esc(d.name)}</span>`;
      const alts = s.parents.map((p) => E.alternatives(p).filter((a) => availSet.has(a.id)));
      return `<div class="step${s.dragon.id === t.id ? ' final' : ''}"><div class="no">${i + 1}</div><div class="body">
        <div class="line">${who(s.parents[0])}<span class="plus">+</span>${who(s.parents[1])}<span class="arrow">→</span><span class="res"><img src="${img(s.dragon)}" alt="" onerror="this.style.visibility='hidden'">${esc(s.dragon.name)}</span></div>
        <div class="nums"><span>확률 <b class="pct ${probClass(s.p)}">${pc(s.p)}</b></span><span>기대 시도 <b>${num(st.expected)}회</b></span><span>90% 확보 <b>${num(st.n90)}회</b></span><span>기대 소요 <b>${E.fmtTime(st.expectedSec)}</b></span>${alts.some((a) => a.length) ? `<span>대체 부모: ${alts.map((a, k) => a.length ? `${esc(s.parents[k].name)} 대신 ${a.slice(0, 2).map((x) => esc(x.name)).join(', ')}${a.length > 2 ? ` 외 ${a.length - 2}` : ''}` : '').filter(Boolean).join(' / ')}</span>` : ''}</div>
      </div></div>`;
    }).join('');
    out.innerHTML = `${rateUpNotice()}
      <div class="summary">
        <div class="stat good"><div class="k">필요 단계</div><div class="v">${r.steps}단계</div><div class="s">${esc(t.name)}까지</div></div>
        <div class="stat"><div class="k">기대 시도 합계</div><div class="v">${num(totalTries)}회</div><div class="s">각 단계 기대 시도의 합</div></div>
        <div class="stat"><div class="k">기대 소요 합계</div><div class="v">${E.fmtTime(totalSec)}</div><div class="s">순서대로 진행할 때</div></div>
      </div>
      <div class="card"><div class="steps">${steps}</div>
        <div class="legend"><span><i style="background:var(--good-soft);border-color:var(--good)"></i>출발점에서 보유</span><span><i style="background:var(--accent-soft);border-color:var(--accent)"></i>앞 단계에서 만든 드래곤</span><span>기대 소요 = 1회 기대 교배시간 ÷ 확률 (로얄클래스 반영)</span></div>
      </div>`;
  }

  // ───────── 시도·비용 ─────────
  function renderTries() {
    const p = Math.max(0.001, Math.min(100, +$('#tryP').value || 0));
    const sec = (+$('#tryH').value || 0) * 3600 + (+$('#tryM').value || 0) * 60;
    const skip = Math.max(0, +$('#trySkip').value || 0);
    const st = E.attemptStats(p, sec, skip);
    // 확정 게이지: 진행 중인 확률업의 메인 드래곤이 있으면, 교배 1회당 (기본 교배시간 ÷ 60) 게이지가 쌓여 100,000에 확정 수령. 목표가 정해져 있으면 그 기본 시간, 아니면 입력한 시간을 씀
    const ru = E.activeRateUp(), main = ru?.mainDragonId ? byId.get(ru.mainDragonId) : null; $('#tryGaugeField').hidden = !main;
    let gaugeHtml = '';
    if (main) { const per = (state.target ? state.target.brdSec : sec) / 60, goal = ru.gauge || 100000, g = Math.max(0, Math.min(goal, +$('#tryGauge').value || 0)), left = per > 0 ? Math.ceil((goal - g) / per) : null;
      gaugeHtml = `<div class="stat good"><div class="k">${esc(main.name)} 확정까지</div><div class="v">${left == null ? '—' : num(left) + '회'}</div><div class="s">교배 1회당 ${num(per)} 게이지 (${state.target ? state.target.name + ' 기본 교배시간' : '입력한 시간'} 기준) · ${num(goal - g)} 남음</div></div>`; }
    $('#tryOut').innerHTML = `<h2>결과</h2>
      <div class="big-num">${num(st.expected)}<small>회 (기대 시도)</small></div>
      <div class="kv" style="margin-top:12px">${gaugeHtml}
        <div class="stat"><div class="k">50% 확률로 성공</div><div class="v">${num(st.n50)}회</div><div class="s">${E.fmtTime(st.n50 * sec)}</div></div>
        <div class="stat good"><div class="k">90% 확률로 성공</div><div class="v">${num(st.n90)}회</div><div class="s">${E.fmtTime(st.n90 * sec)}</div></div>
        <div class="stat"><div class="k">99% 확률로 성공</div><div class="v">${num(st.n99)}회</div><div class="s">${E.fmtTime(st.n99 * sec)}</div></div>
        <div class="stat"><div class="k">기대 총 소요 시간</div><div class="v">${E.fmtTime(st.expectedSec)}</div><div class="s">기다려서 진행할 때</div></div>
        <div class="stat"><div class="k">모두 즉시 완료 시 모래시계</div><div class="v">${num(st.skipCost)}개</div><div class="s">기대 시도 × ${skip}개</div></div>
      </div>
      <p class="note">확률이 낮을수록 운의 편차가 큽니다. "90% 확률로 성공"은 열 명 중 아홉 명이 그 횟수 안에 성공한다는 뜻입니다.</p>`;
    const ns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];
    let m50 = false, m90 = false, m99 = false;
    $('#tryTable').innerHTML = `<thead><tr><th>시도</th><th>누적 성공 확률</th><th></th><th class="n">소요 시간</th><th class="n">모래시계</th></tr></thead><tbody>${ns.map((n) => {
      const w = st.within(n) * 100; let mark = '';
      if (!m50 && w >= 50) { m50 = true; mark = '50%'; } else if (!m90 && w >= 90) { m90 = true; mark = '90%'; } else if (!m99 && w >= 99) { m99 = true; mark = '99%'; }
      return `<tr class="${mark ? 'mark' : ''}"><td class="n">${n}회</td><td class="n">${w.toFixed(1)}%${mark ? ` <span class="tag gold">${mark} 돌파</span>` : ''}</td><td style="min-width:120px"><div class="minibar" style="width:${w}%"></div></td><td class="n">${E.fmtTime(n * sec)}</td><td class="n">${num(n * skip)}</td></tr>`;
    }).join('')}</tbody>`;
  }
  function prefillTries(p, sec) {
    $('#tryP').value = (+p).toFixed(2); $('#tryH').value = Math.floor(sec / 3600); $('#tryM').value = Math.round((sec % 3600) / 60);
    $('#tryFrom').textContent = state.target ? `교배 조합 카드에서 가져온 값입니다: ${state.target.name} 목표, 기대 교배시간 ${E.fmtTime(sec)}` : '';
  }

  // ───────── 타이머 ─────────
  let tick = null;
  function timerCands(aId, bId, totalSec) {
    const A = byId.get(aId), B = byId.get(bId);
    if (!A || !B || !totalSec) return null;
    const pool = E.computePool(A.elements, B.elements, { ...opts(), didA: A.id, didB: B.id });
    return pool.filter((x) => Math.abs(rsec(x.dragon.brdSec) - totalSec) <= 60);
  }
  function tmTotal() { return (+$('#tmH').value || 0) * 3600 + (+$('#tmM').value || 0) * 60; }
  function renderTmCands() {
    const el = $('#tmCands');
    const c = state.tmA && state.tmB ? timerCands(state.tmA.id, state.tmB.id, tmTotal()) : null;
    if (!state.tmA || !state.tmB) { el.textContent = '부모를 기록하면 표시된 시간으로 나올 수 있는 드래곤을 좁혀 보여줍니다.'; return; }
    if (!tmTotal()) { el.textContent = `${state.tmA.name} + ${state.tmB.name} · 교배시간을 입력하세요.`; return; }
    el.innerHTML = c && c.length ? `이 시간에 나올 수 있는 드래곤: ${c.map((x) => `<b>${esc(x.dragon.name)}</b> ${pc(x.p)}`).join(', ')}` : '이 조합에서 그 시간에 해당하는 드래곤이 없습니다. 로얄클래스 설정을 확인해 보세요.';
  }
  function saveTimers() { store.set('timers', state.timers); }
  function addTimer() {
    const total = tmTotal(), elapsed = (+$('#tmEH').value || 0) * 3600 + (+$('#tmEM').value || 0) * 60;
    if (!total) { toast('교배시간을 입력하세요'); return; }
    const label = $('#tmLabel').value.trim() || (state.tmA && state.tmB ? `${state.tmA.name} + ${state.tmB.name}` : `교배 ${state.timers.length + 1}`);
    state.timers.unshift({ id: Date.now(), label, totalSec: total, endAt: Date.now() + Math.max(0, total - elapsed) * 1000, aId: state.tmA?.id ?? null, bId: state.tmB?.id ?? null, notified: false });
    saveTimers(); $('#tmLabel').value = ''; renderTimers(); toast('타이머를 추가했습니다');
  }
  function renderTimers() {
    const box = $('#timers');
    if (!state.timers.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">등록된 타이머가 없습니다.</div>'; }
    else box.innerHTML = state.timers.map((t) => {
      const left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
      const done = left === 0;
      const c = t.aId && t.bId ? timerCands(t.aId, t.bId, t.totalSec) : null;
      const end = new Date(t.endAt);
      const hh = String(Math.floor(left / 3600)).padStart(2, '0'), mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
      return `<div class="tm ${done ? 'done' : ''}" data-id="${t.id}"><button class="x" type="button" data-del="${t.id}" aria-label="삭제">×</button>
        <div class="lbl">${done ? '✅ ' : ''}${esc(t.label)}</div>
        <div class="left mono">${done ? '완료' : `${hh}:${mm}:${ss}`}</div>
        <div class="sub">${done ? '교배가 끝났습니다' : `완료 예정 ${end.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`} · 교배시간 ${E.fmtTime(t.totalSec)}${t.aId ? ` · ${esc(byId.get(t.aId)?.name)} + ${esc(byId.get(t.bId)?.name)}` : ''}</div>
        ${c ? `<div class="cands">${c.length ? c.map((x) => `<span class="pick"><img src="${img(x.dragon)}" alt="">${esc(x.dragon.name)} <span class="pct ${probClass(x.p)}">${pc(x.p)}</span></span>`).join('') : '<span class="note" style="margin:0">해당 시간의 자손 후보 없음</span>'}</div>` : ''}
      </div>`;
    }).join('');
    if (!tick) tick = setInterval(tickTimers, 1000);
  }
  function tickTimers() {
    let changed = false;
    for (const t of state.timers) {
      const left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
      const el = $(`.tm[data-id="${t.id}"] .left`);
      if (el && left > 0) el.textContent = `${String(Math.floor(left / 3600)).padStart(2, '0')}:${String(Math.floor((left % 3600) / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      if (left === 0 && !t.notified) { t.notified = true; changed = true; notify(`교배 완료: ${t.label}`); }
    }
    if (changed) { saveTimers(); if (state.view === 'timer') renderTimers(); }
    const pending = state.timers.filter((t) => t.endAt > Date.now()).length;
    document.title = (pending ? `(${pending}) ` : '') + document.title.replace(/^\(\d+\) /, '');
  }
  function notify(msg) {
    toast(msg);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('DV3 Atlas', { body: msg }); } catch {}
  }

  // ───────── 컬렉션 ─────────
  function renderCollection() {
    const owned = ALL.filter((d) => state.owned.has(d.id));
    const obt = ALL.filter(obtainable);
    const bar = (n, t, cls = '') => `<div class="bar ${cls}" style="margin:0;height:10px"><i style="width:${t ? (n / t) * 100 : 0}%"></i></div>`;
    $('#colProg').innerHTML = `<div class="big-num">${owned.length}<small>/ ${ALL.length}종 보유</small></div>
      <div style="margin:8px 0 12px">${bar(owned.length, ALL.length, 'hi')}</div>
      <div class="kv">
        <div class="stat"><div class="k">교배로 얻는 드래곤</div><div class="v">${owned.filter(obtainable).length} / ${obt.length}</div></div>
        <div class="stat"><div class="k">희귀도별</div><div class="v" style="font-size:15px">${[3, 4, 5].map((r) => `${META.rarity[r]} ${owned.filter((d) => d.rarity === r).length}/${ALL.filter((d) => d.rarity === r).length}`).join(' · ')}</div></div>
      </div>`;
    $('#colByEl').innerHTML = Object.entries(META.elements).map(([code, m]) => { const all = ALL.filter((d) => d.elements[0] === code), have = all.filter((d) => state.owned.has(d.id)); return all.length ? `<div class="prow"><span><i class="el" style="--c:${m.color}"><i></i>${esc(m.ko)}</i></span>${bar(have.length, all.length, have.length === all.length ? 'hi' : '')}<span class="n">${have.length}/${all.length}</span></div>` : ''; }).join('');
    const missBox = $('#colMiss'), hint = $('#colMissHint');
    if (!state.owned.size) { hint.textContent = ''; missBox.innerHTML = '<li style="grid-column:1/-1;display:block" class="empty">보유 드래곤을 등록하면 지금 가진 드래곤만으로 얻을 수 있는 드래곤이 확률 높은 순으로 나옵니다.</li>'; }
    else {
      const best = E.bestFrom([...state.owned], opts());
      hint.textContent = `보유 ${state.owned.size}종 기준 · ${best.length}종`;
      missBox.innerHTML = best.length ? best.map((b) => `<li>${face(b.dragon)}<div style="min-width:0"><div class="nm">${esc(b.dragon.name)} <span class="tag ${probClass(b.p)} pct" style="font-size:12px">${pc(b.p)}</span></div><div class="how">${esc(b.parents[0].name)} + ${esc(b.parents[1].name)} · 기대 <b>${E.fmtTime(rsec(b.expSec) / (b.p / 100))}</b></div></div><button class="btn sm" type="button" data-target="${b.dragon.id}">목표로</button></li>`).join('') : '<li class="empty" style="grid-column:1/-1;display:block">보유 드래곤 조합으로 새로 얻을 수 있는 드래곤이 없습니다.</li>';
    }
    $('#colNoBreed').innerHTML = ALL.filter((d) => !obtainable(d) && !state.owned.has(d.id)).map((d) => `<span class="pick"><img src="${img(d)}" alt="">${esc(d.name)}</span>`).join('') || '<span class="note" style="margin:0">모두 보유 중입니다.</span>';
  }

  // ───────── 보유 드래곤 관리 ─────────
  function renderOwnedGrid() {
    const q = $('#ownedSearch').value.trim().toLowerCase();
    const items = ALL.filter((d) => !q || d.name.toLowerCase().includes(q)).sort((a, b) => a.tier - b.tier || a.id - b.id);
    $('#ownedGrid').innerHTML = items.map((d) => `<button type="button" class="own-btn" data-own="${d.id}" aria-pressed="${state.owned.has(d.id)}"><img src="${img(d)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(d.name)}<small>T${d.tier} · ${d.elements.map((e) => META.elements[e]?.ko ?? e).join('·')}${d.canBreed ? '' : ' · 교배 불가'}</small></span></button>`).join('');
    $('#ownedDlgCnt').textContent = `${state.owned.size} / ${ALL.length}`;
  }
  function saveOwned() { store.set('owned', [...state.owned]); renderChips(); }

  // ───────── 초기화 ─────────
  function init() {
    $('#royal').innerHTML = META.royal.map((r) => `<option value="${r.id}">${esc(r.name)}${r.pct ? ` · 교배 -${Math.round(r.pct * 100)}%` : ''}</option>`).join('');
    $('#royal').value = String(state.royal);
    $('#guild').innerHTML = META.guild.map((g) => `<option value="${g.id}">${esc(g.name)}${g.pct ? ` · 교배 -${(g.pct * 100).toFixed(1).replace(/\.0$/, '')}%` : ''}</option>`).join('');
    $('#guild').value = String(state.guild);
    try { localStorage.removeItem('dv3lab.recent'); } catch {} // 예전 버전이 남긴 최근 검색 기록 정리
    $('#books').innerHTML = BOOKS.map((d) => `<label class="bk"><input type="checkbox" data-book="${d.id}"${state.noBook.has(d.id) ? '' : ' checked'}>${esc(d.name)}</label>`).join('');
    if (state.userLv) $('#userLv').value = state.userLv;
    $('#mineToggle').checked = state.mine;
    $('#verText').textContent = `${META.version} · ${META.dataDate}`;

    combobox({ input: $('#targetInput'), list: $('#targetList'), items: () => TARGETS, onPick: setTarget });
    combobox({ input: $('#coInput'), list: $('#coList'), items: () => TARGETS.filter((d) => d.id !== state.target?.id && !state.co.some((c) => c.id === d.id) && obtainable(d)), onPick: (d) => { state.co.push(d); $('#coInput').value = ''; refresh({ recalc: true }); } });
    combobox({ input: $('#haveInput'), list: $('#haveList'), items: () => PARENTS, onPick: (d) => { state.have = d; $('#haveInput').value = ''; refresh(); } });
    combobox({ input: $('#pAInput'), list: $('#pAList'), items: () => PARENTS, onPick: (d) => { state.pA = d; $('#pAInput').value = d.name; renderPredict(); } });
    combobox({ input: $('#pBInput'), list: $('#pBList'), items: () => PARENTS, onPick: (d) => { state.pB = d; $('#pBInput').value = d.name; renderPredict(); } });
    combobox({ input: $('#routeInput'), list: $('#routeList'), items: () => TARGETS, onPick: (d) => { state.routeTarget = d; $('#routeInput').value = `${d.name} · T${d.tier}`; renderRoute(); } });
    combobox({ input: $('#tmAInput'), list: $('#tmAList'), items: () => PARENTS, onPick: (d) => { state.tmA = d; $('#tmAInput').value = d.name; renderTmCands(); } });
    combobox({ input: $('#tmBInput'), list: $('#tmBList'), items: () => PARENTS, onPick: (d) => { state.tmB = d; $('#tmBInput').value = d.name; renderTmCands(); } });

    $('#targetClear').addEventListener('click', () => { state.target = null; $('#targetInput').value = ''; $('#targetClear').hidden = true; refresh(); $('#targetInput').focus(); document.title = 'DV3 Atlas'; });
    $('#coChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-co]'); if (b) { state.co = state.co.filter((d) => d.id !== +b.dataset.co); refresh({ recalc: true }); } });
    $('#haveChip').addEventListener('click', (e) => { if (e.target.closest('button[data-have]')) { state.have = null; refresh(); } });
    $('#recent').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) setTarget(byId.get(+b.dataset.pick)); });
    for (const sel of ['#featured', '#heroShow']) $(sel).addEventListener('click', (e) => { const b = e.target.closest('button[data-target]'); if (b) { setTarget(byId.get(+b.dataset.target)); $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    renderFeatured();
    $('#userLv').addEventListener('change', () => { const v = parseInt($('#userLv').value, 10); state.userLv = v >= 1 ? Math.min(99, v) : null; $('#userLv').value = state.userLv ?? ''; store.set('userLv', state.userLv); refresh({ recalc: true }); });
    $('#royal').addEventListener('change', () => { state.royal = +$('#royal').value; store.set('royal', state.royal); refresh(); });
    $('#guild').addEventListener('change', () => { state.guild = +$('#guild').value; store.set('guildGrade', state.guild); refresh(); });
    $('#coloSeason').addEventListener('change', renderColo);
    $('#statsLoad').addEventListener('click', renderStats);
    $('#statsKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderStats(); });
    $('#statsForget').addEventListener('click', () => { try { localStorage.removeItem('dv3.statsKey'); } catch {} $('#statsKey').value = ''; $('#statsOut').innerHTML = '<p class="note">키를 지웠습니다.</p>'; });
    $('#brandHome').addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); location.reload(); }); // 로고 = 초기 화면으로 새로고침
    $('#arenaSeason').addEventListener('change', renderArena);
    $('#metaSeason').addEventListener('change', renderMeta); $('#metaTier').addEventListener('change', renderMeta);
    $('#metaSort').addEventListener('change', (e) => { metaState.sort = e.target.value; renderMeta(); });
    $('#metaQ').addEventListener('input', (e) => { metaState.q = e.target.value; renderMeta(); });
    $('#metaTable').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openMeta(byId.get(+tr.dataset.id)); });
    $('#metaTable').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) openMeta(byId.get(+tr.dataset.id)); } });
    $('#metaDlg').addEventListener('click', (e) => { const dlg = $('#metaDlg'); if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const o = e.target.closest('[data-open]'); if (o) { const d = byId.get(+o.dataset.open); if (metaRows().find((x) => x.id === d.id) || statsFor(d)) openMeta(d); else { dlg.close(); openDex(d); } return; }
      const g = e.target.closest('[data-go]'); if (g) { const d = byId.get(+dlg.dataset.id); dlg.close(); if (g.dataset.go === 'dex') openDex(d); else goFromDex(g.dataset.go, d); } });
    document.addEventListener('click', (e) => { const a = e.target.closest('a[data-meta-open]'); if (!a) return; e.preventDefault(); const d = byId.get(+a.dataset.metaOpen); for (const dl of $$('dialog[open]')) dl.close(); location.hash = 'meta'; renderMeta(); openMeta(d); });
    // 도감
    $('#dexEl').innerHTML = `<button type="button" class="fc on" data-el="all">전체</button>` + Object.entries(META.elements).map(([k, m]) => `<button type="button" class="fc" data-el="${k}"><i style="background:${m.color}"></i>${esc(m.ko)}</button>`).join('');
    $('#dexEl').addEventListener('click', (e) => { const b = e.target.closest('[data-el]'); if (!b) return; dexState.el = b.dataset.el; $$('#dexEl [data-el]').forEach((x) => x.classList.toggle('on', x === b)); renderDex(); });
    for (const [id, key] of [['dexRar', 'rar'], ['dexGet', 'get']]) $('#' + id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; dexState[key] = b.dataset.v; $$('button', $('#' + id)).forEach((x) => x.classList.toggle('on', x === b)); renderDex(); });
    $('#dexQ').addEventListener('input', (e) => { dexState.q = e.target.value; renderDex(); });
    $('#dexSort').addEventListener('change', (e) => { dexState.sort = e.target.value; renderDex(); });
    $('#dexGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) openDex(byId.get(+b.dataset.id)); });
    $('#dexDlg').addEventListener('click', (e) => { const dlg = $('#dexDlg'); if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close(); const g = e.target.closest('[data-go]'); if (g) { const d = byId.get(+dlg.dataset.id); dlg.close(); goFromDex(g.dataset.go, d); } });
    // 공식 확률표
    $('#oddsSec').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) { oddsState.sec = b.dataset.sec; renderOdds(); } });
    // 뽑기
    $('#gaKind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { gaState.kind = b.dataset.v; renderGacha(); } });
    ['gaTarget', 'gaPity', 'gaHeroPity', 'gaGauge'].forEach((id) => { $('#' + id).addEventListener('input', renderGacha); $('#' + id).addEventListener('change', renderGacha); });
    $('#armsForm').addEventListener('input', renderArms);
    // 젬
    combobox({ input: $('#gemDInput'), list: $('#gemDList'), items: () => ALL, onPick: (d) => { gemState.d = d; $('#gemDInput').value = d.name; renderGems(); } });
    $('#gemForm').addEventListener('input', renderGemCalc);
    $('#gemForm').addEventListener('change', renderGemCalc);
    $('#books').addEventListener('change', (e) => { const cb = e.target.closest('input[data-book]'); if (!cb) return; const id = +cb.dataset.book; if (cb.checked) state.noBook.delete(id); else state.noBook.add(id); store.set('noBook', [...state.noBook]); refresh(); });
    $('#mineToggle').addEventListener('change', () => { state.mine = $('#mineToggle').checked; store.set('mine', state.mine); refresh(); });
    $('#minProb').addEventListener('input', () => { state.minProb = +$('#minProb').value; $('#minProbOut').textContent = state.minProb + '%'; refresh(); });
    $('#sortSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-sort]'); if (b) { state.sort = b.dataset.sort; store.set('sort', state.sort); refresh(); } });
    $('#moreBtn').addEventListener('click', () => { state.shown += 60; renderList(); });
    $('#targetCard').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { if (b.dataset.go === 'route') { state.routeTarget = state.target; $('#routeInput').value = `${state.target.name} · T${state.target.tier}`; } location.hash = b.dataset.go; } });

    $('#list').addEventListener('click', (e) => {
      const t = e.target.closest('.more-btn[data-key]');
      if (t) {
        const key = t.dataset.key, box = $(`.others[data-others="${key}"]`), open = box.hidden;
        if (open && !box.innerHTML) { const r = view.find((x) => x.parents[0].id + '-' + x.parents[1].id === key); box.innerHTML = othersHtml(r.pool.filter((x) => !r.probs.some((q) => q.id === x.dragon.id))); }
        box.hidden = !open; t.setAttribute('aria-expanded', String(open));
        if (open) expandedKeys.add(key); else expandedKeys.delete(key);
        return;
      }
      const tr = e.target.closest('[data-try]');
      if (tr) { prefillTries(tr.dataset.try, +tr.dataset.sec); location.hash = 'tries'; return; }
      const tm = e.target.closest('[data-timer]');
      if (tm) {
        const [a, b] = tm.dataset.timer.split(',').map(Number);
        state.tmA = byId.get(a); state.tmB = byId.get(b);
        $('#tmAInput').value = state.tmA.name; $('#tmBInput').value = state.tmB.name;
        $('#tmLabel').value = state.target ? `${state.target.name} 도전` : '';
        const sec = +tm.dataset.sec; $('#tmH').value = Math.floor(sec / 3600); $('#tmM').value = Math.round((sec % 3600) / 60);
        renderTmCands(); location.hash = 'timer'; return;
      }
      const c = e.target.closest('[data-copy]');
      if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast('복사했습니다: ' + c.dataset.copy)).catch(() => toast('복사할 수 없습니다')); }
    });

    // 최단 루트
    $('#routeFrom').addEventListener('click', (e) => { const b = e.target.closest('button[data-from]'); if (b) { state.routeFrom = b.dataset.from; renderRoute(); } });
    // 시도·비용
    ['tryP', 'tryH', 'tryM', 'trySkip', 'tryGauge'].forEach((id) => $('#' + id).addEventListener('input', renderTries));
    // 타이머
    ['tmH', 'tmM'].forEach((id) => $('#' + id).addEventListener('input', renderTmCands));
    $('#tmAdd').addEventListener('click', addTimer);
    $('#timers').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { state.timers = state.timers.filter((t) => t.id !== +b.dataset.del); saveTimers(); renderTimers(); } });
    $('#notifBtn').addEventListener('click', async () => {
      if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않습니다'); return; }
      try { const p = await Notification.requestPermission(); toast(p === 'granted' ? '알림이 허용되었습니다' : '알림이 차단되어 있습니다'); } catch { toast('알림을 허용할 수 없습니다'); }
    });
    // 컬렉션
    $('#colMiss').addEventListener('click', (e) => { const b = e.target.closest('[data-target]'); if (b) { setTarget(byId.get(+b.dataset.target)); location.hash = 'breed'; } });

    // 보유 드래곤 대화상자
    const dlg = $('#ownedDlg');
    const openDlg = () => { renderOwnedGrid(); dlg.showModal(); $('#ownedSearch').focus(); };
    $('#ownedBtn').addEventListener('click', openDlg);
    $('#ownedBtn2').addEventListener('click', openDlg);
    $('#ownedClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { refresh(); showView(state.view, false); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $('#ownedSearch').addEventListener('input', renderOwnedGrid);
    $('#ownedClearAll').addEventListener('click', () => { if (!state.owned.size || confirm('보유 드래곤 등록을 모두 해제할까요?')) { state.owned.clear(); saveOwned(); renderOwnedGrid(); } });
    $('#ownedGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-own]'); if (!b) return; const id = +b.dataset.own; state.owned.has(id) ? state.owned.delete(id) : state.owned.add(id); b.setAttribute('aria-pressed', String(state.owned.has(id))); saveOwned(); $('#ownedDlgCnt').textContent = `${state.owned.size} / ${ALL.length}`; });

    document.addEventListener('keydown', (e) => { if (e.key === '/' && state.view === 'breed' && !/input|select|textarea/i.test(e.target.tagName)) { e.preventDefault(); $('#targetInput').focus(); } });
    if (window.innerWidth <= 900) $('#cond').open = false;

    renderRecent(); renderChips();
    syncUrl(); // 옛 주소에 남은 ?target= 등은 복원하지 않고 지운다 → 링크로 들어오면 항상 초기 화면
    refresh();
    showView(location.hash.slice(1) || 'breed', false);
    if (state.timers.length) { tick = setInterval(tickTimers, 1000); }
  }

  let toastTimer = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000); }

  init();
})();
