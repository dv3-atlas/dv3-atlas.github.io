// 교배 계산 엔진. 브라우저(window)와 Node(globalThis) 양쪽에서 동작한다.
//
// 게임의 교배 규칙 (공개 위키·커뮤니티 정리 + 게임 데이터 기준):
//   1) 두 부모의 속성을 합집합으로 묶는다
//   2) 각 드래곤의 조건(테이머 레벨, 3속성은 부모 둘 다 2속성 이상, 필수 속성, 속성 수, 기간 한정)을 모두 통과해야 자손 후보
//   3) 고정 확률종이 먼저 절대 퍼센트를 가져가고(티어별 합계 상한), 나머지를 일반종이 가중치 비율로 나눈다
//   4) 단속성 드래곤을 같은 종끼리 교배하면 그 드래곤이 100%
//
// 이 파일의 아래쪽(pairTable, roadmap, bestFrom, attemptStats)은 이 계산기만의 기능이다.
(function (root) {
  'use strict';

  const dragons = () => root.DV3_DRAGONS;
  const meta = () => root.DV3_META;

  let _byId = null;
  function byId() {
    if (!_byId) { _byId = new Map(); for (const d of dragons()) _byId.set(d.id, d); }
    return _byId;
  }
  const parents = () => dragons().filter((d) => d.canBreed).sort((a, b) => a.tier - b.tier || a.id - b.id);
  const parseDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);
  const sig = (d) => [...d.elements].sort().join('+');
  const obtainable = (d) => d.portion > 0 || d.fixed > 0;

  function limitedState(d, now = new Date()) {
    if (!d.breedStart && !d.breedEnd) return null;
    const start = parseDate(d.breedStart), end = parseDate(d.breedEnd);
    if (start && now < start) return { state: 'future', start, end };
    if (end && now > end) return { state: 'past', start, end };
    return { state: 'active', start, end };
  }

  function activeRateUp(now = new Date()) {
    for (const ev of meta().rateUpEvents || []) {
      const s = parseDate(ev.start), e = parseDate(ev.end);
      if (s && e && now >= s && now <= e) return { ...ev, ids: new Set(ev.dragonIds) };
    }
    return null;
  }

  // 부모 속성 배열 두 개 → 자손 후보와 확률 [{dragon, p, via}]
  function computePool(elA, elB, o = {}) {
    // exclude: 후보에서 뺄 드래곤 id 집합(비밀 교배서가 없는 드래곤 등). 빠지면 같은 티어 고정종의 상한 분배가 달라진다
    const { userLv = 999, didA = null, didB = null, rateUp = null, now = new Date(), exclude = null } = o;
    const union = [...new Set([...elA, ...elB])];
    const have = new Set(union);
    const count = union.length;
    const bothMulti = elA.length >= 2 && elB.length >= 2;
    // 같은 종끼리는 교배 자체가 안 된다 (게임 규칙, 2026-09-14 사용자 확인)
    if (didA != null && didA === didB) return [];
    const cands = dragons().filter((d) => {
      if (exclude && exclude.has(d.id)) return false;
      if (d.reqUserLv > userLv) return false;
      if (d.elements.length >= 3 && !bothMulti) return false;
      if (d.reqParentEle && !d.elements.every((e) => have.has(e))) return false;
      if ((d.reqEleCnt || 0) > count) return false;
      if (d.reqEleIds && d.reqEleIds.length && !d.reqEleIds.every((e) => have.has(e))) return false;
      const lim = limitedState(d, now);
      return !(lim && lim.state !== 'active');
    });
    const byTier = new Map();
    for (const d of cands) if (d.fixed > 0) { if (!byTier.has(d.tier)) byTier.set(d.tier, []); byTier.get(d.tier).push(d); }
    const fixedRows = [];
    for (const [tier, list] of byTier) {
      const sum = list.reduce((a, d) => a + d.fixed, 0);
      const cap = meta().tierFixedCap[tier] || 0;
      const k = cap && sum > cap ? cap / sum : 1;
      for (const d of list) {
        let v = d.fixed * k;
        if (rateUp && rateUp.ids.has(d.id)) v += d.fixed * (rateUp.multiplier - 2);
        fixedRows.push({ dragon: d, p: v / 100, via: 'fixed' });
      }
    }
    const remain = Math.max(0, 100 - fixedRows.reduce((a, r) => a + r.p, 0));
    const weighted = [];
    for (const d of cands) {
      if (d.fixed > 0) continue;
      let w = d.portion;
      if (w <= 0) continue;
      if (rateUp && rateUp.ids.has(d.id)) w *= rateUp.multiplier;
      weighted.push({ d, w });
    }
    const wsum = weighted.reduce((a, x) => a + x.w, 0);
    const rows = [...fixedRows];
    if (wsum > 0) for (const { d, w } of weighted) rows.push({ dragon: d, p: (remain * w) / wsum, via: 'portion' });
    return rows.sort((a, b) => b.p - a.p);
  }

  // 목표 드래곤(들)을 얻을 수 있는 부모 조합. 같은 속성 조합끼리는 결과가 같아 대표 부모만 담는다
  function findRecipes(targetIds, o = {}) {
    const targets = targetIds.map((id) => byId().get(id)).filter(Boolean);
    if (!targets.length) return [];
    const mainId = targets[0].id;
    const need = new Set(targets.flatMap((t) => (t.reqEleIds && t.reqEleIds.length ? t.reqEleIds : t.elements)));
    const ps = parents();
    const seen = new Set();
    const out = [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) { // j = i(같은 종)는 교배 불가라 제외
        const A = ps[i], B = ps[j];
        const u = new Set([...A.elements, ...B.elements]);
        let ok = true;
        for (const e of need) if (!u.has(e)) { ok = false; break; }
        if (!ok) continue;
        const key = [sig(A), sig(B)].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const pool = computePool(A.elements, B.elements, { ...o, didA: A.id, didB: B.id });
        const probs = [];
        let all = true;
        for (const t of targets) {
          const r = pool.find((x) => x.dragon.id === t.id);
          if (!r) { all = false; break; }
          probs.push({ id: t.id, name: t.name, p: r.p, isGoal: t.id === mainId });
        }
        if (!all) continue;
        out.push({ parents: [A, B], probs, sec: Math.max(...targets.map((t) => t.brdSec)), expSec: expectedSec(pool), pool });
      }
    }
    return out.sort((a, b) => b.probs[0].p - a.probs[0].p);
  }

  const expectedSec = (pool) => pool.reduce((a, r) => a + (r.p / 100) * r.dragon.brdSec, 0);

  function alternatives(parent, pool = null) {
    const s = sig(parent);
    return (pool || parents()).filter((d) => d.id !== parent.id && d.canBreed && sig(d) === s).sort((a, b) => a.tier - b.tier || a.id - b.id);
  }

  // 교배시간 감소: 로얄클래스 감소율 + 추가 감소율(길드 버프 등, 0~1). 두 감소율은 합산 적용으로 가정
  function royalSec(sec, royalId, extraPct = 0) {
    const r = meta().royal.find((x) => x.id === Number(royalId));
    const pct = Math.min(0.95, (r ? r.pct : 0) + (Number(extraPct) || 0));
    if (pct <= 0 || sec <= 0) return sec;
    const ms = sec * 1000;
    return Math.floor(Math.floor(ms - ms * pct) / 1000);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}일`);
    if (h) parts.push(`${h}시간`);
    if (m || !parts.length) parts.push(`${m}분`);
    return parts.slice(0, 2).join(' ');
  }

  // ───────── 이 계산기만의 기능 ─────────

  // 속성 조합(서명) 쌍 전체의 자손 풀을 한 번에 계산해 두는 표. 옵션이 같으면 재사용
  let _tableCache = null;
  function pairTable(o = {}) {
    const key = JSON.stringify({ lv: o.userLv ?? 999, ru: o.rateUp ? [...o.rateUp.ids].join(',') + '@' + o.rateUp.multiplier : '', day: (o.now || new Date()).toDateString() });
    if (_tableCache && _tableCache.key === key) return _tableCache;
    const groups = new Map(); // 서명 → 그 서명을 가진 드래곤들
    for (const d of parents()) { const s = sig(d); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(d); }
    const reps = new Map([...groups].map(([s, l]) => [s, l[0]]));
    const sigs = [...reps.keys()];
    const table = new Map();
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i; j < sigs.length; j++) {
        // 같은 서명끼리(i === j)는 종이 둘 이상일 때만 가능(같은 종은 교배 불가)
        const A = reps.get(sigs[i]), B = i === j ? groups.get(sigs[i])[1] : reps.get(sigs[j]);
        const pool = B ? computePool(A.elements, B.elements, { ...o, didA: A.id, didB: B.id }) : [];
        table.set(sigs[i] + '|' + sigs[j], { a: sigs[i], b: sigs[j], pool, expSec: expectedSec(pool) });
      }
    }
    const cell = (sa, sb) => table.get(sa <= sb ? sa + '|' + sb : sb + '|' + sa);
    _tableCache = { key, reps, sigs, table, cell };
    return _tableCache;
  }

  // 가용 드래곤(보유 등)에서 목표까지 최단 교배 루트. 세대 단위로 넓혀 가며 단계 수를 최소화하고, 같은 단계면 확률이 높은 조합을 고른다
  function roadmap(targetId, availableIds, o = {}) {
    const target = byId().get(targetId);
    if (!target) return null;
    const T = pairTable(o);
    const have = new Map();   // 서명 → 그 서명을 제공하는 드래곤
    const reached = new Map(); // 드래곤 id → { step, p, a, b, pool }
    for (const id of availableIds) {
      const d = byId().get(id);
      if (!d) continue;
      reached.set(d.id, { step: 0 });
      if (d.canBreed) { const s = sig(d); if (!have.has(s)) have.set(s, d); }
    }
    if (reached.has(targetId)) return { steps: 0, chain: [], target };
    for (let step = 1; step <= 10; step++) {
      const sigs = [...have.keys()];
      const found = new Map();
      for (let i = 0; i < sigs.length; i++) {
        for (let j = i; j < sigs.length; j++) {
          const c = T.cell(sigs[i], sigs[j]);
          if (!c) continue;
          for (const r of c.pool) {
            if (reached.has(r.dragon.id)) continue;
            const cur = found.get(r.dragon.id);
            if (!cur || r.p > cur.p || (r.p === cur.p && c.expSec < cur.expSec)) found.set(r.dragon.id, { p: r.p, a: sigs[i], b: sigs[j], pool: c.pool, expSec: c.expSec });
          }
        }
      }
      if (!found.size) break;
      for (const [id, f] of found) reached.set(id, { step, ...f });
      for (const [id] of found) { const d = byId().get(id); if (d.canBreed) { const s = sig(d); if (!have.has(s)) have.set(s, d); } }
      if (reached.has(targetId)) break;
    }
    const t = reached.get(targetId);
    if (!t || t.step === 0) return null;
    const chain = [];
    const seen = new Set();
    const expand = (d) => {
      const r = reached.get(d.id);
      if (!r || r.step === 0 || seen.has(d.id)) return;
      seen.add(d.id);
      const pa = have.get(r.a), pb = have.get(r.b);
      expand(pa); expand(pb);
      chain.push({ step: r.step, dragon: d, parents: [pa, pb], p: r.p, pool: r.pool, expSec: r.expSec });
    };
    expand(target);
    chain.sort((x, y) => x.step - y.step);
    return { steps: t.step, chain, target };
  }

  // 가용 드래곤만으로 얻을 수 있는 드래곤별 최고 확률 조합 (컬렉션 대시보드용)
  function bestFrom(availableIds, o = {}) {
    const T = pairTable(o);
    const have = new Map();
    const owned = new Set(availableIds);
    for (const id of availableIds) { const d = byId().get(id); if (d && d.canBreed) { const s = sig(d); if (!have.has(s)) have.set(s, d); } }
    const sigs = [...have.keys()];
    const best = new Map();
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i; j < sigs.length; j++) {
        const c = T.cell(sigs[i], sigs[j]);
        if (!c) continue;
        for (const r of c.pool) {
          if (owned.has(r.dragon.id)) continue;
          const cur = best.get(r.dragon.id);
          if (!cur || r.p > cur.p) best.set(r.dragon.id, { dragon: r.dragon, p: r.p, parents: [have.get(sigs[i]), have.get(sigs[j])], expSec: c.expSec });
        }
      }
    }
    return [...best.values()].sort((a, b) => b.p - a.p);
  }

  // 시도 횟수 통계. p는 퍼센트, secPerTry는 1회 교배시간(초)
  function attemptStats(p, secPerTry, skipCost = 30) {
    const q = Math.min(1, Math.max(0, p / 100));
    const within = (n) => (q >= 1 ? 1 : 1 - Math.pow(1 - q, n));
    const need = (conf) => (q <= 0 ? Infinity : q >= 1 ? 1 : Math.ceil(Math.log(1 - conf) / Math.log(1 - q)));
    const expected = q > 0 ? 1 / q : Infinity;
    return { q, within, need, expected, n50: need(0.5), n90: need(0.9), n99: need(0.99), expectedSec: expected * secPerTry, skipCost: expected * skipCost };
  }

  root.DV3Engine = { computePool, findRecipes, alternatives, limitedState, activeRateUp, royalSec, fmtTime, sig, byId, parents, obtainable, expectedSec, pairTable, roadmap, bestFrom, attemptStats };
})(typeof window !== 'undefined' ? window : globalThis);
