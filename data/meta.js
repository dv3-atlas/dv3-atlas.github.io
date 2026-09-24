// 계산기에서 쓰는 보조 표. 게임 용어(속성·희귀도·로얄클래스)와 이 계산기의 색상 팔레트.
window.DV3_META = {
  version: '9/10 업데이트 반영',
  dataDate: '2026-09-14',

  // 속성: 게임 내 한국어 명칭과 이 계산기의 표시 색
  elements: {
    fire:      { ko: '불',   color: '#f97316' },
    water:     { ko: '물',   color: '#3b82f6' },
    wind:      { ko: '바람', color: '#22c55e' },
    earth:     { ko: '땅',   color: '#b45309' },
    steel:     { ko: '강철', color: '#94a3b8' },
    lightning: { ko: '번개', color: '#f59e0b' },
    light:     { ko: '빛',   color: '#fde047' },
    dark:      { ko: '어둠', color: '#4c1d95' },
    dream:     { ko: '꿈',   color: '#ec4899' },
    soul:      { ko: '영혼', color: '#2dd4bf' },
    dawn:      { ko: '여명', color: '#fb7185' },
    dusk:      { ko: '황혼', color: '#a78bfa' },
    divine:    { ko: '신성', color: '#e2e8f0' },
    chaos:     { ko: '혼돈', color: '#1f2937' },
    shadow:    { ko: '그림자', color: '#475569' }, // 2026-09-10 추가 속성
  },

  rarity: { 3: '레어', 4: '에픽', 5: '레전드' },

  // 로얄클래스별 교배시간 감소율
  royal: [
    { id: 0, name: '노멀',     pct: 0 },
    { id: 1, name: '아이언',   pct: 0.05 },
    { id: 2, name: '스틸',     pct: 0.05 },
    { id: 3, name: '티타늄',   pct: 0.08 },
    { id: 4, name: '플래티넘', pct: 0.08 },
    { id: 5, name: '다이아',   pct: 0.10 },
    { id: 6, name: 'MVP',      pct: 0.10 },
  ],

  // 길드 버프 등급별 건설·교배·부화 시간 감소율 (2026-09-14 게임 화면 기준, 지난 7일 길드 버프 포인트로 등급 결정)
  guild: [
    { id: 0, name: '없음', pct: 0 },
    { id: 1, name: 'F',    pct: 0.003 },
    { id: 2, name: 'E',    pct: 0.006 },
    { id: 3, name: 'D',    pct: 0.009 },
    { id: 4, name: 'C',    pct: 0.012 },
    { id: 5, name: 'B',    pct: 0.015 },
    { id: 6, name: 'A',    pct: 0.02 },
    { id: 7, name: 'S',    pct: 0.025 },
    { id: 8, name: 'SS',   pct: 0.03 },
    { id: 9, name: 'SSS',  pct: 0.04 },
  ],

  // 고정 확률종의 티어별 합계 상한 (단위: 0.01%). 없는 티어는 상한 없음
  tierFixedCap: { 5: 1000, 6: 600, 7: 300, 8: 150 },

  // 교배 확률업 이벤트는 data/events.js 에서 관리한다 (그 파일이 이 배열을 채운다)
  rateUpEvents: [],
};
