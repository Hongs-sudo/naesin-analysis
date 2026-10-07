// 수도 내신분석 — 화면 (PC · 아이패드 · 휴대폰)
window.startApp = function (D, ctx) {
  const ROOT_WIN = 'N:\\공유\\공유받은\\2026 중등부\\A. 내신대비\\B. 학교별 기출문제\\';
  const MAIN4 = ['목운중', '신목중', '양정중', '월촌중'];
  const DIFF = ['', '기본', '응용', '실력', '심화'];
  const BEH = { U: '이해', C: '계산', R: '추론', P: '문제해결' };
  const ROLE = { P: '시험지', PA: '시험지+정답', A: '정답', S: '정답배점표', R: '서술형 채점기준', I: '문항정보표' };
  const LV = { 하: '쉬움', 중하: '무난', 중: '보통', 중상: '조금 어려움', 상: '어려움' };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = s => s.replace(/중$/, '');
  const strip = s => String(s || '').replace(/^[^.]*\./, '').trim();
  const examLabel = e => `${e.g}학년 ${e.t}학기 ${e.x}`;
  const A = D.analyzed;
  D.exams.forEach(e => { e.an = A[e.id] || null; });
  const byId = Object.fromEntries(D.exams.map(e => [e.id, e]));
  const schools = [], years = [];
  function listsRefresh() {
    schools.length = 0; schools.push(...[...new Set(D.exams.map(e => e.s))].sort((a, b) => (MAIN4.includes(b) - MAIN4.includes(a)) || a.localeCompare(b, 'ko')));
    years.length = 0; years.push(...[...new Set(D.exams.map(e => e.y))].sort((a, b) => b - a));
  }
  listsRefresh();
  const order = (a, b) => a.y - b.y || a.g - b.g || a.t - b.t || (a.x === '기말') - (b.x === '기말');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sudo.' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('sudo.' + k, JSON.stringify(v)); } catch (_) {} }
  };
  const mode = () => innerWidth >= 1200 ? 'pc' : innerWidth >= 768 ? 'tab' : 'phone';
  let MODE = mode();
  document.body.dataset.mode = MODE;

  // ---------- 공통 ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function copyText(btn, text, msg) {
    const done = () => toast(msg || '경로를 복사했습니다');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) { toast('복사하지 못했습니다'); } ta.remove(); }
  }
  function diffCounts(items) { const c = [0, 0, 0, 0, 0]; items.forEach(i => c[i[2]]++); return c; }
  function diffBar(items, w) {
    const c = diffCounts(items);
    return `<div class="dbar" style="${w ? 'width:' + w : ''}" role="img" aria-label="기본 ${c[1]}, 응용 ${c[2]}, 실력 ${c[3]}, 심화 ${c[4]}">${[1, 2, 3, 4].filter(k => c[k]).map(k => `<i style="flex:${c[k]};background:var(--d${k})"></i>`).join('')}</div>`;
  }
  const diffText = items => { const c = diffCounts(items); return `기본 ${c[1]} · 응용 ${c[2]} · 실력 ${c[3]} · 심화 ${c[4]}`; };
  function stateOf(e) {
    if (e.an) return '<span class="pill ok">분석 완료</span>';
    if (!e.p) return '<span class="pill warn">원본 없음</span>';
    return '<span class="pill raw">분석 전</span>';
  }
  function killers(e) {
    const it = e.an.items; const k = it.filter(i => i[2] === 4);
    if (k.length) return k;
    const mx = Math.max(...it.filter(i => !i[9]).map(i => i[1]));
    return it.filter(i => i[2] === 3 && i[1] >= mx);
  }
  const topPts = e => e.an.items.filter(i => i[2] >= 3).reduce((s, i) => s + i[1], 0);
  function miniMap(e, h1 = 26, h2 = 38) {
    const it = e.an.items, mx = Math.max(...it.filter(i => !i[9]).map(i => i[1]));
    return `<div class="mmap" style="grid-template-columns:repeat(${it.length},minmax(16px,1fr))">${it.map(i =>
      `<div class="mm"><i style="height:${i[1] >= mx && !i[9] ? h2 : h1}px;background:var(--d${i[2]})" title="${i[0]}번 ${i[1]}점 ${DIFF[i[2]]}"></i><span>${i[0]}</span></div>`).join('')}</div>`;
  }

  // ---------- 학교 통계 ----------
  function schoolStats(s) {
    const ex = D.exams.filter(e => e.s === s && e.an).sort(order);
    if (!ex.length) return null;
    const per = ex.map(e => {
      const it = e.an.items, n = it.length;
      const objMax = Math.max(...it.filter(i => !i[9]).map(i => i[1]));
      const top = it.filter(i => i[2] >= 3).reduce((a, i) => a + i[1], 0);
      const deep = it.filter(i => i[2] === 4).map(i => i[0]);
      const beh = { U: 0, C: 0, R: 0, P: 0 }; it.forEach(i => { if (beh[i[3]] !== undefined) beh[i[3]] += i[1]; });
      const bigs = {}; it.forEach(i => { if (i[5]) bigs[i[5]] = (bigs[i[5]] || 0) + i[1]; });
      const topBig = Object.entries(bigs).sort((a, b) => b[1] - a[1])[0];
      const essay = e.an.essay || 0;
      return { e, n, objMax, nObjMax: it.filter(i => !i[9] && i[1] === objMax).length, top, deep,
        deepLate: deep.length && deep.every(no => no > n - 3 - essay) ? 1 : 0, beh, topBig, essay,
        essayPts: it.filter(i => i[9]).reduce((a, i) => a + i[1], 0), cnt: diffCounts(it) };
    });
    return { ex, per };
  }
  function habits(s) {
    const st = schoolStats(s); if (!st) return [];
    const P = st.per, N = P.length, out = [];
    const objOnly = P.every(p => p.essay === 0);
    out.push(['형식', objOnly ? `분석한 ${N}번 모두 서술형 없이 객관식만 출제했습니다. 부분 점수가 없어 계산 실수가 곧 감점입니다.`
      : `서답형이 평균 ${(P.reduce((a, p) => a + p.essay, 0) / N).toFixed(1)}문항, ${Math.round(P.reduce((a, p) => a + p.essayPts, 0) / N)}점 나옵니다. 풀이 서술 연습이 따로 필요합니다.`]);
    const mx = [...new Set(P.map(p => p.objMax))], cn = P.map(p => p.nObjMax);
    out.push(['배점', mx.length === 1 ? `객관식 최고 배점은 ${mx[0]}점, 시험마다 ${Math.min(...cn) === Math.max(...cn) ? cn[0] + '문항' : Math.min(...cn) + '~' + Math.max(...cn) + '문항'}입니다.`
      : `객관식 최고 배점이 시험마다 ${mx.join('·')}점으로 달랐습니다.`]);
    const wd = P.filter(p => p.deep.length);
    out.push(['배치', wd.length ? `심화 문항이 있던 ${wd.length}번 중 ${wd.filter(p => p.deepLate).length}번은 ${objOnly ? '시험' : '객관식'} 마지막 3문항 안에 몰려 있었습니다.` : '분석한 시험에 심화 문항이 없었습니다.']);
    const tops = P.map(p => p.top);
    out.push(['변별', `실력·심화 배점은 ${Math.min(...tops)}~${Math.max(...tops)}점 (평균 ${Math.round(tops.reduce((a, b) => a + b, 0) / N)}점)입니다.`]);
    out.push(['쏠림', `가장 많이 나온 대단원: ${P.filter(p => p.topBig).map(p => `${p.e.g}-${p.e.t} ${p.e.x} ${strip(p.topBig[0])} ${Math.round(p.topBig[1])}점`).join(' / ')}.`]);
    return out;
  }
  const REC = {};
  function recRefresh() {
    Object.keys(REC).forEach(k => delete REC[k]);
    D.exams.filter(e => e.an).forEach(e => e.an.items.forEach(i => { if (i[8] >= 0) (REC[i[8]] = REC[i[8]] || []).push({ s: e.s, e, no: i[0] }); }));
  }
  recRefresh();

  // 분석지에서 쓰는 도우미
  const rctx = {
    habits,
    previous(e) {
      const p = D.exams.filter(x => x.s === e.s && x.an && x.g === e.g && x.t === e.t && x !== e && order(x, e) < 0).sort(order).pop();
      if (!p) return null;
      const beh = { U: 0, C: 0, R: 0, P: 0 }; p.an.items.forEach(i => { if (beh[i[3]] !== undefined) beh[i[3]] += i[1]; });
      return { label: `${p.y} ${p.x}`, top: topPts(p), cnt: diffCounts(p.an.items), beh };
    },
    schoolHistory(s) { return D.exams.filter(x => x.s === s && x.an).sort(order).map(x => ({ id: x.id, top: topPts(x), label: `${x.g}-${x.t} ${x.x}` })); },
    sameCourse(e) {
      return D.exams.filter(x => x.an && x.g === e.g && x.t === e.t && x.y === e.y).sort((a, b) => (b === e) - (a === e) || a.s.localeCompare(b.s, 'ko'))
        .map(x => ({ id: x.id, label: `${short(x.s)}중 ${x.x}${x === e ? ' (이번)' : ''}`, cnt: diffCounts(x.an.items), n: x.an.items.length }));
    },
    commonTypes(e) {
      const out = [];
      const seen = {};
      e.an.items.forEach(i => { if (i[8] >= 0) (seen[i[8]] = seen[i[8]] || []).push(i[0]); });
      Object.entries(seen).forEach(([k, nos]) => {
        const others = (REC[k] || []).filter(r => r.e !== e);
        if (others.length) out.push({ type: D.catalog[k][6], mine: nos.join('·'), others: others.map(r => `${short(r.s)} ${r.e.g}-${r.e.t} ${r.e.x} ${r.no}번`).join(', '), n: others.length });
      });
      return out.sort((a, b) => b.n - a.n);
    }
  };

  // ---------- 1. 시험지 보관함 ----------
  const F = Object.assign({ school: '전체', course: '전체', year: '전체', exam: '전체', state: '전체', q: '' }, store.get('archive', {}));
  F.limit = 40; F.open = null;
  const saveF = () => store.set('archive', { school: F.school, course: F.course, year: F.year, exam: F.exam, state: F.state, q: F.q });
  function filtered() {
    const q = F.q.trim();
    return D.exams.filter(e => {
      if (F.school === '4개교' && !e.m) return false;
      if (F.school === '기타 학교' && e.m) return false;
      if (!['전체', '4개교', '기타 학교'].includes(F.school) && e.s !== F.school) return false;
      if (F.course !== '전체' && `${e.g}-${e.t}` !== F.course) return false;
      if (F.year !== '전체' && String(e.y) !== String(F.year)) return false;
      if (F.exam !== '전체' && e.x !== F.exam) return false;
      if (F.state === '분석 완료' && !e.an) return false;
      if (F.state === '분석 전' && (e.an || !e.p)) return false;
      if (F.state === '정답 없음' && e.a) return false;
      if (F.state === '원본 없음' && e.p) return false;
      if (q) {
        const hay = [e.s, e.y, examLabel(e), `${e.g}-${e.t}`, e.fl.map(f => f[0]).join(' '), e.an ? e.an.items.map(i => i[6] + ' ' + i[7]).join(' ') : ''].join(' ');
        if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    }).sort((a, b) => b.y - a.y || (b.m - a.m) || a.s.localeCompare(b.s, 'ko') || a.g - b.g || a.t - b.t || (a.x === '기말') - (b.x === '기말'));
  }
  const activeFilters = () => ['school', 'course', 'year', 'exam', 'state'].filter(k => F[k] !== '전체');
  const chips = (name, opts) => opts.map(o => `<button type="button" class="chip" data-f="${name}" data-v="${esc(o)}" aria-pressed="${String(F[name]) === String(o)}">${esc(o)}</button>`).join('');
  function filterGroups() {
    return `
      <div class="frow"><span class="lab">학교</span>${chips('school', ['전체', '4개교', ...MAIN4, '기타 학교'])}
        <select class="schoolSel" aria-label="다른 학교 고르기"><option value="">다른 학교…</option>${schools.filter(s => !MAIN4.includes(s)).map(s => `<option ${F.school === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="frow"><span class="lab">과정</span>${chips('course', ['전체', '1-1', '1-2', '2-1', '2-2', '3-1', '3-2'])}</div>
      <div class="frow"><span class="lab">고사</span>${chips('exam', ['전체', '중간', '기말'])}</div>
      <div class="frow"><span class="lab">연도</span>${MODE === 'phone' ? chips('year', ['전체', ...years.slice(0, 5)]) : `<select class="yearSel" aria-label="연도">${['전체', ...years].map(y => `<option ${String(F.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>`}</div>
      <div class="frow"><span class="lab">상태</span>${chips('state', ['전체', '분석 완료', '분석 전', '정답 없음', '원본 없음'])}</div>`;
  }
  function bindFilters(root, rerender) {
    $$('.chip[data-f]', root).forEach(b => b.onclick = () => { F[b.dataset.f] = b.dataset.v; F.limit = 40; saveF(); rerender(); });
    const ss = $('.schoolSel', root); if (ss) ss.onchange = ev => { if (ev.target.value) { F.school = ev.target.value; F.limit = 40; saveF(); rerender(); } };
    const ys = $('.yearSel', root); if (ys) ys.onchange = ev => { F.year = ev.target.value; F.limit = 40; saveF(); rerender(); };
  }
  function tags(e) {
    return [['시험지', e.p], ['정답', e.a], ['배점표', e.sc], ['채점기준', e.r]].filter(t => t[1]).map(t => `<span class="tag on">${t[0]}</span>`).join('')
      + (e.f.includes('hwp') || e.f.includes('hwpx') ? '<span class="tag">한글</span>' : '')
      + (e.fl.some(f => f[2].includes('사진')) ? '<span class="tag">사진본</span>' : '');
  }
  function filesHtml(e) {
    return e.fl.map(f => `<div class="file"><span class="ext">${esc(f[0].split('.').pop())}</span><span class="nm" title="${esc(f[0])}">${esc(f[0].split('/').pop())}</span>
      <span class="rl">${esc(ROLE[f[1]] || f[1])}${f[2] ? ' · ' + esc(f[2]) : ''}</span>
      ${MODE === 'phone' ? '' : `<button type="button" class="copy" data-copy="${esc(ROOT_WIN + f[0].replace(/\//g, '\\'))}">경로 복사</button>`}</div>`).join('')
      || '<div class="empty">MYBOX 폴더에 원본 파일이 없습니다. 분석지만 있는 시험입니다.</div>';
  }
  function itemTable(e) {
    return `<div class="tablewrap"><table class="itbl"><thead><tr><th>번호</th><th>배점</th><th>난이도</th><th>행동</th><th>중단원</th><th>유형</th></tr></thead><tbody>
      ${e.an.items.map(i => `<tr><td class="num">${i[0]}${i[9] ? ' <span class="tag">서답</span>' : ''}</td><td class="num">${i[1]}</td>
      <td><i class="dsw" style="background:var(--d${i[2]})"></i>${DIFF[i[2]]}</td><td>${BEH[i[3]] || ''}</td><td>${esc(i[6] || '—')}</td><td>${esc(i[7] || '—')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  // 아이패드 오른쪽 · 휴대폰 전체 화면에 쓰는 시험 요약
  function examPanel(e) {
    let body;
    if (e.an) {
      const k = killers(e);
      body = `<div class="kpis">
          <div class="kpi"><span>난이도</span><b>${esc(LV[e.an.level] || e.an.level || '—')}</b></div>
          <div class="kpi dark"><span>실력 + 심화</span><b>${topPts(e)}점</b></div>
          <div class="kpi gold"><span>킬러 문항</span><b>${k.length ? k.map(i => i[0]).join('·') + '번' : '—'}</b></div></div>
        <section class="card"><h2>문항 지도 <small>막대가 높을수록 최고 배점</small></h2>${miniMap(e)}<div class="dl">${diffText(e.an.items)}</div></section>
        <section class="card"><h2>문항표</h2>${MODE === 'phone' ? `<div class="ilist">${e.an.items.map(i => `<div class="irow"><b>${i[0]}</b><span class="dchip d${i[2]}">${DIFF[i[2]]}</span><span class="it">${esc(strip(i[7] || i[6] || '—'))}</span><span class="ip">${i[1]}점</span></div>`).join('')}</div>` : itemTable(e)}</section>`;
    } else {
      body = `<p class="callout">아직 문항 분석 전입니다. ${MODE === 'phone' ? 'PC나 아이패드의 ‘시험 등록’에서' : '아래 ‘이 시험 문항 분석하기’를 누르면'} AI가 시험지를 읽어 문항표를 채우고, 원장님 검수 후 여기에 나타납니다.</p>`;
    }
    return `${body}<section class="card"><h2>원본 파일</h2><div class="files">${filesHtml(e)}</div>${e.n.length ? `<div class="dl">메모: ${esc(e.n.join(' · '))}</div>` : ''}</section>`;
  }
  function examActions(e) {
    if (!e.an) return MODE === 'phone' ? '' : `<div class="actbar"><button type="button" class="btn" data-reg="${esc(e.id)}">이 시험 문항 분석하기</button>${D.drafts && D.drafts[e.id] ? `<button type="button" class="btn gold" data-draftopen="${esc(e.id)}">검수 대기 열기</button>` : ''}</div>`;
    return `<div class="actbar"><a class="btn" href="#output" data-out="${esc(e.id)}" data-fmt="simple">분석지 보기</a>
      <a class="btn gold" href="#output" data-out="${esc(e.id)}" data-fmt="card">${MODE === 'phone' ? '카톡으로 보내기' : '카톡 카드 만들기'}</a>
      ${MODE === 'phone' ? '' : `<button type="button" class="btn ghost" data-edit="${esc(e.id)}">문항표 고치기</button>`}</div>`;
  }
  function bindCommon(root) {
    $$('[data-copy]', root).forEach(b => b.onclick = ev => { ev.stopPropagation(); copyText(b, b.dataset.copy); });
    $$('[data-out]', root).forEach(a => a.onclick = () => { OUT.id = a.dataset.out; OUT.fmt = a.dataset.fmt; closeSheet(); });
    $$('[data-reg]', root).forEach(b => b.onclick = ev => { ev.stopPropagation(); REG.pickExam(b.dataset.reg); });
    $$('[data-edit]', root).forEach(b => b.onclick = ev => { ev.stopPropagation(); REG.editExam(b.dataset.edit); });
    $$('[data-draftopen]', root).forEach(b => b.onclick = ev => { ev.stopPropagation(); location.hash = '#register'; });
  }

  function renderArchive() {
    const rows = filtered();
    if (MODE === 'phone') return archivePhone(rows);
    const nAn = D.exams.filter(e => e.an).length;
    const nItems = Object.values(A).reduce((s, a) => s + a.items.length, 0);
    const tiles = `<div class="tiles">
        <div class="tile"><span>등록 시험</span><b>${D.exams.length}건</b><span>${years[years.length - 1]}~${years[0]}년 · ${schools.length}개 학교</span></div>
        <div class="tile"><span>원본 시험지 있음</span><b>${D.exams.filter(e => e.p).length}건</b><span>정답·배점표까지 ${D.exams.filter(e => e.p && e.a).length}건</span></div>
        <div class="tile dark"><span>문항 분석 완료</span><b>${nAn}건</b><span>${nItems}문항 · 단원·유형까지 분류</span></div>
        <div class="tile"><span>분석 기다리는 시험</span><b>${D.exams.filter(e => !e.an && e.p).length}건</b><span>${Object.keys(D.drafts || {}).length ? `검수 대기 ${Object.keys(D.drafts).length}건 · ` : ''}시험 등록에서 AI로 분석</span></div></div>`;
    if (MODE === 'tab') return archiveTab(rows);
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">MYBOX '학교별 기출문제' 폴더를 시험 단위로 정리했습니다</div><h1>시험지 보관함</h1></div></div>
      ${tiles}
      <section class="card filters" aria-label="찾기">${filterGroups()}
        <div class="frow"><span class="lab">검색</span><input type="search" id="q" placeholder="학교, 파일명, 단원·유형 (예: 이차함수 활용)" value="${esc(F.q)}"></div></section>
      <div class="head"><h2>${rows.length}건 <small>최신순 · 4개교 먼저</small></h2>${legendHtml()}</div>
      <div class="tablewrap"><table>
        <thead><tr><th>학교</th><th>연도</th><th>시험</th><th>자료</th><th>난이도 구성</th><th>상태</th></tr></thead>
        <tbody>${rows.slice(0, F.limit).map(e => {
          const open = F.open === e.id;
          return `<tr class="row ${open ? 'open' : ''}" data-id="${esc(e.id)}" tabindex="0" aria-expanded="${open}">
            <td class="sch">${esc(e.s)}</td><td class="num">${e.y}</td><td>${examLabel(e)}</td><td><div class="tags">${tags(e) || '<span class="tag">없음</span>'}</div></td>
            <td>${e.an ? diffBar(e.an.items) + `<div class="dl">${diffText(e.an.items)}</div>` : '<span class="dl">분석 전</span>'}</td><td>${stateOf(e)}</td></tr>
            ${open ? `<tr class="detail"><td colspan="6"><div class="det"><div><h2>원본 파일 <small>${esc(e.s)} ${e.y} ${examLabel(e)}</small></h2><div class="files">${filesHtml(e)}</div>${e.n.length ? `<div class="dl">메모: ${esc(e.n.join(' · '))}</div>` : ''}</div>
              <div style="flex:3 1 520px"><div class="head"><h2>문항표</h2>${examActions(e)}</div>${e.an ? itemTable(e) + `<div class="dl">배점 합계 ${e.an.items.reduce((s, i) => s + i[1], 0)}점 · 체감 난이도 ${esc(e.an.level || '—')} · 서답형 ${e.an.essay}문항</div>` : `<div class="empty">아직 문항 분석 전입니다. ${D.drafts && D.drafts[e.id] ? 'AI가 읽은 문항표가 검수 대기 중입니다.' : '‘이 시험 문항 분석하기’를 누르면 AI가 문항표를 채웁니다.'}</div>`}</div></div></td></tr>` : ''}`;
        }).join('') || '<tr><td colspan="6" class="empty">조건에 맞는 시험이 없습니다. 필터를 하나 풀어 보세요.</td></tr>'}</tbody></table></div>
      ${rows.length > F.limit ? `<button type="button" class="more" id="more">${Math.min(40, rows.length - F.limit)}건 더 보기 (남은 ${rows.length - F.limit}건)</button>` : ''}`;
    const root = $('#main');
    bindFilters(root, renderArchive); bindSearch(renderArchive); bindCommon(root);
    const more = $('#more'); if (more) more.onclick = () => { F.limit += 40; renderArchive(); };
    $$('tr.row', root).forEach(tr => {
      const t = () => { F.open = F.open === tr.dataset.id ? null : tr.dataset.id; renderArchive(); };
      tr.onclick = ev => { if (!ev.target.closest('button,a')) t(); };
      tr.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); t(); } };
    });
  }
  function legendHtml() { return `<div class="legend">${[1, 2, 3, 4].map(k => `<span><i class="dsw" style="background:var(--d${k})"></i>${DIFF[k]}</span>`).join('')}</div>`; }
  function bindSearch(rerender) {
    let t; const q = $('#q'); if (!q) return;
    q.oninput = ev => { clearTimeout(t); t = setTimeout(() => { F.q = ev.target.value; F.limit = 40; saveF(); rerender(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  }
  function cardRow(e, sel) {
    return `<button type="button" class="erow ${sel ? 'sel' : ''}" data-id="${esc(e.id)}" aria-pressed="${sel}">
      <span class="et"><b>${esc(short(e.s))}중</b> ${e.y} ${e.g}-${e.t} ${e.x}<small>${e.an ? esc(LV[e.an.level] || '') + (killers(e).length ? ' · 킬러 ' + killers(e).map(i => i[0]).join('·') : '') : [e.p ? '시험지' : '', e.a ? '정답' : '', e.f.includes('hwp') ? '한글' : ''].filter(Boolean).join(' · ') || '자료 없음'}</small></span>
      <span class="er">${e.an ? diffBar(e.an.items, '110px') : ''}${stateOf(e)}</span></button>`;
  }
  function archiveTab(rows) {
    if (!F.open || !rows.some(e => e.id === F.open)) F.open = (rows.find(e => e.an) || rows[0] || {}).id || null;
    const sel = F.open ? byId[F.open] : null;
    $('#main').innerHTML = `<div class="split">
      <section class="pane-list">
        <div class="head"><h1>시험지 보관함</h1><span class="dl">${rows.length}건</span></div>
        <input type="search" id="q" class="bigsearch" placeholder="학교 · 단원 · 유형 검색" value="${esc(F.q)}">
        <details class="fbox" ${activeFilters().length ? '' : ''}><summary>걸러 보기 ${activeFilters().length ? `<span class="badge">${activeFilters().length}</span>` : ''}</summary><div class="filters">${filterGroups()}</div></details>
        <div class="elist">${rows.slice(0, F.limit).map(e => cardRow(e, e.id === F.open)).join('') || '<div class="empty">조건에 맞는 시험이 없습니다.</div>'}
        ${rows.length > F.limit ? `<button type="button" class="more" id="more">더 보기 (남은 ${rows.length - F.limit}건)</button>` : ''}</div>
      </section>
      <section class="pane-detail" aria-label="시험 상세">${sel ? `<div class="head"><div><div class="kicker">${sel.y} · 중등${sel.g}-${sel.t}${sel.an ? ' · ' + sel.an.items.length + '문항' : ''}</div><h2 class="h2big">${esc(sel.s)} ${examLabel(sel)}</h2></div>${examActions(sel)}</div>${examPanel(sel)}` : '<div class="empty">시험을 고르면 여기에 상세가 나옵니다.</div>'}</section></div>`;
    const root = $('#main');
    bindFilters(root, renderArchive); bindSearch(renderArchive); bindCommon(root);
    const more = $('#more'); if (more) more.onclick = () => { F.limit += 40; renderArchive(); };
    $$('.erow', root).forEach(b => b.onclick = () => { F.open = b.dataset.id; renderArchive(); });
  }
  function archivePhone(rows) {
    const af = activeFilters();
    $('#main').innerHTML = `
      <div class="head"><h1>시험지 보관함</h1><span class="dl">${D.exams.length}건 · ${schools.length}개 학교</span></div>
      <div class="searchrow"><input type="search" id="q" class="bigsearch" placeholder="학교 · 유형 검색" value="${esc(F.q)}">
        <button type="button" class="fbtn" id="openFilter" aria-label="걸러 보기 열기">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"></path></svg>${af.length ? `<span class="badge">${af.length}</span>` : ''}</button></div>
      ${af.length ? `<div class="tags">${af.map(k => `<button type="button" class="tag on clr" data-k="${k}">${esc(F[k])} ✕</button>`).join('')}</div>` : ''}
      <div class="dl">${rows.length}건</div>
      <div class="elist">${rows.slice(0, F.limit).map(e => cardRow(e, false)).join('') || '<div class="empty">조건에 맞는 시험이 없습니다.</div>'}
      ${rows.length > F.limit ? `<button type="button" class="more" id="more">더 보기 (남은 ${rows.length - F.limit}건)</button>` : ''}</div>`;
    const root = $('#main');
    bindSearch(renderArchive);
    $$('.clr', root).forEach(b => b.onclick = () => { F[b.dataset.k] = '전체'; saveF(); renderArchive(); });
    const more = $('#more'); if (more) more.onclick = () => { F.limit += 40; renderArchive(); };
    $('#openFilter').onclick = () => openSheet('filter');
    $$('.erow', root).forEach(b => b.onclick = () => { F.open = b.dataset.id; openSheet('exam'); });
  }

  // 휴대폰 시트 (필터 · 시험 상세)
  function openSheet(kind) {
    const sh = $('#sheet');
    if (kind === 'filter') {
      const draw = () => {
        sh.innerHTML = `<div class="sheet-back" data-close></div><section class="sheet" role="dialog" aria-modal="true" aria-label="걸러 보기"><div class="grip"></div>
          <div class="head"><h2>걸러 보기</h2><button type="button" class="linkbtn" id="clearF">모두 지우기</button></div>
          <div class="filters">${filterGroups()}</div>
          <button type="button" class="btn full" data-close>시험 ${filtered().length}건 보기</button></section>`;
        bindFilters(sh, () => { draw(); renderArchive(); });
        $('#clearF').onclick = () => { ['school', 'course', 'year', 'exam', 'state'].forEach(k => F[k] = '전체'); saveF(); draw(); renderArchive(); };
        $$('[data-close]', sh).forEach(x => x.onclick = closeSheet);
      };
      draw();
    } else {
      const e = byId[F.open]; if (!e) return;
      sh.innerHTML = `<section class="sheet full" role="dialog" aria-modal="true" aria-label="시험 상세">
        <header class="shead"><button type="button" class="back" data-close>‹ 보관함</button>
          <div class="kicker">${e.y} · 중등${e.g}-${e.t}${e.an ? ' · ' + e.an.items.length + '문항' : ''}</div><h1>${esc(e.s)}<br>${examLabel(e)}</h1></header>
        <div class="sbody">${examPanel(e)}</div>${examActions(e)}</section>`;
      $$('[data-close]', sh).forEach(x => x.onclick = closeSheet);
      bindCommon(sh);
    }
    sh.hidden = false; document.body.classList.add('locked');
  }
  function closeSheet() { const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('locked'); }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

  // ---------- 2. 학교별 분석 ----------
  let curSchool = store.get('school', '월촌중'); if (!schools.includes(curSchool)) curSchool = '월촌중';
  let consult = false;
  const SLOTS = []; for (const g of [1, 2, 3]) for (const t of [1, 2]) for (const x of ['중간', '기말']) SLOTS.push({ g, t, x });
  function renderSchool() {
    const s = curSchool, all = D.exams.filter(e => e.s === s), st = schoolStats(s);
    if (consult && st && MODE !== 'phone') return renderConsult(s, st);
    const cov = years.slice().reverse().filter(y => all.some(e => e.y === y));
    const covCell = (y, sl) => { const e = all.find(e => e.y === y && e.g === sl.g && e.t === sl.t && e.x === sl.x);
      if (!e) return '<td class="c-n" title="자료 없음"></td>'; if (e.an) return '<td class="c-a">분석</td>'; if (e.p) return '<td class="c-p">원본</td>'; return '<td class="c-x">정답</td>'; };
    const slots = SLOTS.filter(sl => all.some(e => e.g === sl.g && e.t === sl.t && e.x === sl.x));
    const pick = `<div class="frow seg">${MAIN4.map(x => `<button type="button" class="chip" data-s="${x}" aria-pressed="${x === s}">${MODE === 'phone' ? short(x) : x}</button>`).join('')}
      <select id="schSel" aria-label="다른 학교 고르기"><option value="">다른 학교…</option>${schools.filter(x => !MAIN4.includes(x)).map(x => `<option ${x === s ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;
    let body = '';
    if (!st) body = `<section class="card"><h2>문항 분석 전 <small>${esc(s)}</small></h2><p class="callout">이 학교는 원본 시험지만 모여 있고 아직 문항 분석이 없습니다. 4단계에서 AI가 시험지를 읽어 문항표를 채우면 출제 습관과 그래프가 여기에 자동으로 그려집니다.</p></section>`;
    else {
      const P = st.per, N = P.length, maxN = Math.max(...P.map(p => p.n));
      const map = P.map(p => `<div class="maprow"><span class="lb">${p.e.y % 100} · ${p.e.g}-${p.e.t} ${p.e.x}</span><div class="cells" style="grid-template-columns:repeat(${maxN},minmax(0,1fr))">${p.e.an.items.map(i =>
        `<div class="cell ${i[1] >= p.objMax && !i[9] ? 'hi' : ''} ${i[9] ? 'es' : ''}" style="background:var(--d${i[2]})" title="${i[0]}번 · ${i[1]}점 · ${DIFF[i[2]]} · ${esc(i[7] || i[6] || '')}"></div>`).join('')}</div></div>`).join('');
      const nums = `<div class="maprow"><span></span><div class="cells" style="grid-template-columns:repeat(${maxN},minmax(0,1fr))">${Array.from({ length: maxN }, (_, k) => `<span class="cnum">${k + 1}</span>`).join('')}</div></div>`;
      const topMax = Math.max(40, ...P.map(p => p.top));
      const BK = [['U', '이해', 'var(--b-u)', 'var(--fg)'], ['C', '계산', 'var(--b-c)', 'var(--fg)'], ['R', '추론', 'var(--b-r)', 'var(--fg)'], ['P', '문제해결', 'var(--b-p)', 'var(--b-p-fg)']];
      const myTypes = {}; st.ex.forEach(e => e.an.items.forEach(i => { if (i[8] >= 0) (myTypes[i[8]] = myTypes[i[8]] || []).push(`${e.g}-${e.t} ${e.x} ${i[0]}번`); }));
      const tl = Object.entries(myTypes).map(([k, v]) => ({ k: +k, v, others: (REC[k] || []).filter(r => r.s !== s) })).sort((a, b) => (b.v.length + b.others.length) - (a.v.length + a.others.length)).slice(0, 8);
      const myCourses = new Set(st.ex.flatMap(e => e.an.items.map(i => i[4])).filter(Boolean));
      const only = Object.entries(REC).filter(([k, r]) => !myTypes[k] && myCourses.has(D.catalog[k][1]) && r.some(x => x.s !== s)).map(([k, r]) => ({ k: +k, r })).sort((a, b) => b.r.length - a.r.length).slice(0, 8);
      const cmp = MAIN4.map(x => { const sx = schoolStats(x); if (!sx) return ''; const p = sx.per, n = p.length, avg = f => p.reduce((a, q) => a + f(q), 0) / n;
        return `<tr ${x === s ? 'class="me"' : ''}><td class="sch">${x}</td><td class="num">${n}건</td><td class="num">${avg(q => q.n).toFixed(1)}</td><td class="num">${avg(q => q.essayPts) ? Math.round(avg(q => q.essayPts)) + '점' : '없음'}</td><td class="num">${Math.round(avg(q => q.top))}점</td></tr>`; }).join('');
      body = `
      <div class="tiles">
        <div class="tile"><span>보관 중인 시험</span><b>${all.length}건</b><span>${cov[0]}~${cov[cov.length - 1]}년</span></div>
        <div class="tile dark"><span>문항 분석 완료</span><b>${N}건</b><span>${P.reduce((a, p) => a + p.n, 0)}문항</span></div>
        <div class="tile"><span>형식</span><b>${P.some(p => p.essay) ? '서답형 있음' : '객관식만'}</b><span>평균 ${(P.reduce((a, p) => a + p.n, 0) / N).toFixed(1)}문항</span></div>
        <div class="tile"><span>실력·심화 평균</span><b>${Math.round(P.reduce((a, p) => a + p.top, 0) / N)}점</b><span>등급을 가르는 구간</span></div></div>
      <section class="card"><h2>${esc(short(s))}중 출제 습관 <small>분석한 ${N}개 시험에서 자동으로 뽑음</small></h2>${habits(s).map(h => `<div class="habit"><span class="k">${h[0]}</span><span>${esc(h[1])}</span></div>`).join('')}</section>
      <section class="card"><div class="head"><h2>문항 지도 누적 <small>색 = 난이도 · 진한 테두리 = 객관식 최고 배점 · 흰 점 = 서답형</small></h2>${legendHtml()}</div><div class="map">${nums}${map}</div></section>
      <div class="grid2">
        <section class="card"><h2>실력 · 심화 배점</h2><div class="hbars">${P.map(p => `<div class="hb"><span>${p.e.g}-${p.e.t} ${p.e.x}</span><div><i style="width:${Math.round(p.top / topMax * 100)}%"></i></div><b>${p.top}점</b></div>`).join('')}</div></section>
        <section class="card"><h2>행동영역 배점</h2>${P.map(p => { const tot = Object.values(p.beh).reduce((a, b) => a + b, 0) || 1;
          return `<div class="stack"><span class="lb">${p.e.g}-${p.e.t} ${p.e.x}</span><div class="s">${BK.filter(k => p.beh[k[0]]).map(k => `<i style="flex:${p.beh[k[0]]};background:${k[2]};color:${k[3]}" title="${k[1]} ${p.beh[k[0]]}점">${p.beh[k[0]] / tot > .09 ? Math.round(p.beh[k[0]]) : ''}</i>`).join('')}</div></div>`; }).join('')}
          <div class="legend">${BK.map(k => `<span><i class="dsw" style="background:${k[2]}"></i>${k[1]}</span>`).join('')}</div></section></div>
      <div class="grid2">
        <section class="card"><h2>자주 나온 유형 <small>이 학교 + 다른 학교 기록</small></h2><div class="typelist">${tl.map(t => `<div class="t"><span class="nm">${esc(D.catalog[t.k][6])}</span><span class="cnt">${t.v.length + t.others.length}회</span><span class="where">${esc(short(s))}: ${esc(t.v.join(', '))}${t.others.length ? ' · 다른 학교: ' + esc(t.others.map(o => short(o.s) + ' ' + o.no + '번').join(', ')) : ''}</span></div>`).join('')}</div></section>
        <section class="card"><h2>인근 학교에만 나온 유형 <small>같은 범위, ${esc(short(s))}중에는 아직 없음</small></h2>${only.length ? `<div class="typelist">${only.map(t => `<div class="t"><span class="nm">${esc(D.catalog[t.k][6])}</span><span class="cnt">${t.r.length}회</span><span class="where">${esc(D.catalog[t.k][1])} · ${esc(t.r.map(o => short(o.s) + ' ' + o.e.g + '-' + o.e.t + ' ' + o.e.x + ' ' + o.no + '번').join(', '))}</span></div>`).join('')}</div>` : '<div class="empty">해당 유형이 없습니다.</div>'}</section></div>
      <section class="card"><h2>4개교 비교 <small>분석된 시험 기준</small></h2><div class="tablewrap flat"><table><thead><tr><th>학교</th><th>분석 시험</th><th>평균 문항 수</th><th>서답형 평균</th><th>실력·심화 평균</th></tr></thead><tbody>${cmp}</tbody></table></div></section>`;
    }
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">시험이 쌓일수록 학교의 출제 습관이 보입니다</div><h1>${MODE === 'phone' ? '학교별 분석' : esc(s) + ' 누적 분석'}</h1></div>
        ${st && MODE !== 'phone' ? '<button type="button" class="btn ghost" id="consult">상담 모드</button>' : ''}</div>
      ${pick}
      <section class="card"><h2>보관 중인 시험 <small>분석 · 원본 · 정답</small></h2><div class="tablewrap flat"><table class="cov"><thead><tr><th></th>${cov.map(y => `<th>${y}</th>`).join('')}</tr></thead>
        <tbody>${slots.map(sl => `<tr><th class="sl">${sl.g}학년 ${sl.t}학기 ${sl.x}</th>${cov.map(y => covCell(y, sl)).join('')}</tr>`).join('')}</tbody></table></div></section>
      ${body}`;
    bindSchoolPick();
    const c = $('#consult'); if (c) c.onclick = () => { consult = true; renderSchool(); };
  }
  function bindSchoolPick() {
    $$('.chip[data-s]').forEach(b => b.onclick = () => { curSchool = b.dataset.s; store.set('school', curSchool); renderSchool(); });
    const ss = $('#schSel'); if (ss) ss.onchange = ev => { if (ev.target.value) { curSchool = ev.target.value; store.set('school', curSchool); renderSchool(); } };
  }
  // 아이패드 · PC 상담 모드: 학부모님께 보여 드리는 큰 화면
  function renderConsult(s, st) {
    const P = st.per, N = P.length, maxN = Math.max(...P.map(p => p.n));
    const objOnly = P.every(p => p.essay === 0);
    const mx = [...new Set(P.map(p => p.objMax))];
    const wd = P.filter(p => p.deep.length), late = wd.filter(p => p.deepLate).length;
    const plan = [];
    const lastEx = st.ex[st.ex.length - 1];
    const k = killers(lastEx);
    plan.push(`어려운 문제가 ${late >= wd.length / 2 ? '뒤쪽에 몰리니' : '중간에도 나오니'} 시간 배분을 미리 연습합니다`);
    if (k.length) plan.push(`${strip(k[k.length - 1][7] || k[k.length - 1][6])} 같은 고난도 유형을 반복합니다`);
    plan.push(objOnly ? '객관식만 나오므로 마킹 전 검산 습관을 들입니다' : '서답형 풀이를 끝까지 쓰는 연습을 합니다');
    $('#main').innerHTML = `<div class="consult">
      <header class="chead"><div><div class="kicker gold">학교별 출제 분석</div><h1>${esc(short(s))}중학교는 이렇게 출제합니다</h1></div>
        <button type="button" class="btn ghost light" id="consultOff">상담 모드 끄기</button></header>
      <div class="frow seg">${MAIN4.map(x => `<button type="button" class="chip big" data-s="${x}" aria-pressed="${x === s}">${x}</button>`).join('')}</div>
      <div class="cbig">
        <div><span>시험 형식</span><b>${objOnly ? '객관식만' : '서답형 있음'}</b><small>${objOnly ? `${N}번 연속 서술형 없음` : `서답형 평균 ${Math.round(P.reduce((a, p) => a + p.essayPts, 0) / N)}점`}</small></div>
        <div><span>최고 배점 문항</span><b>${mx.length === 1 ? mx[0] + '점 × ' + P[P.length - 1].nObjMax : mx.join('·') + '점'}</b><small>이 문제들이 등급을 가릅니다</small></div>
        <div class="gold"><span>어려운 문제 위치</span><b>${wd.length ? (late >= wd.length / 2 ? '맨 뒤' : '곳곳에') : '—'}</b><small>${wd.length ? `${wd.length}번 중 ${late}번 마지막 3문항` : '심화 없음'}</small></div></div>
      <section class="card"><h2 class="h2big">최근 ${N}번의 시험, 문제 배치</h2><div class="map">${P.map(p => `<div class="maprow"><span class="lb">${p.e.g}-${p.e.t} ${p.e.x}</span><div class="cells" style="grid-template-columns:repeat(${maxN},minmax(0,1fr))">${p.e.an.items.map(i => `<div class="cell big ${i[1] >= p.objMax && !i[9] ? 'hi' : ''} ${i[9] ? 'es' : ''}" style="background:var(--d${i[2]})"></div>`).join('')}</div></div>`).join('')}</div>${legendHtml()}</section>
      <section class="card"><h2 class="h2big">이 학교의 출제 습관</h2>${habits(s).slice(0, 4).map(h => `<div class="habit big"><span class="k">${h[0]}</span><span>${esc(h[1])}</span></div>`).join('')}</section>
      <section class="card dark"><h2 class="h2big gold">그래서 수학도서관은 이렇게 준비합니다</h2>${plan.map((t, i) => `<div class="plan"><b>0${i + 1}</b><span>${esc(t)}</span></div>`).join('')}</section></div>`;
    bindSchoolPick();
    $('#consultOff').onclick = () => { consult = false; renderSchool(); };
  }

  // ---------- 3. 단원·유형 목록 ----------
  let curCourse = store.get('course', '중등2-1');
  function renderTypes() {
    const courses = [...new Set(D.catalog.map(c => c[1]))]; if (!courses.includes(curCourse)) curCourse = courses[0];
    const rows = D.catalog.map((c, k) => ({ c, k })).filter(x => x.c[1] === curCourse);
    const mids = [...new Set(rows.map(x => x.c[3]))], named = rows.filter(x => x.c[6]).length;
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">수학도서관 자체 분류 · 과정 › 대단원 › 중단원 › 유형</div><h1>단원 · 유형 목록</h1></div></div>
      <div class="frow seg">${courses.map(c => `<button type="button" class="chip" data-c="${c}" aria-pressed="${c === curCourse}">${c.replace('중등', '')}</button>`).join('')}</div>
      <p class="callout">${curCourse}: 이름 있는 유형 ${named}개, 빈 번호 ${rows.length - named}개. ${ctx ? '유형 이름을 누르면 고칠 수 있고, 저장하면 바로 반영됩니다.' : ''}</p>
      <section class="card tree">${mids.map(m => { const rs = rows.filter(x => x.c[3] === m), h = rs[0].c;
        return `<details class="mid" ${MODE === 'phone' ? '' : 'open'}><summary><b>${esc(h[2])} › ${m}.${esc(h[4])}</b><span>${rs.filter(x => x.c[6]).length}/${rs.length}</span></summary>
          ${rs.map(x => { const r = REC[x.k] || []; return `<div class="trow ${x.c[6] ? '' : 'gap'}"><code>${esc(x.c[0])}</code>
            ${ctx ? `<button type="button" class="tname" data-k="${x.k}">${x.c[6] ? esc(x.c[6]) : '이름 입력 필요'}</button>` : `<span>${x.c[6] ? esc(x.c[6]) : '이름 입력 필요'}</span>`}
            <span class="w">${r.length ? esc(r.map(o => short(o.s) + ' ' + o.e.g + '-' + o.e.t + ' ' + o.e.x + ' ' + o.no + '번').join(', ')) : ''}</span></div>`; }).join('')}</details>`; }).join('')}</section>`;
    $$('.chip[data-c]').forEach(b => b.onclick = () => { curCourse = b.dataset.c; store.set('course', curCourse); renderTypes(); });
    if (ctx) $$('.tname').forEach(b => b.onclick = () => {
      const k = +b.dataset.k, c = D.catalog[k];
      const f = document.createElement('form'); f.className = 'tedit';
      f.innerHTML = `<input id="tn-${k}" value="${esc(c[6])}" placeholder="유형 이름" aria-label="${esc(c[0])} 유형 이름"><button type="submit" class="btn sm">저장</button><button type="button" class="linkbtn" data-x>취소</button>`;
      b.replaceWith(f); const inp = f.querySelector('input'); inp.focus();
      f.querySelector('[data-x]').onclick = () => renderTypes();
      f.onsubmit = async ev => { ev.preventDefault(); const v = inp.value.trim(); f.querySelector('button').disabled = true;
        try { await ctx.saveTypeName(c[0], v); c[6] = v; toast('저장했습니다'); renderTypes(); }
        catch (e) { toast('저장하지 못했습니다: ' + e.message); f.querySelector('button').disabled = false; } };
    });
  }

  // ---------- 4. 분석지 만들기 ----------
  const analyzedExams = [];
  function anRefresh() { analyzedExams.length = 0; analyzedExams.push(...D.exams.filter(e => e.an).sort((a, b) => b.y - a.y || a.s.localeCompare(b.s, 'ko') || a.g - b.g || a.t - b.t || (a.x === '기말') - (b.x === '기말'))); }
  anRefresh();
  const OUT = Object.assign({ id: (analyzedExams[0] || {}).id, fmt: 'simple' }, store.get('output', {}));
  if (!byId[OUT.id] || !byId[OUT.id].an) OUT.id = (analyzedExams[0] || {}).id;
  const NOTE = Object.assign({ on: false, student: '', text: '', by: '' }, store.get('note', {}));
  const saveNote = () => store.set('note', { on: NOTE.on, by: NOTE.by });
  const FMT = [['simple', '간결 분석지', 'A4 1장 · 학부모 기본형'], ['card', '카톡 카드', '휴대폰 화면 한 장'], ['detail', '상세 분석지', 'A4 2쪽 · 단원·비교까지']];
  function renderOutput() {
    store.set('output', { id: OUT.id, fmt: OUT.fmt });
    const e = byId[OUT.id];
    if (!e) { $('#main').innerHTML = '<div class="empty">분석된 시험이 없습니다.</div>'; return; }
    const pages = window.SudoReport.build(OUT.fmt, e, rctx, NOTE);
    const canShare = !!(navigator.canShare && window.File && (() => { try { return navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }); } catch (_) { return false; } })());
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">학부모님께 보내는 분석지</div><h1>분석지 만들기</h1></div></div>
      <div class="outctl">
        <label class="sel"><span>시험</span><select id="outExam">${analyzedExams.map(x => `<option value="${esc(x.id)}" ${x.id === e.id ? 'selected' : ''}>${esc(x.s)} ${x.y} ${examLabel(x)}</option>`).join('')}</select></label>
        <div class="fmts" role="tablist">${FMT.map(f => `<button type="button" role="tab" class="fmt" data-fmt="${f[0]}" aria-selected="${f[0] === OUT.fmt}"><b>${f[1]}</b><small>${f[2]}</small></button>`).join('')}</div>
      </div>
      <div class="outwrap">
        <section class="preview" id="preview">${pages.map((p, i) => `<div class="pgwrap" data-pg="${i}"><div class="pg">${p}</div>${pages.length > 1 ? `<button type="button" class="btn sm copy1" data-pg="${i}">${i + 1}쪽 이미지 복사하기</button>` : ''}</div>`).join('')}</section>
        <aside class="outact">
          <section class="notebox">
            <label class="chk"><input type="checkbox" id="noteOn" ${NOTE.on ? 'checked' : ''}> <b>선생님 의견 넣기</b> <small>학생마다 따로</small></label>
            ${NOTE.on ? `<div class="noteform">
              <label class="nsel"><span>학생 이름</span><input id="noteStudent" value="${esc(NOTE.student)}" placeholder="예: 김민준 (비우면 표시 안 함)"></label>
              <label class="nsel"><span>의견</span><textarea id="noteText" rows="5" placeholder="이번 시험에서 잘한 점, 아쉬운 점, 다음 시험까지 할 일">${esc(NOTE.text)}</textarea></label>
              <label class="nsel"><span>작성</span><input id="noteBy" value="${esc(NOTE.by)}" placeholder="예: 수학도서관 홍길동 선생님"></label>
              <button type="button" class="linkbtn" id="noteClear">다음 학생 (이름·의견 비우기)</button>
            </div>` : ''}
          </section>
          <button type="button" class="btn big" id="copyImg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>이미지 복사하기</button>
          <p class="dl">복사한 뒤 카톡이나 문자 입력창을 길게 눌러 <b>붙여넣기</b> 하세요.${pages.length > 1 ? ' 두 쪽이면 쪽마다 복사합니다.' : ''}</p>
          ${canShare ? '<button type="button" class="btn ghost" id="shareImg">공유 (카톡 바로 보내기)</button>' : ''}
          ${ctx ? `<button type="button" class="btn ghost" id="linkShare">링크로 보내기 <small>휴대폰 화면 가득</small></button>` : ''}
          <button type="button" class="btn ghost" id="saveImg">이미지로 저장</button>
          ${MODE === 'phone' ? '' : '<button type="button" class="btn ghost" id="printIt">인쇄 · PDF</button>'}
          <p class="dl">‘다음 시험 준비’ 글은 분석지 위에서 눌러 바로 고칠 수 있습니다. 고친 글은 복사·저장에 그대로 들어갑니다.</p>
        </aside>
      </div>`;
    $$('#preview .rpt').forEach(r => window.SudoReport.fit(r));
    fitPreview();
    $('#preview').addEventListener('input', ev => { const r = ev.target.closest('.rpt'); if (r) { window.SudoReport.fit(r); } });
    $('#outExam').onchange = ev => { OUT.id = ev.target.value; renderOutput(); };
    $('#noteOn').onchange = ev => { NOTE.on = ev.target.checked; saveNote(); renderOutput(); };
    const liveNote = () => { $$('#preview .rpt').forEach(r => { window.SudoReport.setNote(r, NOTE); window.SudoReport.fit(r); }); fitPreview(); };
    [['#noteStudent', 'student'], ['#noteText', 'text'], ['#noteBy', 'by']].forEach(([sel, k]) => { const el = $(sel); if (el) el.oninput = () => { NOTE[k] = el.value.trim(); if (k === 'by') saveNote(); liveNote(); }; });
    const nc = $('#noteClear'); if (nc) nc.onclick = () => { NOTE.student = ''; NOTE.text = ''; $('#noteStudent').value = ''; $('#noteText').value = ''; liveNote(); $('#noteStudent').focus(); };
    $$('.fmt').forEach(b => b.onclick = () => { OUT.fmt = b.dataset.fmt; renderOutput(); });
    const name = i => `${NOTE.on && NOTE.student ? NOTE.student + '_' : ''}${short(e.s)}중_${e.y}_${e.g}-${e.t}_${e.x}_${FMT.find(f => f[0] === OUT.fmt)[1]}${pages.length > 1 ? '_' + (i + 1) + '쪽' : ''}.png`;
    const node = i => $$('#preview .rpt')[i];
    const run = (btn, p, okMsg) => {
      const old = btn.innerHTML; btn.disabled = true; btn.classList.add('busy');
      Promise.resolve(p).then(r => r === 'quiet' ? 0 : toast(r === 'copied' ? okMsg : r === 'shared' ? '공유 창을 열었습니다' : r === 'saved' ? '이 기기에서는 복사가 안 돼서 이미지로 저장했습니다' : '취소했습니다'))
        .catch(err => toast('이미지를 만들지 못했습니다: ' + err.message)).finally(() => { btn.disabled = false; btn.classList.remove('busy'); btn.innerHTML = old; });
    };
    $('#copyImg').onclick = ev => run(ev.currentTarget, window.SudoReport.copyImage(node(0)), pages.length > 1 ? '1쪽을 복사했습니다. 카톡에 붙여넣기 하세요' : '복사했습니다. 카톡이나 문자에 붙여넣기 하세요');
    $$('.copy1').forEach(b => b.onclick = ev => run(ev.currentTarget, window.SudoReport.copyImage(node(+b.dataset.pg)), `${+b.dataset.pg + 1}쪽을 복사했습니다`));
    const sh = $('#shareImg'); if (sh) sh.onclick = ev => run(ev.currentTarget, window.SudoReport.shareImage(node(0), name(0)), '');
    $('#saveImg').onclick = ev => run(ev.currentTarget, (async () => { for (let i = 0; i < pages.length; i++) await window.SudoReport.saveImage(node(i), name(i)); return 'saved_ok'; })().then(() => { toast('이미지를 저장했습니다'); return 'quiet'; }), '');
    const ls = $('#linkShare'); if (ls) ls.onclick = () => {
      // 분석지를 지금 모습(고친 글 포함) 그대로 공개용 링크로 저장. 주소는 길고 무작위라 아는 사람만 열 수 있음
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', rnd = crypto.getRandomValues(new Uint8Array(18));
      const id = [...rnd].map(x => a[x % a.length]).join('');
      const html = $$('#preview .rpt').map(r => { const c = r.cloneNode(true); c.style.transform = 'none'; c.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable')); return c.outerHTML; });
      const title = `${short(e.s)}중 ${e.g}학년 ${e.t}학기 ${e.x}고사 분석`;
      const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'r.html#' + id;
      const saved = ctx.shareReport(id, { html, title, fmt: OUT.fmt, exam: e.id, createdAt: new Date().toISOString() });
      saved.then(() => {}, err => toast('링크를 만들지 못했습니다: ' + err.message));
      if (MODE === 'phone' && navigator.share) {
        navigator.share({ title: '수학도서관 · ' + title, url }).catch(() => {});
      } else if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ 'text/plain': saved.then(() => new Blob([url], { type: 'text/plain' })) })])
          .then(() => toast('링크를 복사했습니다. 카톡에 붙여넣기 하세요'), () => saved.then(() => copyText(null, url, '링크를 복사했습니다. 카톡에 붙여넣기 하세요')));
      } else saved.then(() => copyText(null, url, '링크를 복사했습니다. 카톡에 붙여넣기 하세요'));
    };
    const pr = $('#printIt'); if (pr) pr.onclick = () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); };
  }
  function fitPreview() {
    const pv = $('#preview'); if (!pv) return;
    const avail = pv.clientWidth - 2;
    $$('.pgwrap', pv).forEach(w => {
      const r = $('.rpt', w), pg = $('.pg', w), nw = +r.dataset.w;
      const sc = Math.min(1, avail / nw);
      r.style.transform = `scale(${sc})`; r.style.transformOrigin = 'top left';
      pg.style.width = nw * sc + 'px'; pg.style.height = r.offsetHeight * sc + 'px';
    });
  }

  // ---------- 준비 중 ----------
  // ---------- 5. 시험 등록 (4단계) ----------
  function applySaved({ id, exam, analysis, newTypes }) {
    const DI = { 기본: 1, 응용: 2, 실력: 3, 심화: 4 }, BI = { 이해: 'U', 계산: 'C', 추론: 'R', 문제해결: 'P' };
    (newTypes || []).forEach(t => D.catalog.push([t.code, t.course, t.big, t.midNo, t.mid, t.typeNo, t.name || '']));
    const idx = {}; D.catalog.forEach((c, i) => { idx[c[0]] = i; });
    if (exam && !byId[id]) {
      const e = { id, s: exam.school, m: exam.main ? 1 : 0, y: exam.year, g: exam.grade, t: exam.sem, x: exam.exam, p: 1, a: 0, sc: 0, r: 0, f: exam.formats, fl: [], pr: '', n: exam.notes };
      D.exams.push(e); byId[id] = e;
    }
    A[id] = { level: analysis.level, cuts: analysis.cuts, essay: analysis.essay, source: analysis.source,
      items: analysis.items.map(i => [i.no, i.pts, DI[i.diff] || 0, BI[i.beh] || '', i.course, i.big, i.mid, i.type, idx[i.code] !== undefined ? idx[i.code] : -1, i.essay ? 1 : 0, i.ans || '', i.sol || '']) };
    byId[id].an = A[id];
    listsRefresh(); recRefresh(); anRefresh();
    const sc = $('#sideCount'); if (sc) sc.textContent = `${D.exams.length}개 시험 · ${schools.length}개 학교`;
  }
  const REG = window.SudoRegister({
    D, ctx, byId, A, REC, schools, years, esc, toast, $, $$, DIFF, BEH, ROLE, ROOT_WIN, MAIN4, short, applySaved,
    mode: () => MODE,
    go: v => { if ((location.hash || '#archive').slice(1) !== v) location.hash = '#' + v; },
    openExam: id => { const e = byId[id]; F.school = e.s; F.course = '전체'; F.year = '전체'; F.exam = '전체'; F.state = '전체'; F.q = ''; F.open = id; saveF(); if (location.hash === '#archive') route(); else location.hash = '#archive'; },
    diffBarCounts: c => `<div class="dbar" role="img" aria-label="기본 ${c[1]}, 응용 ${c[2]}, 실력 ${c[3]}, 심화 ${c[4]}">${[1, 2, 3, 4].filter(k => c[k]).map(k => `<i style="flex:${c[k]};background:var(--d${k})"></i>`).join('')}</div>`
  });
  window.addEventListener('beforeunload', ev => { if (REG.busy()) { ev.preventDefault(); ev.returnValue = ''; } });

  const SOON = {
    factory: ['문제 제작소', '5단계', '학교별 누적 분석을 바탕으로 기본 2회분, 추가 2회분까지 모의고사를 만듭니다.']
  };
  function renderSoon(v) {
    const s = SOON[v];
    $('#main').innerHTML = `<div class="head"><div><div class="kicker">${s[1]}에서 만듭니다</div><h1>${s[0]}</h1></div></div><section class="card soonbox"><p>${s[2]}</p><a href="#archive" class="lnk">시험지 보관함으로 가기</a></section>`;
  }

  // ---------- 라우팅 ----------
  let lastView = null;
  function route() {
    let v = (location.hash || '#archive').slice(1) || 'archive';
    if (MODE === 'phone' && (SOON[v] || v === 'register')) v = 'archive';
    if (v !== 'school') consult = false;
    $$('[data-v]').forEach(a => { const on = a.dataset.v === v; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'school') renderSchool(); else if (v === 'types') renderTypes(); else if (v === 'output') renderOutput(); else if (v === 'register') REG.render(); else if (SOON[v]) renderSoon(v); else renderArchive();
    if (v !== lastView) window.scrollTo(0, 0);
    lastView = v;
  }
  $('#sideNote').innerHTML = `<span id="sideCount">${D.exams.length}개 시험 · ${schools.length}개 학교</span><br>데이터 기준일 ${esc(D.built)}`
    + (ctx ? `<br>${esc(ctx.user)} <button type="button" class="linkbtn" id="logout">로그아웃</button>` : '');
  if (ctx) $('#logout').onclick = () => ctx.signOut();
  // PC·안드로이드 크롬/엣지: '앱으로 설치' 버튼
  function installBtn() {
    if (!window.__bip || $('#installApp')) return;
    $('#sideNote').insertAdjacentHTML('beforeend', '<br><button type="button" class="linkbtn" id="installApp">이 컴퓨터에 앱으로 설치</button>');
    $('#installApp').onclick = async () => { const p = window.__bip; window.__bip = null; p.prompt(); await p.userChoice.catch(() => {}); $('#installApp').remove(); };
  }
  installBtn(); addEventListener('bip-ready', installBtn);
  window.addEventListener('hashchange', route);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => {
    const m = mode(); if (m !== MODE) { MODE = m; document.body.dataset.mode = m; closeSheet(); route(); } else if ((location.hash || '').startsWith('#output')) fitPreview();
  }, 150); });
  route();
};
