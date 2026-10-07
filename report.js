// 수도 내신분석 — 학부모용 분석지 3종 (간결 A4 · 카톡 카드 · 상세 2쪽)과 이미지 만들기
// 분석지는 화면 테마와 상관없이 항상 같은 색(인쇄·카톡용)으로 그린다.
(function () {
  const K = {
    g: '#0A4844', g2: '#2E7566', g3: '#5E9E91', mint: '#8FC4B7', pale: '#CFE5DF', soft: '#E3F0EC',
    gold: '#9A6A1F', gold2: '#C9A867', goldSoft: '#F6EBD6', goldFg: '#6B4A12',
    ink: '#18211F', ink2: '#3F4B47', mute: '#56635F', line: '#DCE3E0', cream: '#F5F4EF', bg2: '#F3F6F4'
  };
  const DC = ['', K.pale, K.mint, K.g2, K.gold];
  const DT = ['', K.g, '#062E2B', '#FFFFFF', '#FFFFFF'];
  const DIFF = ['', '기본', '응용', '실력', '심화'];
  const LEVEL = { 하: [1, '쉬웠어요'], 중하: [2, '무난했어요'], 중: [3, '보통이었어요'], 중상: [4, '조금 어려웠어요'], 상: [5, '어려웠어요'] };
  const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const strip = s => String(s || '').replace(/^[^.]*\./, '').trim();
  const short = s => s.replace(/중$/, '');

  // ---------- 숫자 계산 ----------
  function summarize(e, ctx) {
    const it = e.an.items, n = it.length;
    const total = it.reduce((s, i) => s + i[1], 0);
    const cnt = [0, 0, 0, 0, 0], pts = [0, 0, 0, 0, 0];
    it.forEach(i => { cnt[i[2]]++; pts[i[2]] += i[1]; });
    const sumBy = key => {
      const m = {}; it.forEach(i => { const k = key(i); if (k) m[k] = (m[k] || 0) + i[1]; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const bigs = sumBy(i => strip(i[5]));
    const mids = sumBy(i => i[6]);
    const objMax = Math.max(...it.filter(i => !i[9]).map(i => i[1]));
    let killers = it.filter(i => i[2] === 4);
    if (!killers.length) killers = it.filter(i => i[2] === 3 && i[1] >= objMax);
    const beh = { U: 0, C: 0, R: 0, P: 0 }; it.forEach(i => { if (beh[i[3]] !== undefined) beh[i[3]] += i[1]; });
    const lv = LEVEL[e.an.level] || [3, '보통이었어요'];
    const cuts = e.an.cuts || {};
    const essayN = it.filter(i => i[9]).length, essayPts = it.filter(i => i[9]).reduce((s, i) => s + i[1], 0);
    const prev = ctx.previous(e);
    const habits = ctx.habits(e.s);
    // 다음 시험 준비 — 데이터에서 자동으로 만든 문장 (분석지 화면에서 고칠 수 있음)
    const todo = [];
    if (mids[0]) todo.push([`${strip(mids[0][0])} 집중`, `이번 시험에서 ${Math.round(mids[0][1])}점으로 가장 많이 나온 단원입니다.`]);
    if (killers.length) {
      const k = killers[killers.length - 1];
      todo.push([`${killers.map(x => x[0]).join('·')}번 유형 대비`, `${strip(k[7] || k[6])} 같은 고난도 문제를 시간 재고 풀어 보기`]);
    }
    if (essayN) todo.push(['서술형 풀이 쓰기', `서답형 ${essayN}문항 ${essayPts}점. 풀이 과정을 끝까지 쓰는 연습`]);
    else todo.push(['마킹 전 검산', '객관식만 나와 부분 점수가 없습니다. 계산 실수를 줄이는 습관']);
    return { it, n, total, cnt, pts, bigs, mids, objMax, killers, beh, lv, cuts, essayN, essayPts, prev, habits, todo: todo.slice(0, 3) };
  }

  // ---------- 공통 조각 ----------
  const logo = () => `<img src="assets/logo-green.svg" alt="수학도서관" style="width:196px;height:auto;display:block">`;
  function itemMap(S, h1, h2, gap) {
    return `<div style="display:grid;grid-template-columns:repeat(${S.n},minmax(0,1fr));gap:${gap}px;align-items:end">${S.it.map(i => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <div style="width:100%;height:${i[1] >= S.objMax && !i[9] ? h2 : h1}px;border-radius:4px 4px 0 0;background:${DC[i[2]]}"></div>
        <span style="font-size:10px;color:${K.mute}">${i[0]}</span></div>`).join('')}</div>`;
  }
  const legend = S => `<div style="display:flex;gap:14px;font-size:12px;color:${K.ink2};flex-wrap:wrap">${[1, 2, 3, 4].map(k =>
    `<span><b style="color:${DC[k]}">■</b> ${DIFF[k]} ${S.cnt[k]}문항</span>`).join('')}<span style="color:${K.mute}">· 막대가 높을수록 최고 배점</span></div>`;
  const editable = (txt, tag = 'span', style = '') => `<${tag} contenteditable="true" spellcheck="false" style="${style};outline:none">${esc(txt)}</${tag}>`;

  // ---------- 1. 간결 A4 ----------
  function simple(e, S) {
    const big = S.bigs.slice(0, 3);
    const tot = S.total || 100;
    const unitBar = big.map(([name, p], k) => `<div style="flex:${p};background:${k === 0 ? K.g : k === 1 ? K.mint : K.pale};color:${k === 0 ? '#fff' : K.g};display:flex;align-items:center;padding:0 12px;white-space:nowrap;overflow:hidden">${esc(name)} ${Math.round(p)}점</div>`).join('');
    const cut1 = S.cuts['1등급'] ? S.cuts['1등급'] : '—';
    const others = ['2등급', '3등급'].filter(g => S.cuts[g]).map(g => `${g.replace('등급', '등급')} ${S.cuts[g]}`).join(' · ');
    const killerTxt = S.killers.length ? S.killers.map(i => i[0]).join('·') + '번' : '—';
    const killerSub = S.killers.length ? `${S.killers.every(i => i[0] > S.n - 4) ? '마지막 문제들' : '고난도 문항'}, ${[...new Set(S.killers.map(i => i[1]))].join('·')}점<br>${esc(strip(S.killers[0][6]))}` : '';
    const prevTxt = S.prev ? `직전 시험(${S.prev.label})과 비교: 실력·심화 ${S.prev.top}점 → ${S.pts[3] + S.pts[4]}점` : '';
    return `<div class="rpt" data-w="794" style="width:794px;min-height:1123px;box-sizing:border-box;padding:40px 44px 30px;background:#fff;font-family:${FONT};color:${K.ink};display:flex;flex-direction:column;gap:22px">
      <header style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${K.g};padding-bottom:14px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="font-size:12px;font-weight:700;color:${K.gold};letter-spacing:2px">수도 내신분석</div>
          <div style="font-size:28px;font-weight:900;letter-spacing:-.5px;color:${K.g}">${esc(short(e.s))}중 ${e.g}학년 ${e.t}학기 ${e.x}</div>
          <div style="font-size:13px;color:${K.mute}">${e.y} · ${esc(big.map(b => b[0]).join(' · '))} · ${S.n}문항${S.essayN ? ` (서답형 ${S.essayN})` : ' · 객관식'}</div>
        </div>${logo()}</header>
      <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
        <div style="border-radius:14px;background:${K.g};color:#fff;padding:18px;display:flex;flex-direction:column;gap:6px">
          <span style="font-size:13px;font-weight:700;color:#CFE0DB">이번 시험 난이도</span>
          <span style="font-size:${S.lv[1].length > 5 ? 24 : 30}px;font-weight:900;letter-spacing:-1px;white-space:nowrap">${S.lv[1]}</span>
          <div style="display:flex;gap:4px">${[1, 2, 3, 4, 5].map(k => `<span style="flex:1;height:8px;border-radius:4px;background:${k <= S.lv[0] ? K.gold2 : '#2D6A64'}"></span>`).join('')}</div>
          <span style="font-size:12px;color:#CFE0DB">5단계 중 ${S.lv[0]}</span></div>
        <div style="border-radius:14px;background:${K.cream};padding:18px;display:flex;flex-direction:column;gap:6px">
          <span style="font-size:13px;font-weight:700;color:${K.mute}">예상 1등급 컷</span>
          <span style="font-size:34px;font-weight:900;letter-spacing:-1px;color:${K.g}">${esc(cut1)}</span>
          <span style="font-size:12px;color:${K.mute};line-height:1.5">${esc(others)}<br>AI 추정 · 실제 발표 시 교체</span></div>
        <div style="border-radius:14px;background:${K.goldSoft};padding:18px;display:flex;flex-direction:column;gap:6px">
          <span style="font-size:13px;font-weight:700;color:${K.goldFg}">등급을 가른 문제</span>
          <span style="font-size:${killerTxt.length > 8 ? 26 : 34}px;font-weight:900;letter-spacing:-1px;color:${K.goldFg}">${killerTxt}</span>
          <span style="font-size:12px;color:${K.goldFg};line-height:1.5">${killerSub}</span></div>
      </section>
      <section style="display:flex;flex-direction:column;gap:10px">
        <div style="font-size:17px;font-weight:900;color:${K.g}">① 어디서 많이 나왔나요?</div>
        <div style="display:flex;height:40px;border-radius:10px;overflow:hidden;font-size:14px;font-weight:700">${unitBar}</div>
        ${S.mids.slice(0, 3).map(([m, p]) => `<div style="display:flex;justify-content:space-between;font-size:13.5px;color:${K.ink2};border-bottom:1px solid ${K.line};padding:4px 0"><span>${esc(strip(m))}</span><b>${Math.round(p)}점</b></div>`).join('')}
      </section>
      <section style="display:flex;flex-direction:column;gap:10px">
        <div style="font-size:17px;font-weight:900;color:${K.g}">② 문제는 어떻게 배치됐나요?</div>
        ${itemMap(S, 38, 54, 3)}${legend(S)}
        ${prevTxt ? `<div style="font-size:13.5px;color:${K.ink2}">${esc(prevTxt)}</div>` : ''}
      </section>
      ${S.habits.length ? `<section style="display:flex;flex-direction:column;gap:9px;border-radius:14px;border:1px solid ${K.line};padding:16px 18px">
        <div style="font-size:17px;font-weight:900;color:${K.g}">③ ${esc(short(e.s))}중은 이렇게 출제해요 <span style="font-size:12px;font-weight:500;color:${K.mute}">분석한 시험 기준</span></div>
        ${S.habits.slice(0, 3).map(h => `<div style="display:flex;gap:10px;align-items:baseline;font-size:14px;line-height:1.6"><span style="flex:0 0 auto;width:8px;height:8px;border-radius:99px;background:${K.gold}"></span><span>${esc(h[1])}</span></div>`).join('')}
      </section>` : ''}
      <section style="display:flex;flex-direction:column;gap:10px;flex:1">
        <div style="font-size:17px;font-weight:900;color:${K.g}">④ 다음 시험, 이것만 준비하세요</div>
        <div style="display:grid;grid-template-columns:repeat(${S.todo.length},minmax(0,1fr));gap:12px">${S.todo.map((t, k) => `
          <div style="border-radius:12px;background:${K.cream};padding:14px;display:flex;flex-direction:column;gap:6px">
            <span style="font-size:22px;font-weight:900;color:${K.gold}">0${k + 1}</span>
            ${editable(t[0], 'span', 'font-size:15px;font-weight:700')}
            ${editable(t[1], 'span', `font-size:13px;line-height:1.6;color:${K.ink2}`)}</div>`).join('')}</div>
      </section>
      <footer style="display:flex;justify-content:space-between;font-size:11px;color:${K.mute};border-top:1px solid ${K.line};padding-top:10px">
        <span>수학도서관이 실제 시험지를 문항별로 분류해 작성했습니다.</span><span style="font-weight:700;color:${K.g}">1:1 명품 맞춤 수학학원 수학도서관</span></footer>
    </div>`;
  }

  // ---------- 2. 카톡 카드 ----------
  function card(e, S) {
    const big = S.bigs.slice(0, 3);
    const tot = big.reduce((a, b) => a + b[1], 0) || 1;
    return `<div class="rpt" data-w="390" style="width:390px;box-sizing:border-box;background:${K.cream};font-family:${FONT};color:${K.ink};display:flex;flex-direction:column">
      <div style="background:${K.g};padding:24px 22px 22px;display:flex;flex-direction:column;gap:14px">
        <img src="assets/logo-white.svg" alt="수학도서관" style="width:150px;height:auto;display:block">
        <div><div style="font-size:13px;font-weight:700;color:${K.gold2}">${e.y} ${e.t}학기 ${e.x} 분석</div>
        <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-.5px;line-height:1.3">${esc(short(e.s))}중 ${e.g}학년<br>한눈에 보기</div></div></div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:#fff;border-radius:14px;padding:14px 16px"><div style="font-size:12px;font-weight:700;color:${K.mute}">난이도</div><div style="font-size:${S.lv[1].length > 5 ? 18 : 22}px;font-weight:900;color:${K.g};white-space:nowrap">${S.lv[1]}</div><div style="font-size:12px;color:${K.mute}">5단계 중 ${S.lv[0]}</div></div>
          <div style="background:#fff;border-radius:14px;padding:14px 16px"><div style="font-size:12px;font-weight:700;color:${K.mute}">예상 1등급 컷</div><div style="font-size:22px;font-weight:900;color:${K.g}">${esc(S.cuts['1등급'] || '—')}</div><div style="font-size:12px;color:${K.mute}">AI 추정</div></div>
        </div>
        <div style="background:#fff;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:15px;font-weight:900;color:${K.g}">어디서 나왔나요</div>
          ${big.map(([nm, p], k) => `<div><div style="display:flex;justify-content:space-between;font-size:13px"><span>${esc(nm)}</span><b>${Math.round(p)}점</b></div>
            <div style="height:12px;border-radius:6px;background:#ECF1EF;overflow:hidden;margin-top:3px"><div style="width:${Math.round(p / tot * 100)}%;height:100%;background:${k === 0 ? K.g : K.mint}"></div></div></div>`).join('')}
        </div>
        ${S.killers.length ? `<div style="background:${K.goldSoft};border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px">
          <div style="font-size:15px;font-weight:900;color:${K.goldFg}">등급을 가른 문제</div>
          <div style="font-size:26px;font-weight:900;color:${K.goldFg}">${S.killers.map(i => i[0]).join(' · ')}번</div>
          <div style="font-size:13px;line-height:1.6;color:${K.goldFg}">${esc(strip(S.killers[0][6]))} 단원의 고난도 문제입니다.</div></div>` : ''}
        <div style="background:#fff;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:6px">
          <div style="font-size:15px;font-weight:900;color:${K.g}">문제 배치</div>${itemMap(S, 22, 32, 2)}</div>
        ${S.habits.length ? `<div style="background:#fff;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:15px;font-weight:900;color:${K.g}">${esc(short(e.s))}중 출제 습관</div>
          ${S.habits.slice(0, 3).map(h => `<div style="display:flex;gap:8px;font-size:13.5px;line-height:1.5"><b style="color:${K.gold};flex:0 0 auto">${esc(h[0])}</b><span>${esc(h[1])}</span></div>`).join('')}</div>` : ''}
        <div style="background:${K.g};border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;color:#fff">
          <div style="font-size:15px;font-weight:900;color:${K.gold2}">다음 시험 준비 ${S.todo.length}가지</div>
          ${S.todo.map((t, k) => `<div style="display:flex;gap:10px;font-size:14px;line-height:1.5"><b style="color:${K.gold2}">0${k + 1}</b>${editable(t[0] + ' — ' + t[1])}</div>`).join('')}</div>
        <div style="text-align:center;font-size:12px;color:${K.mute};padding:4px 0 6px">1:1 명품 맞춤 수학학원 · 수학도서관</div>
      </div></div>`;
  }

  // ---------- 3. 상세 2쪽 ----------
  function radar(beh, prev) {
    const max = Math.max(40, beh.U, beh.R, beh.P, beh.C, ...(prev ? [prev.U, prev.R, prev.P, prev.C] : []));
    const pt = b => { const r = v => v / max * 100; return `120,${120 - r(b.U)} ${120 + r(b.R)},120 120,${120 + r(b.P)} ${120 - r(b.C)},120`; };
    return `<svg width="210" height="210" viewBox="0 0 240 240" role="img" aria-label="행동영역 배점">
      <g fill="none" stroke="${K.line}" stroke-width="1">${[100, 75, 50, 25].map(r => `<polygon points="120,${120 - r} ${120 + r},120 120,${120 + r} ${120 - r},120"></polygon>`).join('')}
      <line x1="120" y1="20" x2="120" y2="220"></line><line x1="20" y1="120" x2="220" y2="120"></line></g>
      ${prev ? `<polygon points="${pt(prev)}" fill="${K.gold2}" fill-opacity="0.25" stroke="${K.gold}" stroke-width="2" stroke-dasharray="5 4"></polygon>` : ''}
      <polygon points="${pt(beh)}" fill="${K.g}" fill-opacity="0.18" stroke="${K.g}" stroke-width="2.5"></polygon>
      <g font-family="${FONT}" font-size="13" font-weight="700" fill="${K.ink}">
      <text x="120" y="13" text-anchor="middle">이해</text><text x="236" y="112" text-anchor="end">추론</text>
      <text x="120" y="236" text-anchor="middle">문제해결</text><text x="4" y="112">계산</text></g></svg>`;
  }
  function detail1(e, S) {
    const tile = (bg, fg, k, v, s) => `<div style="border-radius:10px;padding:10px 12px;background:${bg};color:${fg};display:flex;flex-direction:column;gap:2px"><span style="font-size:11px;font-weight:700;opacity:.85">${k}</span><span style="font-size:24px;font-weight:900;letter-spacing:-.5px;line-height:1.15">${v}</span><span style="font-size:11px;opacity:.85">${s}</span></div>`;
    const big0 = S.bigs[0] || ['—', 0];
    const pb = S.prev && S.prev.beh;
    const maxMid = S.mids.length ? S.mids[0][1] : 1;
    return `<div class="rpt" data-w="794" style="width:794px;min-height:1123px;box-sizing:border-box;padding:36px 40px 28px;background:#fff;font-family:${FONT};color:${K.ink};display:flex;flex-direction:column;gap:16px">
      <header style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid ${K.g};padding-bottom:10px">
        <div><div style="font-size:12px;font-weight:700;color:${K.gold};letter-spacing:2px">수도 상세 분석지 · 1</div>
        <div style="font-size:25px;font-weight:900;letter-spacing:-.5px">${esc(e.s)} ${e.g}학년 ${e.t}학기 ${e.x}고사 분석</div></div>${logo()}</header>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
        ${tile(K.bg2, K.ink, '총 문항', S.n + '문항', `${S.total}점 · ${S.essayN ? '서답형 ' + S.essayN : '모두 객관식'}`)}
        ${tile(K.bg2, K.ink, '가장 큰 단원', Math.round(big0[1]) + '점', esc(big0[0]))}
        ${tile(K.g, '#fff', '실력 + 심화', (S.pts[3] + S.pts[4]) + '점', `${S.cnt[3] + S.cnt[4]}문항 · 등급을 가르는 구간`)}
        ${tile(K.gold, '#fff', '킬러 문항', S.killers.length ? S.killers.map(i => i[0]).join('·') + '번' : '—', `체감 난이도 ${esc(e.an.level || '—')}`)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
          <div style="font-size:14px;font-weight:700">난이도 구성 <span style="font-weight:500;color:${K.mute};font-size:12px">배점 기준${S.prev ? ' · ' + esc(S.prev.label) + ' 대비' : ''}</span></div>
          <div style="display:flex;height:26px;border-radius:6px;overflow:hidden">${[1, 2, 3, 4].filter(k => S.pts[k]).map(k => `<div style="flex:${S.pts[k]};background:${DC[k]};color:${DT[k]};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${S.pts[k]}</div>`).join('')}</div>
          ${[1, 2, 3, 4].map(k => `<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span style="width:12px;height:12px;border-radius:3px;background:${DC[k]}"></span><b style="width:34px">${DIFF[k]}</b><span style="width:58px">${S.cnt[k]}문항</span><b style="width:44px">${S.pts[k]}점</b>${S.prev ? `<span style="color:${K.mute};font-size:12px">이전 ${S.prev.cnt[k]}문항</span>` : ''}</div>`).join('')}
        </section>
        <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px">
          <div style="font-size:14px;font-weight:700">행동영역별 배점 <span style="font-weight:500;color:${K.mute};font-size:12px">${pb ? '실선 이번 · 점선 이전' : ''}</span></div>
          <div style="display:flex;align-items:center;gap:8px">${radar(S.beh, pb)}
            <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;flex:1">${[['U', '이해'], ['R', '추론'], ['P', '문제해결'], ['C', '계산']].map(([k, nm]) => `<div style="border-bottom:1px solid #ECF1EF;padding-bottom:4px"><b>${nm}</b><br><b style="font-size:15px">${S.beh[k]}</b> <span style="color:${K.mute}">점${pb ? ' · 이전 ' + pb[k] + '점' : ''}</span></div>`).join('')}</div></div>
        </section>
      </div>
      <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:14px;font-weight:700">문항 지도 <span style="font-weight:500;color:${K.mute};font-size:12px">막대 높이 = 배점 · 색 = 난이도</span></div>
        ${itemMap(S, 46, 64, 4)}${legend(S)}</section>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1">
        <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:9px">
          <div style="font-size:14px;font-weight:700">중단원별 배점</div>
          ${S.mids.slice(0, 7).map(([m, p]) => `<div><div style="display:flex;justify-content:space-between;font-size:12px"><span>${esc(m)}</span><b>${Math.round(p)}점</b></div><div style="height:10px;background:#ECF1EF;border-radius:5px;overflow:hidden;margin-top:3px"><div style="height:100%;width:${Math.round(p / maxMid * 100)}%;background:${K.g3};border-radius:5px"></div></div></div>`).join('')}
        </section>
        <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;background:#FAF8F2">
          <div style="font-size:14px;font-weight:700">고난도 문항</div>
          ${S.it.filter(i => i[2] >= 3).map(i => `<div style="display:flex;gap:8px;font-size:12.5px;padding:4px 0;border-bottom:1px solid #ECF1EF"><b style="width:30px;color:${K.g}">${i[0]}번</b><span style="padding:0 6px;border-radius:99px;background:${DC[i[2]]};color:${DT[i[2]]};font-size:11px;font-weight:700;height:18px">${DIFF[i[2]]}</span><span style="flex:1">${esc(strip(i[7] || i[6]))}</span><span style="color:${K.mute}">${i[1]}점</span></div>`).join('')}
        </section>
      </div>
      <footer style="display:flex;justify-content:space-between;font-size:10px;color:${K.mute};border-top:1px solid ${K.line};padding-top:8px"><span>수학도서관이 실제 시험지를 문항 단위로 분류해 작성했습니다.</span><span>1 / 2</span></footer>
    </div>`;
  }
  function detail2(e, S, ctx) {
    const hist = ctx.schoolHistory(e.s);
    const maxTop = Math.max(40, ...hist.map(h => h.top));
    const mix = ctx.sameCourse(e);
    const common = ctx.commonTypes(e).slice(0, 8);
    const cutRows = ['1등급', '2등급', '3등급', '4등급'].filter(g => S.cuts[g]);
    return `<div class="rpt" data-w="794" style="width:794px;min-height:1123px;box-sizing:border-box;padding:36px 40px 28px;background:#fff;font-family:${FONT};color:${K.ink};display:flex;flex-direction:column;gap:16px">
      <header style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid ${K.g};padding-bottom:10px">
        <div><div style="font-size:12px;font-weight:700;color:${K.gold};letter-spacing:2px">수도 상세 분석지 · 2</div>
        <div style="font-size:25px;font-weight:900;letter-spacing:-.5px">학교 누적 · 인근 학교와 비교</div></div>${logo()}</header>
      <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;gap:18px">
        <div style="flex:0 0 300px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:14px;font-weight:700">${esc(short(e.s))}중 누적 ${hist.length}건 <span style="font-weight:500;color:${K.mute};font-size:12px">실력 + 심화 배점</span></div>
          <div style="display:flex;align-items:flex-end;gap:10px;height:110px;border-bottom:1px solid #CDD6D2;padding:0 4px">${hist.map(h => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%"><b style="font-size:12px;color:${K.g}">${h.top}</b><div style="width:100%;max-width:44px;height:${Math.round(h.top / maxTop * 80)}px;border-radius:4px 4px 0 0;background:${h.id === e.id ? K.gold : K.g3}"></div></div>`).join('')}</div>
          <div style="display:flex;gap:10px;padding:0 4px">${hist.map(h => `<span style="flex:1;text-align:center;font-size:10.5px;color:${h.id === e.id ? K.goldFg : K.mute};font-weight:${h.id === e.id ? 900 : 400}">${esc(h.label)}</span>`).join('')}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center">${S.habits.slice(0, 4).map(h => `<div style="display:flex;gap:8px;align-items:flex-start"><span style="flex:0 0 auto;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:${K.goldSoft};color:${K.goldFg}">${esc(h[0])}</span><span style="font-size:12px;line-height:1.5;color:${K.ink2}">${esc(h[1])}</span></div>`).join('')}</div>
      </section>
      <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:14px;font-weight:700">난이도 구성 비교 <span style="font-weight:500;color:${K.mute};font-size:12px">같은 과정 시험 · 문항 수</span></div>
        ${mix.map(m => `<div style="display:flex;align-items:center;gap:12px"><span style="width:150px;font-size:12px;${m.id === e.id ? `font-weight:900;color:${K.goldFg}` : ''}">${esc(m.label)}</span>
          <div style="flex:1;display:flex;height:24px;border-radius:5px;overflow:hidden;font-size:11px;font-weight:700">${[1, 2, 3, 4].filter(k => m.cnt[k]).map(k => `<div style="flex:${m.cnt[k]};background:${DC[k]};color:${DT[k]};display:flex;align-items:center;justify-content:center">${m.cnt[k]}</div>`).join('')}</div>
          <span style="width:52px;text-align:right;font-size:12px;color:${K.mute}">${m.n}문항</span></div>`).join('')}
      </section>
      <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:14px;font-weight:700">다른 학교에도 나온 유형 <span style="font-weight:500;color:${K.mute};font-size:12px">이번 시험 유형 중 · 칸 안은 문항 번호</span></div>
        ${common.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:${K.g};color:#fff"><th style="padding:7px 10px;text-align:left;font-weight:500">유형</th><th style="padding:7px 10px;font-weight:700;width:70px">이번</th><th style="padding:7px 10px;text-align:left;font-weight:500">다른 학교</th></tr></thead><tbody>
          ${common.map(c => `<tr style="border-bottom:1px solid #ECF1EF"><td style="padding:7px 10px">${esc(c.type)}</td><td style="padding:7px 10px;text-align:center;font-weight:900;background:${K.goldSoft};color:${K.goldFg}">${c.mine}</td><td style="padding:7px 10px;color:${K.ink2}">${esc(c.others)}</td></tr>`).join('')}</tbody></table>`
          : `<div style="font-size:12px;color:${K.mute}">아직 다른 학교 분석과 겹치는 유형이 없습니다.</div>`}
      </section>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1">
        <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:9px">
          <div style="font-size:14px;font-weight:700">예상 등급 컷 <span style="font-weight:500;color:${K.mute};font-size:12px">원점수</span></div>
          ${cutRows.map((g, k) => { const v = parseInt(S.cuts[g], 10) || 0; return `<div style="display:flex;align-items:center;gap:8px;font-size:12px"><b style="width:40px">${g}</b><div style="flex:1;height:14px;background:#ECF1EF;border-radius:4px;overflow:hidden"><div style="height:100%;width:${v}%;background:${[K.gold, K.g2, K.g3, K.mint][k]}"></div></div><b style="width:38px;text-align:right;font-size:14px">${esc(S.cuts[g])}</b></div>`; }).join('') || `<div style="font-size:12px;color:${K.mute}">등급컷 정보가 없습니다.</div>`}
          <div style="font-size:10.5px;line-height:1.5;color:${K.mute}">AI 추정치이며 학교 실제 분포와 다를 수 있습니다.</div>
        </section>
        <section style="border:1px solid ${K.line};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;background:#FAF8F2">
          <div style="font-size:14px;font-weight:700">다음 시험을 위한 준비</div>
          ${S.todo.map((t, k) => `<div style="display:flex;flex-direction:column;gap:2px;padding-bottom:6px;border-bottom:1px solid #ECF1EF">${editable(t[0], 'b', `font-size:13px;color:${K.g}`)}${editable(t[1], 'span', `font-size:12px;line-height:1.5;color:${K.ink2}`)}</div>`).join('')}
        </section>
      </div>
      <footer style="display:flex;justify-content:space-between;font-size:10px;color:${K.mute};border-top:1px solid ${K.line};padding-top:8px"><span>1:1 명품 맞춤 수학학원 수학도서관</span><span>2 / 2</span></footer>
    </div>`;
  }

  // ---------- 이미지 만들기 ----------
  async function toBlob(node) {
    const w = +node.dataset.w;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;';
    box.appendChild(node.cloneNode(true));
    box.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
    document.body.appendChild(box);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await Promise.all([...box.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      const canvas = await window.html2canvas(box.firstChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, width: w, windowWidth: w + 40 });
      return await new Promise(r => canvas.toBlob(r, 'image/png'));
    } finally { box.remove(); }
  }
  // 클릭 안에서 바로 호출해야 함 (브라우저가 클립보드 쓰기를 허락하는 조건)
  function copyImage(node) {
    const blobP = toBlob(node);
    if (navigator.clipboard && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blobP })]).then(() => 'copied', () => blobP.then(b => fallbackShare(b)));
    }
    return blobP.then(b => fallbackShare(b));
  }
  async function fallbackShare(blob, name) {
    const file = new File([blob], name || '수도_내신분석.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
    }
    saveBlob(blob, name); return 'saved';
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name || '수도_내신분석.png';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function shareImage(node, name) {
    const b = await toBlob(node); return fallbackShare(b, name);
  }
  async function saveImage(node, name) { saveBlob(await toBlob(node), name); return 'saved'; }

  window.SudoReport = {
    build(format, e, ctx) {
      const S = summarize(e, ctx);
      if (format === 'card') return [card(e, S)];
      if (format === 'detail') return [detail1(e, S), detail2(e, S, ctx)];
      return [simple(e, S)];
    },
    copyImage, shareImage, saveImage
  };
})();
