// 수도 내신분석 — MYBOX 연결: 'A. 내신대비' 폴더를 한 번 연결해 두고, 앱을 열 때와 켜 둔 동안 10분마다 새 파일을 찾는다
// 폴더에는 아무것도 쓰지 않는다 (읽기만). 연결은 이 컴퓨터의 크롬·엣지에만 기억된다.
window.SudoMybox = function (H) {
  const { D, ctx, byId, esc, toast, $, $$ } = H;
  const EVERY = 10 * 60 * 1000;
  const KINDS = {
    exam: { t: 'B. 학교별 기출문제', re: /^B[.\s]*학교별\s*기출/, use: '시험지 보관함 · 미리 분석' },
    academy: { t: '★내신대비교재★', re: /내신대비\s*교재/, use: '자료실 · 학원 내신대비 자료' },
    school: { t: 'C. 학교별 보충프린트', re: /^C[.\s]*학교별\s*보충/, use: '자료실 · 학교 프린트' }
  };
  const S = {
    state: 'checking',          // checking · unsupported · none · ask · ok
    root: null, rootName: '', scanning: false, progress: '', last: null, next: null, error: '',
    files: { exam: new Map(), academy: new Map(), school: new Map() }, found: { exam: false, academy: false, school: false },
    changes: { added: [], changed: [], removed: [], at: null }, seen: true,
    addedExams: [], unknown: [], listeners: []
  };
  const can = () => !ctx || !ctx.can || ctx.can.register;

  // ---------- 이 컴퓨터에 연결 기억 (IndexedDB) ----------
  const DB = 'sudo-mybox';
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      const o = indexedDB.open(DB, 1);
      o.onupgradeneeded = () => o.result.createObjectStore('kv');
      o.onerror = () => rej(o.error);
      o.onsuccess = () => {
        try { const tx = o.result.transaction('kv', mode), st = tx.objectStore('kv'); const r = fn(st); tx.oncomplete = () => { o.result.close(); res(r && r.result); }; tx.onerror = () => { o.result.close(); rej(tx.error); }; }
        catch (e) { o.result.close(); rej(e); }
      };
    });
  }
  const get = k => idb('readonly', st => st.get(k)).catch(() => null);
  const put = (k, v) => idb('readwrite', st => st.put(v, k)).catch(() => null);
  const del = k => idb('readwrite', st => st.delete(k)).catch(() => null);

  const emit = () => S.listeners.forEach(f => { try { f(S); } catch (_) { /* 화면 갱신 실패는 무시 */ } });

  async function init() {
    if (!('showDirectoryPicker' in window) || !window.indexedDB) { S.state = 'unsupported'; emit(); return; }
    const h = await get('root');
    if (!h) { S.state = 'none'; emit(); return; }
    S.root = h; S.rootName = h.name;
    let p = 'prompt'; try { p = await h.queryPermission({ mode: 'read' }); } catch (_) { p = 'prompt'; }
    S.state = p === 'granted' ? 'ok' : 'ask'; emit();
    if (S.state === 'ok') scan();
  }
  // 폴더 고르기: 'A. 내신대비'를 고르는 것이 기본. 그 위('2026 중등부')나 그 안의 한 폴더를 골라도 찾아 준다
  async function connect() {
    let h;
    try { h = await window.showDirectoryPicker({ id: 'sudo-mybox', mode: 'read', startIn: S.root || 'desktop' }); }
    catch (e) { if (e.name !== 'AbortError') toast('폴더를 열지 못했습니다: ' + e.message); return; }
    const subs = await findSubs(h);
    if (!subs.exam && !subs.academy && !subs.school) { toast("이 폴더 안에서 'B. 학교별 기출문제'·'★내신대비교재★'·'C. 학교별 보충프린트'를 찾지 못했습니다. 'A. 내신대비' 폴더를 골라 주세요"); return; }
    await put('root', h); await del('snap');
    S.root = h; S.rootName = h.name; S.state = 'ok'; S.changes = { added: [], changed: [], removed: [], at: null }; S.seen = true;
    toast(`‘${h.name}’ 폴더를 연결했습니다. 파일을 확인합니다`);
    emit(); scan(true);
  }
  async function reconnect() {
    if (!S.root) return connect();
    let p = 'denied'; try { p = await S.root.requestPermission({ mode: 'read' }); } catch (_) { p = 'denied'; }
    if (p !== 'granted') { toast('허락하지 않아 연결하지 못했습니다. 다시 누르면 크롬이 다시 물어봅니다'); return; }
    S.state = 'ok'; emit(); scan(true);
  }
  async function disconnect() {
    await del('root'); await del('snap');
    Object.assign(S, { state: 'none', root: null, rootName: '', last: null, next: null });
    Object.keys(S.files).forEach(k => S.files[k] = new Map());
    emit();
  }
  async function findSubs(h) {
    const out = {};
    const look = async (dir, depth) => {
      for (const k of Object.keys(KINDS)) if (!out[k] && KINDS[k].re.test(dir.name)) out[k] = dir;
      if (depth > 2) return;
      for await (const [name, c] of dir.entries()) {
        if (c.kind !== 'directory' || name.startsWith('.')) continue;
        if (Object.values(KINDS).some(K => K.re.test(name)) || /내신대비|중등부/.test(name)) await look(c, depth + 1);
      }
    };
    await look(h, 0);
    return out;
  }
  const okExt = n => /\.(pdf|jpe?g|png|hwpx?)$/i.test(n) && !/^[~.]/.test(n);
  async function walk(dir, prefix, out, depth) {
    for await (const [name, c] of dir.entries()) {
      if (name.startsWith('.') || name.startsWith('~')) continue;
      if (c.kind === 'directory') { if (depth < 8) await walk(c, prefix + name + '/', out, depth + 1); }
      else if (okExt(name)) {
        try { out.set(prefix + name, await c.getFile()); } catch (_) { /* 읽을 수 없는 파일은 건너뜀 */ }
        if (out.size % 50 === 0) { S.progress = `${out.size}개 확인`; emit(); }
      }
    }
  }

  // ---------- 폴더 훑기 ----------
  async function scan(manual) {
    if (S.scanning || !S.root || S.state !== 'ok') return;
    S.scanning = true; S.progress = '폴더 여는 중'; S.error = ''; emit();
    try {
      const subs = await findSubs(S.root);
      const files = { exam: new Map(), academy: new Map(), school: new Map() };
      for (const k of Object.keys(KINDS)) { S.found[k] = !!subs[k]; if (subs[k]) await walk(subs[k], '', files[k], 0); }
      S.files = files;
      // 지난번과 비교: 새로 들어온 파일 · 바뀐 파일 · 없어진 파일
      const sig = {}; Object.entries(files).forEach(([k, m]) => m.forEach((f, p) => { sig[k + ':' + p] = f.size + '|' + f.lastModified; }));
      const prev = await get('snap');
      if (prev) {
        const added = [], changed = [], removed = [];
        Object.entries(sig).forEach(([p, v]) => { if (!(p in prev)) added.push(p); else if (prev[p] !== v) changed.push(p); });
        Object.keys(prev).forEach(p => { if (!(p in sig)) removed.push(p); });
        if (added.length || changed.length || removed.length) { S.changes = { added, changed, removed, at: new Date() }; S.seen = false; }
      }
      await put('snap', sig);
      if (can()) await autoExams();
      S.last = new Date(); S.next = new Date(Date.now() + EVERY);
      if (manual) toast(`MYBOX 확인 끝 · 시험지 ${files.exam.size}개 · 교재 ${files.academy.size}개 · 학교 프린트 ${files.school.size}개`);
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) S.state = 'ask';
      else S.error = String(e.message || e).slice(0, 100);
    }
    S.scanning = false; S.progress = '';
    try { if (H.afterScan) H.afterScan(); } catch (_) { /* 다른 화면 갱신 실패는 무시 */ }
    emit();
  }

  // ---------- 새 시험지 → 보관함에 자동으로 올리기 (분석은 원장님이 버튼으로) ----------
  const MAIN4 = H.MAIN4 || ['목운중', '신목중', '양정중', '월촌중'];
  function parse(path) {
    const name = path.split('/').pop().normalize('NFC'), parts = path.split('/');
    if (/내신분석|분석\s*보고서|예상\]|족보\s*\[Q\]/.test(name)) return null;
    let school = null, m = name.match(/(?:20)?\d\d년[\s_]*\]?\s*([가-힣]+?중)(?:학교)?\s*_?\s*[123]\s*-\s*[12]/) || name.match(/([가-힣]{2,6}?중)(?:학교)?\s*[123]\s*-\s*[12]/) || name.match(/([가-힣]{2,6}?중)학교/);
    if (m) school = m[1];
    if (!school && /^중[123]$/.test(parts[0])) { if (['목운', '신목', '양정', '월촌'].includes(parts[1])) school = parts[1] + '중'; else if (/기타/.test(parts[1]) && parts[2]) school = parts[2].replace(/중?$/, '중'); }
    let year = null; m = name.match(/(20[12]\d)/) || path.match(/(20[12]\d)/); if (m) year = +m[1]; else { m = name.match(/(?:^|[\[_\s])(\d\d)\s*(?:년|_|-)/); if (m && +m[1] >= 18 && +m[1] <= 30) year = 2000 + +m[1]; }
    let g = null, s = null; m = name.match(/중\s*(\d)\s*-\s*(\d)(?!\d)/) || name.match(/[가-힣]중\s*_?\s*([123])\s*-\s*([12])(?!\d)/) || name.match(/(?<![\d-])([123])-([12])(?![\d])/);
    if (m) { g = +m[1]; s = +m[2]; }
    if (g === null) { m = name.match(/(?<!\d)([123])\s*학년(?!도)/); if (m) g = +m[1]; }
    if (s === null) { m = name.match(/(?<!\d)([12])\s*학기/) || path.match(/([12])\s*학기/); if (m) s = +m[1]; }
    if (g === null && /^중[123]$/.test(parts[0])) g = +parts[0][1];
    const exam = /중간/.test(name) ? '중간' : /기말/.test(name) ? '기말' : /중간/.test(path) ? '중간' : /기말/.test(path) ? '기말' : null;
    if (!school || !year || !g || !s || !exam) return null;
    const role = /정답\s*포함|원안\s*및\s*정답|문제\s*및\s*정답|\[답[O0o]\]/.test(name) ? 'PA' : /문항정보표/.test(name) ? 'I' : /채점\s*기준/.test(name) ? 'R' : /배점표/.test(name) ? 'S' : /정답|답안|답지/.test(name) && !/정답지\s*없음/.test(name) ? 'A' : 'P';
    const v = []; if (/Clean|정리본/i.test(name)) v.push('Clean'); if (/원본|스캔/.test(name)) v.push('원본'); if (/사진/.test(name) || /\.jpe?g$/i.test(name)) v.push('사진');
    return { school, year, grade: g, sem: s, exam, role, variant: v.join(','), id: `${school}-${year}-${g}-${s}-${exam}` };
  }
  // 대표 시험지: 정리본(글자 PDF) > 스캔 PDF > 사진
  const rank = f => (/Clean/.test(f[2]) ? 0 : 2) + (/\.pdf$/i.test(f[0]) ? 0 : 1) + (/사진/.test(f[2]) ? 2 : 0) + (/\.hwpx?$/i.test(f[0]) ? 9 : 0);
  async function autoExams() {
    const known = new Set(D.exams.flatMap(e => e.fl.map(f => f[0])));
    const groups = new Map(); const unknown = [];
    S.files.exam.forEach((f, p) => {
      if (known.has(p)) return;
      const x = parse(p); if (!x) { if (!/\.hwpx?$/i.test(p)) unknown.push(p); return; }
      if (!groups.has(x.id)) groups.set(x.id, { x, files: [] });
      groups.get(x.id).files.push({ path: p, role: x.role, variant: x.variant });
    });
    S.unknown = unknown.slice(0, 200);
    const added = [];
    for (const [id, g] of groups) {
      const e = byId[id], x = g.x;
      const fl = (e ? e.fl : []).concat(g.files.map(f => [f.path, f.role, f.variant]));
      const papers = fl.filter(f => (f[1] === 'P' || f[1] === 'PA') && !/\.hwpx?$/i.test(f[0])).sort((a, b) => rank(a) - rank(b));
      const primary = e && e.an && e.pr ? e.pr : (papers[0] ? papers[0][0] : (e ? e.pr : ''));
      const doc = e ? { primary, hasPaper: !!(e.p || papers.length), hasAnswer: !!(e.a || g.files.some(f => f.role === 'A' || f.role === 'PA')) }
        : { school: x.school, main: MAIN4.includes(x.school), year: x.year, grade: x.grade, sem: x.sem, exam: x.exam, hasPaper: papers.length > 0, hasAnswer: g.files.some(f => f.role === 'A' || f.role === 'PA'),
          hasPoints: false, hasRubric: false, formats: [...new Set(g.files.map(f => f.path.split('.').pop().toLowerCase()))], primary, notes: ['MYBOX에서 자동으로 올림'], addedAt: new Date().toISOString() };
      try {
        if (ctx && ctx.saveExamFiles) await ctx.saveExamFiles(id, doc, g.files);
        H.addExamFiles(id, doc, g.files);
        added.push({ id, n: g.files.length, isNew: !e });
      } catch (err) { S.error = '보관함에 올리지 못했습니다: ' + String(err.message || err).slice(0, 60); }
    }
    if (added.length) { S.addedExams = added.concat(S.addedExams).slice(0, 50); S.seen = false; }
  }

  // ---------- 다른 화면이 쓰는 것 ----------
  const ready = () => S.state === 'ok' && !!S.last;
  const examMap = () => S.files.exam;
  const fileOf = (kind, path) => S.files[kind] && S.files[kind].get(path);
  // 분석 전인 시험 중 MYBOX에 읽을 수 있는 시험지가 있는 것
  const waitingExams = () => D.exams.filter(e => !e.an && e.fl.some(f => (f[1] === 'P' || f[1] === 'PA') && /\.(pdf|jpe?g|png)$/i.test(f[0]) && S.files.exam.has(f[0])));

  // ---------- 화면 ----------
  const fmt = d => d ? d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : '';
  const kindOf = p => p.split(':')[0], pathOf = p => p.slice(p.indexOf(':') + 1);
  function banner() {
    const el = $('#mbBanner'); if (!el) return;
    if (!can() || S.state === 'unsupported' || S.state === 'checking') { el.hidden = true; return; }
    const isMb = (location.hash || '') === '#mybox';
    if (S.state === 'ask') {
      el.hidden = false;
      el.innerHTML = `<span><b>MYBOX 연결을 한 번 허락해 주세요</b> · 크롬을 다시 켜면 보안 때문에 한 번 더 물어봅니다</span><button type="button" class="btn sm" id="mbAsk">MYBOX 다시 연결</button>`;
      $('#mbAsk').onclick = reconnect; return;
    }
    const nNew = S.changes.added.length + S.addedExams.length;
    if (S.state === 'ok' && !S.seen && !isMb && (nNew || S.changes.changed.length)) {
      const c = S.changes, n = c.added.length;
      const parts = ['exam', 'academy', 'school'].map(k => [k, c.added.filter(p => kindOf(p) === k).length]).filter(x => x[1]).map(([k, v]) => `${{ exam: '시험지', academy: '교재', school: '학교 프린트' }[k]} ${v}개`);
      el.hidden = false;
      el.innerHTML = `<span><b>MYBOX에 새 파일 ${n}개</b>${parts.length ? ' · ' + parts.join(', ') : ''}${c.changed.length ? ` · 바뀐 파일 ${c.changed.length}개` : ''} <small>(${fmt(c.at || S.last)} 확인)</small></span><span class="row2"><a class="btn sm" href="#mybox">확인하기</a><button type="button" class="btn ghost sm" id="mbLater">나중에</button></span>`;
      $('#mbLater').onclick = () => { S.seen = true; banner(); };
      return;
    }
    el.hidden = true;
  }
  function render() {
    S.seen = true; banner();
    const st = S.state, c = S.changes;
    const pill = st === 'ok' ? (S.scanning ? `<span class="pill raw">확인하는 중 <span id="mbProg">${esc(S.progress)}</span></span>` : '<span class="pill ok">연결됨 · 10분마다 자동 확인</span>') : st === 'ask' ? '<span class="pill warn">허락 필요</span>' : st === 'none' ? '<span class="pill raw">연결 안 됨</span>' : '';
    const rows = Object.entries(KINDS).map(([k, K]) => `<tr><td><b>${esc(K.t)}</b><div class="mbpath">N:\\공유\\공유받은\\2026 중등부\\A. 내신대비\\${esc(K.t)}</div></td>
      <td>${st !== 'ok' || !S.last ? '<span class="dl">-</span>' : S.found[k] ? '<span class="pill ok">찾음</span>' : '<span class="pill warn">못 찾음</span>'}</td><td class="num">${S.last && S.found[k] ? S.files[k].size + '개' : '-'}</td><td>${esc(K.use)}</td></tr>`).join('');
    const wait = S.last ? waitingExams() : [];
    const lib = H.libFound ? H.libFound() : { academy: 0, school: 0 };
    const list = (arr, label) => arr.length ? `<details class="exd"><summary>${label} ${arr.length}개 보기</summary><div class="exl">${arr.slice(0, 80).map(p => `<div><span>${esc(pathOf(p))}</span><span class="dl">${{ exam: '시험지', academy: '교재', school: '학교 프린트' }[kindOf(p)] || ''}</span></div>`).join('')}${arr.length > 80 ? `<div class="dl">외 ${arr.length - 80}개</div>` : ''}</div></details>` : '';
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">‘A. 내신대비’ 폴더를 한 번 연결해 두면 새 시험지·교재·프린트를 알아서 찾아옵니다</div><h1>MYBOX 연결</h1></div><div class="headact">${pill}</div></div>
      ${st === 'unsupported' ? `<section class="card"><p>이 브라우저는 폴더를 연결해 둘 수 없습니다. <b>PC의 크롬이나 엣지</b>에서 열어 주세요. (아이패드·사파리에서는 지금처럼 화면마다 폴더를 골라 쓰면 됩니다)</p></section>` : ''}
      ${st === 'none' ? `<section class="card mbstart"><h2>MYBOX 폴더 연결하기</h2>
        <ol class="mbsteps"><li>아래 <b>폴더 연결</b>을 누릅니다.</li><li><b>N:\\공유\\공유받은\\2026 중등부\\A. 내신대비</b> 폴더를 고르고 ‘폴더 선택’을 누릅니다.</li><li>크롬이 “파일을 볼 수 있게 할까요?”라고 물으면 <b>보기 허용</b>(또는 ‘방문할 때마다 허용’)을 누릅니다.</li></ol>
        <button type="button" class="btn big" id="mbConnect">폴더 연결</button><p class="dl">폴더에는 아무것도 쓰지 않고 읽기만 합니다. 연결은 이 컴퓨터의 크롬에만 기억됩니다.</p></section>` : ''}
      ${st === 'ask' ? `<section class="card mbstart"><h2>MYBOX 다시 연결</h2><p>‘${esc(S.rootName)}’ 폴더가 연결되어 있지만, 크롬을 다시 켜면 보안 때문에 한 번 더 허락이 필요합니다. 크롬이 물으면 <b>방문할 때마다 허용</b>을 고르면 다음부터는 묻지 않습니다.</p><button type="button" class="btn big" id="mbAsk2">MYBOX 다시 연결</button></section>` : ''}
      ${st === 'ok' ? `<section class="card"><div class="head"><h2>연결된 폴더 <small>${esc(S.rootName)}</small></h2><span class="dl">${S.last ? `마지막 확인 ${fmt(S.last)} · 다음 확인 ${fmt(S.next)}` : '처음 확인하는 중…'}</span></div>
        <div class="tablewrap"><table class="mbtbl"><thead><tr><th>폴더</th><th>상태</th><th>파일</th><th>쓰는 곳</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${S.error ? `<p class="callout why">${esc(S.error)}</p>` : ''}
        <div class="row2"><button type="button" class="btn" id="mbNow" ${S.scanning ? 'disabled' : ''}>지금 확인</button><button type="button" class="btn ghost" id="mbRe">다른 폴더로 다시 연결</button><button type="button" class="btn ghost" id="mbOff">연결 끊기</button></div></section>
      <div class="mbcards">
        <section class="card mbc"><small>미리 분석 대기 시험</small><b>${wait.length}건</b><span>MYBOX에 시험지가 있고 아직 분석하지 않은 시험</span>${wait.length ? '<a class="btn sm" href="#register" id="mbPre">미리 분석으로 가기</a>' : ''}</section>
        <section class="card mbc"><small>색인 대기 자료</small><b>${lib.academy + lib.school}개</b><span>교재 ${lib.academy} · 학교 프린트 ${lib.school} (아직 색인하지 않은 파일)</span>${lib.academy + lib.school ? '<a class="btn sm" href="#library">자료실로 가기</a>' : ''}</section>
        <section class="card mbc"><small>최근 바뀐 파일</small><b>${c.changed.length}개</b><span>${c.at ? fmt(c.at) + ' 확인 · ' : ''}분석한 시험이면 다시 분석이 필요할 수 있습니다</span></section>
        <section class="card mbc"><small>MYBOX에서 없어진 파일</small><b>${c.removed.length}개</b><span>분석 결과는 지우지 않고 그대로 둡니다</span></section>
      </div>
      <section class="card"><h2>최근 변화 <small>${c.at ? fmt(c.at) + ' 확인' : '앱을 켜 둔 동안 10분마다 확인합니다'}</small></h2>
        ${S.addedExams.length ? `<div class="mbadded"><b>보관함에 자동으로 올린 시험</b>${S.addedExams.slice(0, 20).map(a => { const e = byId[a.id]; return `<div><span>${e ? esc(`${e.s} ${e.y} ${e.g}학년 ${e.t}학기 ${e.x}`) : esc(a.id)}</span><span class="dl">${a.isNew ? '새 시험' : '파일 추가'} · 파일 ${a.n}개</span></div>`; }).join('')}</div>` : ''}
        ${list(c.added, '새로 들어온 파일')}${list(c.changed, '바뀐 파일')}${list(c.removed, '없어진 파일')}
        ${!c.added.length && !c.changed.length && !c.removed.length && !S.addedExams.length ? '<p class="dl">아직 달라진 파일이 없습니다.</p>' : ''}
        ${S.unknown.length ? `<details class="exd"><summary>학교·학년·시험을 알 수 없는 시험지 파일 ${S.unknown.length}개</summary><p class="dl">파일 이름에 ‘2026년_월촌중2-2-중간고사’처럼 연도·학교·학년-학기·중간/기말이 들어가면 자동으로 보관함에 올라갑니다.</p><div class="exl">${S.unknown.slice(0, 60).map(p => `<div><span>${esc(p)}</span></div>`).join('')}</div></details>` : ''}
      </section>` : ''}`;
    const b = id => $('#' + id);
    if (b('mbConnect')) b('mbConnect').onclick = connect;
    if (b('mbAsk2')) b('mbAsk2').onclick = reconnect;
    if (b('mbNow')) b('mbNow').onclick = () => scan(true);
    if (b('mbRe')) b('mbRe').onclick = connect;
    if (b('mbOff')) b('mbOff').onclick = () => { if (confirm('MYBOX 연결을 끊을까요? 폴더의 파일은 그대로입니다.')) disconnect(); };
    if (b('mbPre')) b('mbPre').onclick = ev => { ev.preventDefault(); H.openPre(); };
  }

  // 켜 둔 동안 10분마다, 그리고 창으로 돌아왔을 때(2분 넘었으면) 확인
  setInterval(() => { if (S.state === 'ok' && !document.hidden) scan(); }, EVERY);
  window.addEventListener('focus', () => { if (S.state === 'ok' && (!S.last || Date.now() - S.last > 2 * 60 * 1000)) scan(); });
  let lastKey = '';
  S.listeners.push(() => {
    banner();
    if ((location.hash || '') !== '#mybox') return;
    const key = [S.state, S.scanning, +S.last || 0, S.error].join('|');
    if (key !== lastKey) { lastKey = key; render(); } else { const p = $('#mbProg'); if (p) p.textContent = S.progress; }
  });
  init();

  return { render, scan, connect, reconnect, ready, examMap, fileOf, parse, waitingExams, state: () => S, onChange: f => S.listeners.push(f), banner };
};
