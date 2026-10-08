// 수도 내신분석 — 자료실: 학원 내신대비 자료 · 학교 프린트 · 개별 추가 자료를 문항 단위로 색인해 유사문항 찾기에 쓴다
window.SudoLibrary = function (H) {
  const { D, ctx, esc, toast, $, $$, DIFF, short } = H;
  const REG = H.reg;
  D.materials = D.materials || {};
  const SRC = {
    academy: { t: '학원 내신대비 자료', s: 'MYBOX ★내신대비교재★', path: 'N:\\공유\\공유받은\\2026 중등부\\A. 내신대비\\★내신대비교재★' },
    school: { t: '학교 프린트', s: 'MYBOX C. 학교별 보충프린트', path: 'N:\\공유\\공유받은\\2026 중등부\\A. 내신대비\\C. 학교별 보충프린트' },
    custom: { t: '개별 추가 자료', s: 'MYBOX에 없는 자료 직접 올리기' }
  };
  const COURSES = ['중등1-1', '중등1-2', '중등2-1', '중등2-2', '중등3-1', '중등3-2'];
  const COMMERCIAL = /쎈|블랙라벨|일품|개념원리|RPM|알피엠|숨마|에이급|A급|최상위|마플|자이스토리|개념플러스|우공비|풍산자|라이트쎈|베이직쎈|체크체크|디딤돌|큐브|만렙|빨강펜/i;
  const MAXP = 60, CHUNK = 3;
  const L = {
    tab: 'academy', course: '전체', sel: null, pg: 1,
    found: { academy: null, school: null },   // 폴더에서 찾은 새 파일 [{file, rel, course, school, commercial, on}]
    jobs: {}, running: false, queue: [],
    thumbs: {},                                // matId → {pg: dataURL} (이번에 연 것만)
    form: { name: '', course: '중등2-2', unit: '', school: '', commercial: false, files: [] }
  };
  const now = () => new Date().toISOString();
  const hash = str => { let h = 5381; for (let k = 0; k < str.length; k++) h = (h * 33 + str.charCodeAt(k)) >>> 0; return h.toString(36); };
  const okF = n => /\.(pdf|jpe?g|png)$/i.test(n);
  function guessCourse(t) {
    const m = String(t).match(/(?:중\s*)?([123])\s*[-–_·]\s*([12])(?!\d)/) || String(t).match(/([123])\s*학년\D{0,6}([12])\s*학기/);
    return m ? `중등${m[1]}-${m[2]}` : '';
  }
  const guessSchool = t => (H.schools.find(s => t.includes(s)) || H.schools.find(s => s.length > 2 && t.includes(s.replace(/중$/, ''))) || '');
  const mats = () => Object.values(D.materials);
  const pill = m => {
    const j = L.jobs[m.id];
    if (j && j.st === 'run') return `<span class="pill raw">AI 읽는 중 ${esc(j.msg || '')}</span>`;
    if (j && j.st === 'wait') return '<span class="pill raw">대기</span>';
    if (m.status === 'fail' || (j && j.st === 'fail')) return '<span class="pill warn">다시 필요</span>';
    if (m.status === 'review') return '<span class="pill gold">색인 검수 전</span>';
    return `<span class="pill ok">${(m.problems || []).filter(p => !p.skip).length}문항</span>`;
  };

  // ---------- 화면 ----------
  function render() {
    const all = mats(), nProb = all.reduce((s, m) => s + (m.problems || []).filter(p => !p.skip).length, 0);
    const nExamQ = D.exams.filter(e => e.an).reduce((s, e) => s + e.an.items.filter(i => i[12]).length, 0);
    const list = all.filter(m => (m.src || 'custom') === L.tab && (L.course === '전체' || m.course === L.course)).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    if (L.sel && !D.materials[L.sel]) L.sel = null;
    const sel = L.sel ? D.materials[L.sel] : null;
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">내신대비에 쓴 프린트를 문항 단위로 모아 유사문항을 찾는 데 씁니다</div><h1>자료실</h1></div>
        <div class="headact">${L.tab !== 'custom' ? `<label class="btn ghost" for="libDir">MYBOX에서 새 자료 확인</label>` : ''}<button type="button" class="btn" id="libAdd">개별 자료 추가</button></div></div>
      <input type="file" id="libDir" webkitdirectory multiple hidden>
      <div class="tiles">
        <div class="tile"><span>모은 자료</span><b>${all.length}개</b><span>학원 ${all.filter(m => m.src === 'academy').length} · 학교 프린트 ${all.filter(m => m.src === 'school').length} · 개별 ${all.filter(m => m.src === 'custom').length}</span></div>
        <div class="tile dark"><span>색인된 문항</span><b>${nProb}문항</b><span>유사문항 찾기에 쓰임</span></div>
        <div class="tile"><span>기출 문항</span><b>${nExamQ}문항</b><span>보관함 시험에서 자동 (핵심 내용 있는 것)</span></div>
        <div class="tile goldt2"><span>색인 검수 전</span><b>${all.filter(m => m.status === 'review').length}개</b><span>문항 영역·유형 확인 필요</span></div></div>
      <div class="libgrid">
        <section class="card">
          <div class="srctabs" role="tablist">${Object.entries(SRC).map(([k, v]) => `<button type="button" role="tab" data-src="${k}" aria-selected="${L.tab === k}"><b>${v.t}</b><small>${v.s}</small></button>`).join('')}</div>
          ${L.tab !== 'custom' ? `<div class="folderok ${L.found[L.tab] ? '' : 'off'}"><span>${esc(SRC[L.tab].path)}${L.found[L.tab] ? ` · 새 파일 ${L.found[L.tab].length}개` : ' · 오른쪽 위 ‘MYBOX에서 새 자료 확인’으로 폴더를 고르면 새 파일만 골라 냅니다'}</span></div>` : ''}
          ${L.found[L.tab] && L.found[L.tab].length ? foundBox(L.found[L.tab]) : ''}
          <div class="chips">${['전체', ...COURSES].map(c => `<button type="button" class="chip" data-lc="${c}" aria-pressed="${L.course === c}">${c === '전체' ? '전체 과정' : c.replace('중등', '')}</button>`).join('')}</div>
          <div class="mlist">${list.map(m => `<button type="button" class="mrow ${m.id === L.sel ? 'on' : ''}" data-mat="${esc(m.id)}"><span class="ext">${esc((m.ext || 'pdf').toUpperCase())}</span>
            <span class="mt"><b>${esc(m.name)}</b><small>${esc([m.course, m.unit ? m.unit.replace(/^\d+\./, '') : '', m.school, m.pages ? m.pages + '쪽' : '', m.commercial ? '시중 교재(그림 안 씀)' : ''].filter(Boolean).join(' · '))}</small></span>${pill(m)}</button>`).join('') || '<div class="empty">아직 자료가 없습니다.</div>'}</div>
        </section>
        <section class="card" aria-label="문항 색인">${L.adding ? addForm() : sel ? review(sel) : '<div class="empty">왼쪽에서 자료를 고르면 AI가 찾은 문항과 영역이 여기에 나옵니다.</div>'}</section>
      </div>`;
    bind();
    loadThumbs();
  }
  function foundBox(list) {
    const on = list.filter(f => f.on).length;
    return `<div class="foundbox"><b>새 자료 ${list.length}개</b> <small>이미 색인한 파일은 빼고 보여 줍니다. 과정을 확인하고 색인할 것만 고르세요.</small>
      <div class="flist">${list.map((f, k) => `<div class="frow2"><label class="chk"><input type="checkbox" data-fon="${k}" ${f.on ? 'checked' : ''}> <span title="${esc(f.rel)}">${esc(f.file.name)}</span></label>
        <select data-fco="${k}" aria-label="과정"><option value="">과정?</option>${COURSES.map(c => `<option ${c === f.course ? 'selected' : ''}>${c}</option>`).join('')}</select>
        ${L.tab === 'school' ? `<select data-fsc="${k}" aria-label="학교"><option value="">학교?</option>${H.schools.map(s => `<option ${s === f.school ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : `<label class="chk sm"><input type="checkbox" data-fcm="${k}" ${f.commercial ? 'checked' : ''}> 시중 교재</label>`}</div>`).join('')}</div>
      <div class="row2"><button type="button" class="btn" id="libRun" ${on && !L.running && aiReady() ? '' : 'disabled'}>선택한 ${on}개 색인 시작</button><button type="button" class="btn ghost" id="libClear">닫기</button></div>
      ${aiReady() ? '' : '<p class="callout">시험 등록 화면의 AI 연결을 먼저 마쳐 주세요.</p>'}
      <p class="dl">시중 교재는 문제 그림을 저장하지 않고 출처만 씁니다. 한 자료에 ${MAXP}쪽까지 읽습니다.</p></div>`;
  }
  const aiReady = () => !!(REG.aiSettings() || {}).url;
  function addForm() {
    const f = L.form, mids = f.course ? REG.midsOf(f.course) : [];
    return `<div class="head"><h2>개별 자료 추가 <small>MYBOX에 없는 자료</small></h2><button type="button" class="linkbtn" id="addX">닫기</button></div>
      <div class="addform">
        <label class="drop sm" id="addDrop"><input type="file" id="addFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple hidden>
          <b>${f.files.length ? f.files.map(x => esc(x.name)).join(', ') : '파일 고르기 (PDF · 사진)'}</b><span>사진 여러 장은 한 자료로 묶습니다.</span></label>
        <label class="sel"><span>자료 이름 <small>분석지에 이 이름으로 출처가 나옵니다</small></span><input id="addName" value="${esc(f.name)}" placeholder="예: 2학기 중간 대비 함수 프린트"></label>
        <div class="row2"><label class="sel"><span>과정</span><select id="addCourse">${COURSES.map(c => `<option ${c === f.course ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="sel"><span>단원 <small>선택</small></span><select id="addUnit"><option value="">여러 단원</option>${mids.map(m => `<option ${m.mid === f.unit ? 'selected' : ''}>${esc(m.mid)}</option>`).join('')}</select></label></div>
        <label class="sel"><span>학교 <small>선택</small></span><select id="addSchool"><option value="">공통</option>${H.schools.map(s => `<option ${s === f.school ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" id="addCom" ${f.commercial ? 'checked' : ''}> 시중 교재 <small>문제 그림은 넣지 않고 출처만</small></label>
        <button type="button" class="btn big" id="addGo" ${f.files.length && aiReady() && !L.running ? '' : 'disabled'}>추가하고 AI로 색인</button>
        ${aiReady() ? '' : '<p class="callout">시험 등록 화면의 AI 연결을 먼저 마쳐 주세요.</p>'}</div>`;
  }

  // 색인 검수: 쪽마다 AI가 찾은 문항 영역과 분류
  function review(m) {
    const probs = (m.problems || []).map((p, k) => Object.assign({ k }, p));
    const pages = [...new Set(probs.map(p => p.pg || 1))].sort((a, b) => a - b);
    if (!pages.includes(L.pg)) L.pg = pages[0] || 1;
    const here = probs.filter(p => (p.pg || 1) === L.pg);
    const th = (L.thumbs[m.id] || {})[L.pg];
    const okPages = new Set(m.okPages || []);
    const mids = REG.midsOf(m.course, (m.problems || []).map(p => ({ mid: p.mid, big: p.big })));
    const j = L.jobs[m.id];
    return `<div class="head"><h2>${esc(m.name)} <small>${esc(m.course || '과정 미정')} · ${L.pg}쪽 (${pages.indexOf(L.pg) + 1}/${pages.length}) · 문항 ${probs.filter(p => !p.skip).length}개</small></h2>${m.status === 'review' ? '<span class="pill gold">색인 검수 전</span>' : m.status === 'done' ? '<span class="pill ok">확인 완료</span>' : ''}</div>
      ${j && j.st === 'run' ? `<p class="callout">AI가 읽는 중입니다 (${esc(j.msg || '')}). 끝나면 여기에 문항이 나옵니다.</p>` : ''}
      ${m.warnings && m.warnings.length ? `<div class="callout">${m.warnings.slice(0, 4).map(esc).join('<br>')}</div>` : ''}
      <details class="mset"><summary>자료 정보 고치기</summary><div class="addform">
        <label class="sel"><span>이름</span><input id="mName" value="${esc(m.name)}"></label>
        <div class="row2"><label class="sel"><span>과정</span><select id="mCourse">${COURSES.map(c => `<option ${c === m.course ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="sel"><span>학교</span><select id="mSchool"><option value="">공통</option>${H.schools.map(s => `<option ${s === m.school ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label></div>
        <label class="chk"><input type="checkbox" id="mCom" ${m.commercial ? 'checked' : ''}> 시중 교재 (그림 안 씀)</label>
        <div class="row2"><button type="button" class="btn sm" id="mSave">정보 저장</button><button type="button" class="btn ghost sm danger" id="mDel">자료 지우기</button></div></div></details>
      ${probs.length ? `<div class="revgrid">
        <div class="pgview">${th ? `<div class="pgimg"><img src="${th}" alt="${L.pg}쪽">${here.map(p => p.box ? `<i class="pbox ${p.conf < 0.7 ? 'low' : ''} ${p.skip ? 'skip' : ''}" style="left:${p.box[0] / 10}%;top:${p.box[1] / 10}%;width:${(p.box[2] - p.box[0]) / 10}%;height:${(p.box[3] - p.box[1]) / 10}%"><span>${esc(p.no)}</span></i>` : '').join('')}</div><small class="dl">AI가 찾은 문항 영역 · 금색 = 유형이 애매함</small>`
          : `<div class="pgnone">${m.commercial ? '시중 교재라 그림을 저장하지 않았습니다.' : '쪽 그림은 색인한 그 자리에서만 보입니다. 문항 그림은 오른쪽에 있습니다.'}${m.src !== 'custom' || true ? `<label class="btn ghost sm" for="mReopen">원본 파일 다시 열기</label><input type="file" id="mReopen" accept=".pdf,.jpg,.jpeg,.png" multiple hidden>` : ''}</div>`}</div>
        <div class="plist">${here.map(p => probRow(m, p, mids)).join('') || '<div class="empty">이 쪽에는 문항이 없습니다.</div>'}</div></div>
      <div class="row2 navrow"><button type="button" class="btn ghost" id="pgPrev" ${pages.indexOf(L.pg) > 0 ? '' : 'disabled'}>이전 쪽</button>
        <span class="dl">${okPages.size}/${pages.length}쪽 확인</span>
        <button type="button" class="btn" id="pgOk">${pages.indexOf(L.pg) < pages.length - 1 ? '이 쪽 확인 · 다음 쪽' : '이 쪽 확인 · 색인 끝'}</button></div>`
      : (j && j.st === 'run' ? '' : `<div class="empty">찾은 문항이 없습니다. ${m.status === 'fail' ? '읽기에 실패했습니다: ' + esc(m.error || '') : ''}</div><div class="row2"><label class="btn ghost sm" for="mReopen">원본 파일 열고 다시 색인</label><input type="file" id="mReopen" accept=".pdf,.jpg,.jpeg,.png" multiple hidden></div>`)}`;
  }
  function probRow(m, p, mids) {
    const types = p.mid ? REG.typesOf(m.course, p.mid) : [];
    const known = p.code && types.some(([c]) => c[0] === p.code);
    return `<div class="prow ${p.skip ? 'skip' : ''} ${(p.conf || 1) < 0.7 && !p.ok ? 'need' : ''}" data-k="${p.k}">
      <div class="pth">${p.ik && !m.commercial ? `<button type="button" class="thumb" data-zoom><img data-ik="${esc(p.ik)}" alt="${esc(p.no)}번 문항 그림"></button>` : ''}${L.pages && L.pages.id === m.id ? `<button type="button" class="linkbtn" data-rebox>영역</button>` : ''}</div>
      <div class="pmain"><div class="ptop"><b>${esc(p.no)}번</b><div class="dseg">${[1, 2, 3, 4].map(k => `<button type="button" data-pd="${k}" class="d${k}" aria-pressed="${DIFF.indexOf(p.diff) === k}">${DIFF[k]}</button>`).join('')}</div>
        <button type="button" class="linkbtn" data-skip>${p.skip ? '되살리기' : '빼기'}</button></div>
        <div class="row2"><select data-pm aria-label="중단원"><option value="">중단원</option>${mids.map(x => `<option ${x.mid === p.mid ? 'selected' : ''}>${esc(x.mid)}</option>`).join('')}</select>
          <select data-pt aria-label="유형"><option value="">${p.mid ? '유형 고르기' : '중단원 먼저'}</option>${types.map(([c]) => `<option value="${esc(c[0])}" ${c[0] === p.code ? 'selected' : ''}>${esc(c[5])}.${esc(c[6] || '(이름 없음)')}</option>`).join('')}${!known && p.type ? `<option value="" selected>AI 제안: ${esc(String(p.type).replace(/^\d+\.\s*/, ''))}</option>` : ''}</select></div>
        <small class="qtx">${esc(p.q || '')}</small></div></div>`;
  }

  function loadThumbs() {
    const imgs = $$('img[data-ik]'); if (!imgs.length) return;
    const fill = map => imgs.forEach(im => { const v = map[im.dataset.ik]; if (v) im.src = v; else { const b = im.closest('.thumb'); if (b) b.remove(); } });
    if (ctx && ctx.getImgs) ctx.getImgs(imgs.map(i => i.dataset.ik)).then(fill, () => {}); else fill(H.imgCache || {});
  }

  // ---------- 동작 ----------
  let saveT = null;
  function saveMat(m, quiet) {
    D.materials[m.id] = m; H.simReset();
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (ctx) ctx.saveMaterial(m.id, m).then(() => { if (!quiet) toast('저장했습니다'); }, e => toast('저장하지 못했습니다: ' + e.message)); }, quiet ? 600 : 0);
  }
  function bind() {
    $$('[data-src]').forEach(b => b.onclick = () => { L.tab = b.dataset.src; L.sel = null; L.adding = false; render(); });
    $$('[data-lc]').forEach(b => b.onclick = () => { L.course = b.dataset.lc; render(); });
    $$('[data-mat]').forEach(b => b.onclick = () => { L.sel = b.dataset.mat; L.adding = false; L.pg = 1; render(); });
    $('#libAdd').onclick = () => { L.adding = true; L.sel = null; if (L.tab !== 'custom') { L.tab = 'custom'; } render(); };
    const dir = $('#libDir');
    if (dir) dir.onchange = () => {
      const src = L.tab, known = new Set(mats().filter(m => m.src === src).map(m => m.path + '|' + m.size));
      const found = [];
      [...dir.files].forEach(f => {
        if (!okF(f.name) || /^~|^\./.test(f.name)) return;
        const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
        if (known.has(rel + '|' + f.size)) return;
        found.push({ file: f, rel, course: guessCourse(rel), school: src === 'school' ? guessSchool(rel) : '', commercial: src === 'academy' && COMMERCIAL.test(rel), on: true });
      });
      found.sort((a, b) => a.rel.localeCompare(b.rel, 'ko'));
      L.found[src] = found;
      toast(found.length ? `새 자료 ${found.length}개를 찾았습니다` : '새 자료가 없습니다. 모두 색인되어 있습니다');
      render();
    };
    $$('[data-fon]').forEach(c => c.onchange = () => { L.found[L.tab][+c.dataset.fon].on = c.checked; render(); });
    $$('[data-fco]').forEach(c => c.onchange = () => { L.found[L.tab][+c.dataset.fco].course = c.value; });
    $$('[data-fsc]').forEach(c => c.onchange = () => { L.found[L.tab][+c.dataset.fsc].school = c.value; });
    $$('[data-fcm]').forEach(c => c.onchange = () => { L.found[L.tab][+c.dataset.fcm].commercial = c.checked; });
    const lr = $('#libRun'); if (lr) lr.onclick = () => {
      const src = L.tab, sel = L.found[src].filter(f => f.on);
      if (sel.some(f => !f.course)) { toast('과정을 고르지 않은 파일이 있습니다'); return; }
      const jobs = sel.map(f => {
        const id = (src === 'academy' ? 'a' : 's') + hash(src + '|' + f.rel);
        const m = { id, src, name: f.file.name.replace(/\.[^.]+$/, ''), path: f.rel, size: f.file.size, ext: f.file.name.split('.').pop().toLowerCase(),
          course: f.course, unit: '', school: f.school || '', commercial: !!f.commercial, status: 'indexing', problems: [], addedAt: now() };
        D.materials[id] = m;
        return { m, files: [f.file] };
      });
      L.found[src] = L.found[src].filter(f => !f.on);
      enqueue(jobs);
    };
    const lc = $('#libClear'); if (lc) lc.onclick = () => { L.found[L.tab] = null; render(); };
    // 개별 추가
    const ax = $('#addX'); if (ax) ax.onclick = () => { L.adding = false; render(); };
    const af = $('#addFile'); if (af) {
      const take = fl => { L.form.files = [...fl].filter(f => okF(f.name)); if (!L.form.name && L.form.files[0]) L.form.name = L.form.files[0].name.replace(/\.[^.]+$/, ''); L.form.commercial = L.form.commercial || COMMERCIAL.test(L.form.name); const g = guessCourse(L.form.name); if (g) L.form.course = g; render(); };
      af.onchange = () => take(af.files);
      const dp = $('#addDrop');
      dp.ondragover = ev => { ev.preventDefault(); dp.classList.add('over'); };
      dp.ondragleave = () => dp.classList.remove('over');
      dp.ondrop = ev => { ev.preventDefault(); take(ev.dataTransfer.files); };
      $('#addName').oninput = ev => { L.form.name = ev.target.value; };
      $('#addCourse').onchange = ev => { L.form.course = ev.target.value; L.form.unit = ''; render(); };
      $('#addUnit').onchange = ev => { L.form.unit = ev.target.value; };
      $('#addSchool').onchange = ev => { L.form.school = ev.target.value; };
      $('#addCom').onchange = ev => { L.form.commercial = ev.target.checked; };
      $('#addGo').onclick = () => {
        const f = L.form; if (!f.name.trim()) { toast('자료 이름을 넣어 주세요'); return; }
        const id = 'c' + Date.now().toString(36);
        const m = { id, src: 'custom', name: f.name.trim(), path: '', size: f.files.reduce((s, x) => s + x.size, 0), ext: f.files[0].name.split('.').pop().toLowerCase(),
          course: f.course, unit: f.unit, school: f.school, commercial: !!f.commercial, status: 'indexing', problems: [], addedAt: now() };
        D.materials[id] = m;
        const files = f.files;
        L.form = { name: '', course: f.course, unit: '', school: '', commercial: false, files: [] };
        L.adding = false; L.sel = id;
        enqueue([{ m, files }]);
      };
    }
    // 검수
    const sel = L.sel && D.materials[L.sel];
    if (sel) bindReview(sel);
  }
  function bindReview(m) {
    const pagesOf = () => [...new Set((m.problems || []).map(p => p.pg || 1))].sort((a, b) => a - b);
    const pv = $('#pgPrev'); if (pv) pv.onclick = () => { const ps = pagesOf(); L.pg = ps[Math.max(0, ps.indexOf(L.pg) - 1)]; render(); };
    const po = $('#pgOk'); if (po) po.onclick = () => {
      const ps = pagesOf(); m.okPages = [...new Set((m.okPages || []).concat(L.pg))];
      (m.problems || []).forEach(p => { if ((p.pg || 1) === L.pg) p.ok = 1; });
      const i = ps.indexOf(L.pg);
      if (m.okPages.length >= ps.length) { m.status = 'done'; saveMat(m, true); toast('색인을 확인했습니다. 유사문항 찾기에 바로 쓰입니다'); }
      else saveMat(m, true);
      if (i < ps.length - 1) L.pg = ps[i + 1];
      render();
    };
    const ms = $('#mSave'); if (ms) ms.onclick = () => {
      m.name = $('#mName').value.trim() || m.name; m.course = $('#mCourse').value; m.school = $('#mSchool').value; m.commercial = $('#mCom').checked;
      saveMat(m); render();
    };
    const md = $('#mDel'); if (md) md.onclick = async () => {
      if (!confirm(`‘${m.name}’ 자료와 색인한 문항 ${(m.problems || []).length}개를 지울까요? MYBOX 원본 파일은 그대로입니다.`)) return;
      try { if (ctx) await ctx.deleteMaterial(m.id, (m.problems || []).map(p => p.ik).filter(Boolean)); delete D.materials[m.id]; H.simReset(); L.sel = null; toast('지웠습니다'); render(); }
      catch (e) { toast('지우지 못했습니다: ' + e.message); }
    };
    const ro = $('#mReopen'); if (ro) ro.onchange = async () => {
      const files = [...ro.files];
      if (!(m.problems || []).length) { m.status = 'indexing'; enqueue([{ m, files }]); return; }
      try {
        toast('쪽을 여는 중…');
        const pages = await window.SudoPages.load(files, { maxPages: MAXP, width: 1200 });
        L.pages = { id: m.id, pages };
        L.thumbs[m.id] = Object.fromEntries(pages.map((p, i) => [i + 1, window.SudoPages.thumb(p)]));
        render();
      } catch (e) { toast(e.message); }
    };
    $$('.prow').forEach(row => {
      const p = m.problems[+row.dataset.k];
      const mark = () => { p.ok = 1; p.conf = Math.max(p.conf || 0, 0.9); };
      $$('[data-pd]', row).forEach(b => b.onclick = () => { p.diff = DIFF[+b.dataset.pd]; mark(); saveMat(m, true); $$('[data-pd]', row).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      $('[data-skip]', row).onclick = () => { p.skip = !p.skip; saveMat(m, true); render(); };
      $('[data-pm]', row).onchange = ev => { const x = REG.midsOf(m.course).find(y => y.mid === ev.target.value); Object.assign(p, { mid: ev.target.value, big: x ? x.big : p.big, code: '', type: '' }); mark(); saveMat(m, true); render(); };
      $('[data-pt]', row).onchange = ev => {
        const v = ev.target.value; if (!v) return;
        const c = D.catalog[REG.catIdx()[v]]; Object.assign(p, { code: c[0], big: c[2], mid: `${c[3]}.${c[4]}`, type: `${c[5]}.${c[6]}` }); mark(); saveMat(m, true);
      };
      const zb = $('[data-zoom]', row); if (zb) zb.onclick = () => window.SudoPages.zoom($('img', zb).src, `${m.name} ${p.no}번`);
      const rb = $('[data-rebox]', row); if (rb) rb.onclick = async () => {
        const res = await window.SudoPages.pickBox(L.pages.pages, p.pg || 1, p.box); if (!res) return;
        p.pg = res.pg; p.box = res.box; mark();
        if (!m.commercial) {
          const img = window.SudoPages.crop(L.pages.pages[res.pg - 1], res.box);
          if (img) { p.ik = p.ik || `m_${m.id}_${+row.dataset.k}`; try { if (ctx) await ctx.saveImgs({ [p.ik]: img }); else (H.imgCache || {})[p.ik] = img; } catch (e) { toast('그림 저장 실패: ' + e.message); } }
        }
        saveMat(m, true); render();
      };
    });
  }

  // ---------- AI 색인 ----------
  function enqueue(jobs) {
    jobs.forEach(j => { L.jobs[j.m.id] = { st: 'wait', msg: '' }; L.queue.push(j); });
    render();
    if (!L.running) runQueue();
  }
  const paint = () => { if ((location.hash || '') === '#library') render(); };
  async function runQueue() {
    L.running = true;
    while (L.queue.length) {
      const { m, files } = L.queue.shift();
      const J = L.jobs[m.id] = { st: 'run', msg: '쪽 여는 중' }; paint();
      const settings = REG.aiSettings();
      try {
        const single = files.length === 1 && window.SudoPages.isPdf(files[0]);
        const total = single ? Math.min(MAXP, await window.SudoPages.count(files[0])) : files.length;
        let all = single ? null : await window.SudoPages.load(files, { maxPages: MAXP, width: 1200 });
        const probs = [], imgs = {}, warnings = [], usage = { in: 0, out: 0 }, thumbs = {};
        if (total > MAXP || (!single && files.length > MAXP)) warnings.push(`${MAXP}쪽까지만 읽었습니다`);
        for (let s = 1; s <= total; s += CHUNK) {
          const pages = single ? await window.SudoPages.load(files, { start: s, maxPages: CHUNK, width: 1200 }) : all.slice(s - 1, s - 1 + CHUNK);
          J.msg = `${Math.min(total, s + CHUNK - 1)}/${total}쪽`; paint();
          pages.forEach((p, i) => { thumbs[s + i] = window.SudoPages.thumb(p); });
          const { result, usage: u } = await window.SudoAI.indexMaterial({ settings, getToken: ctx.getToken, pages,
            meta: { name: m.name, course: m.course, school: m.school }, catalogLines: REG.catalogLines(m.course) });
          usage.in += u.in; usage.out += u.out;
          (result.warnings || []).forEach(w => warnings.push(`${s}~${s + pages.length - 1}쪽: ${w}`));
          (result.problems || []).forEach(it => {
            const pgL = Math.min(pages.length, Math.max(1, +it.pg || 1));
            const p = { no: String(it.no || ''), pg: s + pgL - 1, box: Array.isArray(it.box) && it.box.length === 4 ? it.box.map(Number) : null,
              diff: DIFF.includes(it.diff) ? it.diff : '', beh: it.beh || '', q: it.q || '', conf: typeof it.conf === 'number' ? Math.round(it.conf * 100) / 100 : 0.5, code: '', big: it.big || '', mid: it.mid || m.unit || '', type: it.type || '' };
            const ci = REG.catIdx(), c = it.code && ci[it.code] !== undefined ? D.catalog[ci[it.code]] : null;
            if (c && c[1] === m.course) Object.assign(p, { code: c[0], big: c[2], mid: `${c[3]}.${c[4]}`, type: `${c[5]}.${c[6]}` }); else p.conf = Math.min(p.conf, 0.69);
            const k = probs.length;
            if (!m.commercial && p.box) { const d = window.SudoPages.crop(pages[pgL - 1], p.box); if (d) { p.ik = `m_${m.id}_${k}`; imgs[p.ik] = d; } }
            probs.push(p);
          });
          if (ctx && Object.keys(imgs).length) { await ctx.saveImgs(imgs); Object.keys(imgs).forEach(k2 => delete imgs[k2]); }
        }
        all = null;
        Object.assign(m, { problems: probs, pages: total, status: 'review', warnings: warnings.slice(0, 8), model: settings.model, usage, indexedAt: now(), okPages: [] });
        delete m.error;
        L.thumbs[m.id] = thumbs;
        if (ctx) await ctx.saveMaterial(m.id, m);
        D.materials[m.id] = m; H.simReset();
        L.jobs[m.id] = { st: 'done' };
        toast(`‘${m.name}’ 문항 ${probs.length}개를 찾았습니다`);
      } catch (e) {
        m.status = 'fail'; m.error = String(e.message || e).slice(0, 120);
        L.jobs[m.id] = { st: 'fail', msg: m.error };
        try { if (ctx) await ctx.saveMaterial(m.id, m); } catch (_) {}
        toast(`‘${m.name}’ 색인 실패: ${m.error}`);
      }
      paint();
    }
    L.running = false; paint();
  }
  return { render, busy: () => L.running };
};
