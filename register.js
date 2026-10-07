// 수도 내신분석 — 4단계: 시험 등록 · AI 문항 분석 · 검수 · 일괄 분석
window.SudoRegister = function (H) {
  const { D, ctx, byId, esc, toast, $, $$, DIFF, BEH, ROOT_WIN, MAIN4 } = H;
  const BEHK = ['U', 'C', 'R', 'P'];
  const LEVELS = ['하', '중하', '중', '중상', '상'];
  const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
  const courseOf = m => `중등${m.grade}-${m.sem}`;
  const fmtSize = n => n > 1e6 ? (n / 1e6).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1e3)) + 'KB';
  const now = () => new Date().toISOString();
  const pad2 = n => String(n).padStart(2, '0');
  const AI_DEFAULT = { url: '', provider: 'claude', model: 'claude-sonnet-5-5' };
  const R = {
    pick: 'archive', school: MAIN4[0], onlyRaw: true, examId: null,
    meta: { school: '', year: new Date().getFullYear(), grade: 2, sem: 2, exam: '중간' },
    files: [], busy: null, draft: null, ai: Object.assign({}, AI_DEFAULT, D.ai || {}),
    batch: { map: null, list: [], running: false, stop: false, school: '4개 학교', year: '전체' }
  };
  D.drafts = D.drafts || {};

  // ---------- 단원·유형 목록 ----------
  const catIdx = () => { const m = {}; D.catalog.forEach((c, i) => { m[c[0]] = i; }); return m; };
  function midsOf(course, rows) {
    const seen = new Map();
    D.catalog.forEach(c => { if (c[1] === course) { const k = `${c[3]}.${c[4]}`; if (!seen.has(k)) seen.set(k, { big: c[2], mid: k }); } });
    (rows || []).forEach(r => { if (r.mid && !seen.has(r.mid)) seen.set(r.mid, { big: r.big, mid: r.mid, isNew: 1 }); });
    return [...seen.values()].sort((a, b) => a.mid.localeCompare(b.mid, 'ko', { numeric: true }));
  }
  function typesOf(course, mid) {
    return D.catalog.map((c, i) => [c, i]).filter(([c]) => c[1] === course && `${c[3]}.${c[4]}` === mid);
  }
  function catalogLines(course) {
    return D.catalog.filter(c => c[1] === course && c[6]).map(c => `${c[0]} | ${c[2]} | ${c[3]}.${c[4]} | ${c[5]}.${c[6]}`);
  }
  function exampleFor(meta) {
    const course = courseOf(meta);
    const cand = D.exams.filter(e => e.an && e.an.items.length && e.an.items[0][4] === course)
      .sort((a, b) => (b.s === meta.school) - (a.s === meta.school) || b.y - a.y);
    const e = cand[0]; if (!e) return '';
    return e.an.items.map(i => `${i[0]} | ${i[1]} | ${DIFF[i[2]]} | ${BEH[i[3]] || ''} | ${i[8] >= 0 ? D.catalog[i[8]][0] : ''}`).join('\n');
  }
  // 지난 출제 기록 (유형 코드 → [{s,e,no}])
  function pastOf(code, selfId) {
    const i = catIdx()[code]; if (i === undefined) return [];
    return (H.REC[i] || []).filter(r => r.e.id !== selfId);
  }

  // ---------- 임시본 ----------
  const local = {
    get() { try { return JSON.parse(localStorage.getItem('sudo.regdraft') || 'null'); } catch (_) { return null; } },
    set(d) { try { if (d) localStorage.setItem('sudo.regdraft', JSON.stringify(d)); else localStorage.removeItem('sudo.regdraft'); } catch (_) {} }
  };
  function idOf(m) { return `${m.school}-${m.year}-${m.grade}-${m.sem}-${m.exam}`; }
  function metaOf(e) { return { school: e.s, year: e.y, grade: e.g, sem: e.t, exam: e.x }; }
  function emptyRow(no) { return { no, pts: '', diff: 0, beh: '', essay: 0, big: '', mid: '', type: '', code: '', conf: 1, note: '', ok: 1 }; }
  function newDraft(meta, source, rows, extra) {
    const id = idOf(meta);
    return Object.assign({ id, isNew: !byId[id], meta: Object.assign({}, meta, { course: courseOf(meta) }), rows, level: '', cuts: {}, source, warnings: [], updatedAt: now() }, extra || {});
  }
  function rowsFromAI(result, course) {
    const ci = catIdx();
    return (result.items || []).map(it => {
      const r = emptyRow(it.no);
      r.pts = it.pts == null ? '' : +it.pts;
      r.diff = Math.max(0, DIFF.indexOf(it.diff));
      r.beh = BEHK[['이해', '계산', '추론', '문제해결'].indexOf(it.beh)] || '';
      r.essay = it.essay ? 1 : 0;
      r.note = it.note || '';
      r.conf = typeof it.conf === 'number' ? it.conf : 0.5;
      const c = it.code && ci[it.code] !== undefined ? D.catalog[ci[it.code]] : null;
      if (c && c[1] === course) { r.code = c[0]; r.big = c[2]; r.mid = `${c[3]}.${c[4]}`; r.type = `${c[5]}.${c[6]}`; }
      else { r.code = ''; r.big = it.big || ''; r.mid = it.mid || ''; r.type = (it.type || '').replace(/^\d+\.\s*/, ''); r.conf = Math.min(r.conf, 0.69); }
      if (r.pts === '') r.conf = Math.min(r.conf, 0.5);
      r.ok = r.conf >= 0.7 ? 1 : 0;
      return r;
    }).sort((a, b) => a.no - b.no);
  }
  function draftFromAnalysis(e) {
    const rows = e.an.items.map(i => {
      const r = emptyRow(i[0]);
      Object.assign(r, { pts: i[1], diff: i[2], beh: i[3], essay: i[9], big: i[5], mid: i[6], type: i[7], code: i[8] >= 0 ? D.catalog[i[8]][0] : '' });
      return r;
    });
    return newDraft(metaOf(e), { kind: 'edit', at: now() }, rows, { level: e.an.level || '', cuts: Object.assign({}, e.an.cuts || {}) });
  }

  // ---------- 화면: 고르기 ----------
  function render() {
    if (!R.draft) { const l = local.get(); if (l) { R.draft = l; toast('고치던 문항표를 이어서 엽니다'); } }
    if (R.draft) return renderReview();
    const ready = !!R.ai.url;
    const drafts = Object.values(D.drafts).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">새 시험을 넣고 문항표를 채웁니다</div><h1>시험 등록</h1></div></div>
      <ol class="steps"><li class="on">시험 고르기</li><li class="${R.files.length ? 'on' : ''}">시험지 파일</li><li>AI 읽기 · 직접 입력</li><li>검수 후 저장</li></ol>
      <div class="reg">
        <div class="regmain">
          <section class="card"><h2>① 어떤 시험인가요</h2>
            <div class="segx" role="tablist">
              <button type="button" role="tab" data-pick="archive" aria-selected="${R.pick === 'archive'}">보관함(MYBOX)에 있는 시험</button>
              <button type="button" role="tab" data-pick="new" aria-selected="${R.pick === 'new'}">새 시험 직접 입력</button>
            </div>
            ${R.pick === 'archive' ? pickArchive() : pickNew()}
          </section>
          <section class="card"><h2>② 시험지 파일 <small>PDF · JPG · PNG, 여러 개 가능</small></h2>
            <label class="drop" id="drop"><input type="file" id="regFile" accept="${ACCEPT}" multiple hidden>
              <b>여기에 끌어 놓거나 눌러서 고르기</b><span>정답·배점표 파일도 같이 넣으면 배점을 더 정확히 읽습니다. 한글(hwp) 파일은 PDF로 저장해서 넣어 주세요.</span></label>
            ${R.files.length ? `<div class="files">${R.files.map((f, i) => `<div class="file"><span class="ext">${esc(f.name.split('.').pop())}</span><span class="nm">${esc(f.name)}</span><span class="rl">${fmtSize(f.size)}</span><button type="button" class="copy" data-rm="${i}">빼기</button></div>`).join('')}</div>` : ''}
          </section>
          <section class="card"><h2>③ 문항표 채우기</h2>
            ${R.busy ? `<div class="busybox"><span class="spin" aria-hidden="true"></span><div><b>${esc(R.busy.label)}</b><span id="busyT">${esc(R.busy.sub || '')}</span></div><button type="button" class="btn ghost sm" id="cancelAI">그만두기</button></div>` : `
            <div class="fillrow">
              <button type="button" class="btn big" id="runAI" ${ready ? '' : 'disabled'}>AI로 문항표 채우기</button>
              <div class="manual"><label>문항 수 <input type="number" id="nItems" min="1" max="40" value="24"></label><button type="button" class="btn ghost" id="runManual">직접 입력</button></div>
            </div>
            <p class="dl">${ready ? `${esc(modelLabel())}로 읽습니다. 보통 1~2분 걸리고, 다 읽으면 검수 화면이 열립니다.` : '오른쪽 ‘AI 연결’을 먼저 마치면 AI로 읽을 수 있습니다. 그 전에는 직접 입력으로 문항표를 만들 수 있습니다.'}</p>`}
          </section>
        </div>
        <aside class="regside">
          ${drafts.length ? `<section class="card"><h2>검수 대기 <small>${drafts.length}건</small></h2><div class="dlist">${drafts.map(d => `<button type="button" class="drow" data-draft="${esc(d.id)}"><b>${esc(d.meta.school)} ${d.meta.year} ${d.meta.grade}-${d.meta.sem} ${esc(d.meta.exam)}</b><span>${d.rows.length}문항 · 확인 ${d.rows.filter(r => !r.ok).length}개${d.source && d.source.kind === 'ai' ? ' · AI' : ''}</span></button>`).join('')}</div></section>` : ''}
          ${aiCard()}
          ${H.mode() === 'pc' ? batchCard() : ''}
        </aside>
      </div>`;
    bindPick();
  }
  function modelLabel() {
    const m = (window.SudoAI.MODELS[R.ai.provider] || []).find(x => x[0] === R.ai.model);
    return m ? m[1].replace(/ \(.*\)$/, '') : R.ai.model;
  }
  function pickArchive() {
    const ex = D.exams.filter(e => e.s === R.school && (!R.onlyRaw || !e.an)).sort((a, b) => b.y - a.y || a.g - b.g || a.t - b.t || (a.x === '기말') - (b.x === '기말'));
    const sel = byId[R.examId];
    return `<div class="pickrow">
        <label class="sel"><span>학교</span><select id="regSchool">${H.schools.map(s => `<option ${s === R.school ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="chk"><input type="checkbox" id="onlyRaw" ${R.onlyRaw ? 'checked' : ''}> 분석 전 시험만</label>
      </div>
      <div class="exlist" role="listbox" aria-label="시험">${ex.map(e => `<button type="button" role="option" class="exopt" data-ex="${esc(e.id)}" aria-selected="${e.id === R.examId}">
        <b>${e.y} · ${e.g}학년 ${e.t}학기 ${esc(e.x)}</b><span>${e.an ? '분석 완료' : D.drafts[e.id] ? '검수 대기' : e.p ? (e.f.includes('pdf') ? 'PDF 있음' : e.f.join('·') + '만 있음') : '원본 없음'}</span></button>`).join('') || '<div class="empty">이 학교에 고를 시험이 없습니다.</div>'}</div>
      ${sel ? `<div class="selbox"><div class="dl"><b>${esc(sel.s)} ${sel.y} ${sel.g}학년 ${sel.t}학기 ${esc(sel.x)}</b> 원본 파일</div><div class="files">${sel.fl.map(f => {
        const ok = /\.(pdf|jpe?g|png)$/i.test(f[0]);
        return `<div class="file"><span class="ext">${esc(f[0].split('.').pop())}</span><span class="nm" title="${esc(f[0])}">${esc(f[0].split('/').pop())}</span><span class="rl">${esc(H.ROLE[f[1]] || f[1])}</span>${ok ? `<button type="button" class="copy" data-open="${esc(ROOT_WIN + f[0].replace(/\//g, '\\'))}">${H.mode() === 'pc' ? '열기' : '고르기'}</button>` : '<span class="rl">PDF로 저장 필요</span>'}</div>`;
      }).join('') || '<div class="empty">MYBOX에 원본이 없습니다. 파일을 직접 올려 주세요.</div>'}</div>
      ${H.mode() === 'pc' ? '<p class="dl">‘열기’를 누르면 파일 경로가 복사되고 파일 창이 열립니다. 아래 ‘파일 이름’ 칸에 <b>Ctrl+V</b> 하고 <b>Enter</b>를 누르세요.</p>' : ''}
      ${sel.an ? '<p class="callout">이미 분석된 시험입니다. 새로 읽으면 저장할 때 기존 문항표를 바꿉니다.</p>' : ''}</div>` : ''}`;
  }
  function pickNew() {
    const m = R.meta;
    return `<div class="newform">
      <label class="sel"><span>학교</span><input id="nmSchool" list="schoolList" value="${esc(m.school)}" placeholder="예: 목운중"><datalist id="schoolList">${H.schools.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label class="sel"><span>연도</span><input id="nmYear" type="number" min="2015" max="2040" value="${m.year}"></label>
      <label class="sel"><span>학년</span><select id="nmGrade">${[1, 2, 3].map(g => `<option ${g === +m.grade ? 'selected' : ''} value="${g}">${g}학년</option>`).join('')}</select></label>
      <label class="sel"><span>학기</span><select id="nmSem">${[1, 2].map(t => `<option ${t === +m.sem ? 'selected' : ''} value="${t}">${t}학기</option>`).join('')}</select></label>
      <label class="sel"><span>시험</span><select id="nmExam">${['중간', '기말'].map(x => `<option ${x === m.exam ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>${m.school && byId[idOf(m)] ? '<p class="dl">보관함에 이미 있는 시험입니다. 저장하면 그 시험에 문항표가 붙습니다.</p>' : ''}`;
  }
  function aiCard() {
    const P = window.SudoAI.MODELS;
    return `<section class="card aicard"><h2>AI 연결 ${R.ai.url ? '<span class="pill ok">설정됨</span>' : '<span class="pill warn">설정 전</span>'}</h2>
      <details ${R.ai.url ? '' : 'open'}><summary>${R.ai.url ? esc(modelLabel()) + ' · 바꾸기' : '처음 한 번 설정하기'}</summary>
        <label class="sel"><span>중계 주소 (Cloudflare Worker)</span><input id="aiUrl" type="url" placeholder="https://sudo-naesin-ai.○○○.workers.dev" value="${esc(R.ai.url)}"></label>
        <div class="segx sm" role="radiogroup">${[['claude', 'Claude'], ['openai', 'GPT']].map(p => `<button type="button" role="radio" data-prov="${p[0]}" aria-checked="${R.ai.provider === p[0]}">${p[1]}</button>`).join('')}</div>
        <label class="sel"><span>모델</span><select id="aiModel">${(P[R.ai.provider] || []).map(m => `<option value="${m[0]}" ${m[0] === R.ai.model ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}</select></label>
        <div class="row2"><button type="button" class="btn sm" id="aiSave">저장</button><button type="button" class="btn ghost sm" id="aiTest" ${R.ai.url ? '' : 'disabled'}>연결 확인</button></div>
        <p class="dl" id="aiMsg">API 키는 Worker에만 넣습니다. 이 화면에는 저장되지 않습니다. 설치 방법은 저장소의 worker/설치안내.md에 있습니다.</p>
      </details></section>`;
  }

  function bindPick() {
    $$('[data-pick]').forEach(b => b.onclick = () => { R.pick = b.dataset.pick; render(); });
    const sc = $('#regSchool'); if (sc) sc.onchange = () => { R.school = sc.value; R.examId = null; render(); };
    const or = $('#onlyRaw'); if (or) or.onchange = () => { R.onlyRaw = or.checked; render(); };
    $$('.exopt').forEach(b => b.onclick = () => { R.examId = b.dataset.ex; R.files = []; render(); });
    const fi = $('#regFile');
    $$('[data-open]').forEach(b => b.onclick = () => {
      if (H.mode() === 'pc' && navigator.clipboard) navigator.clipboard.writeText(b.dataset.open).then(() => toast('경로를 복사했습니다. 파일 창에서 Ctrl+V, Enter'), () => {});
      fi.click();
    });
    ['school', 'year', 'grade', 'sem', 'exam'].forEach(k => {
      const el = $('#nm' + k[0].toUpperCase() + k.slice(1));
      if (el) el.onchange = () => { R.meta[k] = k === 'school' || k === 'exam' ? el.value.trim() : +el.value; render(); };
    });
    fi.onchange = () => { addFiles([...fi.files]); };
    const dp = $('#drop');
    dp.ondragover = ev => { ev.preventDefault(); dp.classList.add('over'); };
    dp.ondragleave = () => dp.classList.remove('over');
    dp.ondrop = ev => { ev.preventDefault(); dp.classList.remove('over'); addFiles([...ev.dataTransfer.files]); };
    $$('[data-rm]').forEach(b => b.onclick = () => { R.files.splice(+b.dataset.rm, 1); render(); });
    const ra = $('#runAI'); if (ra) ra.onclick = runAI;
    const rm = $('#runManual'); if (rm) rm.onclick = () => {
      const m = currentMeta(); if (!m) return;
      const n = Math.max(1, Math.min(40, +$('#nItems').value || 24));
      openDraft(newDraft(m, { kind: 'manual', at: now() }, Array.from({ length: n }, (_, i) => emptyRow(i + 1))));
    };
    const ca = $('#cancelAI'); if (ca) ca.onclick = () => { if (R.busy && R.busy.ctrl) R.busy.ctrl.abort(); };
    $$('[data-draft]').forEach(b => b.onclick = () => openDraft(JSON.parse(JSON.stringify(D.drafts[b.dataset.draft]))));
    bindAI(); bindBatch();
  }
  function addFiles(list) {
    const bad = list.filter(f => !/\.(pdf|jpe?g|png)$/i.test(f.name));
    if (bad.length) toast(`${bad[0].name}: PDF·JPG·PNG만 넣을 수 있습니다`);
    R.files.push(...list.filter(f => /\.(pdf|jpe?g|png)$/i.test(f.name)));
    render();
  }
  function currentMeta() {
    if (R.pick === 'archive') {
      const e = byId[R.examId]; if (!e) { toast('먼저 시험을 골라 주세요'); return null; }
      return metaOf(e);
    }
    const m = R.meta;
    if (!m.school) { toast('학교 이름을 넣어 주세요'); return null; }
    if (!/중$/.test(m.school)) m.school += '중';
    return Object.assign({}, m);
  }
  function bindAI() {
    $$('[data-prov]').forEach(b => b.onclick = () => { R.ai.provider = b.dataset.prov; R.ai.model = window.SudoAI.MODELS[R.ai.provider][0][0]; R.ai.url = $('#aiUrl').value.trim(); render(); });
    const sv = $('#aiSave'); if (!sv) return;
    sv.onclick = async () => {
      const url = $('#aiUrl').value.trim();
      if (url && !/^https:\/\//.test(url)) { $('#aiMsg').textContent = '주소는 https:// 로 시작해야 합니다.'; return; }
      Object.assign(R.ai, { url, model: $('#aiModel').value });
      try { if (ctx) await ctx.saveAI({ url: R.ai.url, provider: R.ai.provider, model: R.ai.model, savedAt: now() }); D.ai = Object.assign({}, R.ai); toast('AI 설정을 저장했습니다'); render(); }
      catch (e) { $('#aiMsg').textContent = '저장하지 못했습니다: ' + e.message; }
    };
    $('#aiTest').onclick = async () => {
      const msg = $('#aiMsg'); msg.textContent = '확인하는 중…';
      try {
        const s = await window.SudoAI.status(Object.assign({}, R.ai, { url: $('#aiUrl').value.trim() || R.ai.url }), ctx.getToken);
        msg.textContent = `연결됐습니다. Claude 키 ${s.claude ? '있음' : '없음'} · GPT 키 ${s.openai ? '있음' : '없음'}`
          + ((R.ai.provider === 'claude' && !s.claude) || (R.ai.provider === 'openai' && !s.openai) ? ' — 고른 AI의 키가 Worker에 없습니다.' : '');
      } catch (e) { msg.textContent = '연결하지 못했습니다: ' + e.message; }
    };
  }

  async function runAI() {
    const m = currentMeta(); if (!m) return;
    if (!R.files.length) { toast('시험지 파일을 먼저 넣어 주세요'); return; }
    const ctrl = new AbortController(), t0 = Date.now();
    R.busy = { label: `${modelLabel()}가 시험지를 읽고 있습니다`, sub: '0초', ctrl };
    render();
    const tick = setInterval(() => { const el = $('#busyT'); if (el) el.textContent = `${Math.round((Date.now() - t0) / 1000)}초 · 창을 닫지 말아 주세요`; }, 1000);
    try {
      const course = courseOf(m);
      const { result, usage } = await window.SudoAI.analyze({ settings: R.ai, getToken: ctx.getToken, files: R.files, meta: Object.assign({ course }, m), catalogLines: catalogLines(course), example: exampleFor(m), signal: ctrl.signal });
      const d = newDraft(m, { kind: 'ai', provider: R.ai.provider, model: R.ai.model, at: now(), files: R.files.map(f => f.name), usage, secs: Math.round((Date.now() - t0) / 1000) }, rowsFromAI(result, course));
      d.warnings = result.warnings || [];
      if (result.total_pts) d.warnings.unshift(`시험지에 적힌 배점 합계: ${result.total_pts}점`);
      R.files = [];
      try { await saveDraftRemote(d); } catch (_) {}
      openDraft(d);
    } catch (e) {
      toast(e.name === 'AbortError' ? '그만두었습니다' : '읽지 못했습니다: ' + e.message);
      R.busy = null; render();
    } finally { clearInterval(tick); R.busy = null; }
  }
  async function saveDraftRemote(d) {
    d.updatedAt = now();
    D.drafts[d.id] = JSON.parse(JSON.stringify(d));
    if (ctx) await ctx.saveDraft(d.id, D.drafts[d.id]);
  }
  function openDraft(d) { R.draft = d; local.set(d); H.go('register'); render(); window.scrollTo(0, 0); }
  function closeDraft() { R.draft = null; local.set(null); render(); }

  // ---------- 화면: 검수 ----------
  function sumOf(rows) { return Math.round(rows.reduce((s, r) => s + (+r.pts || 0), 0) * 100) / 100; }
  function suggestLevel(rows) {
    const top = rows.filter(r => r.diff >= 3).reduce((s, r) => s + (+r.pts || 0), 0);
    return top <= 20 ? '중하' : top <= 30 ? '중' : top <= 40 ? '중상' : '상';
  }
  function renderReview() {
    const d = R.draft, m = d.meta, rows = d.rows, course = m.course;
    const total = sumOf(rows), unchecked = rows.filter(r => !r.ok).length;
    const cnt = [0, 0, 0, 0, 0]; rows.forEach(r => cnt[r.diff]++);
    const mids = midsOf(course, rows);
    const src = d.source || {};
    const mdl = (window.SudoAI.MODELS[src.provider] || []).find(x => x[0] === src.model);
    const srcText = src.kind === 'ai' ? `${mdl ? mdl[1].replace(/ \(.*\)$/, '') : src.model}가 읽음${src.secs ? ` · ${src.secs}초` : ''}` : src.kind === 'edit' ? '저장된 문항표 고치기' : '직접 입력';
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">검수 · ${esc(srcText)}</div><h1>${esc(m.school)} ${m.year} ${m.grade}학년 ${m.sem}학기 ${esc(m.exam)}</h1></div>
        <div class="headact"><button type="button" class="btn ghost" id="rvBack">목록으로</button><button type="button" class="btn ghost" id="rvTemp">임시 저장</button><button type="button" class="btn" id="rvSave">검수 끝 · 저장</button></div></div>
      <ol class="steps"><li class="on">시험 고르기</li><li class="on">시험지 파일</li><li class="on">AI 읽기 · 직접 입력</li><li class="on">검수 후 저장</li></ol>
      <div class="rvsum">
        <div class="kpi"><span>문항</span><b>${rows.length}개</b><small>서답형 ${rows.filter(r => r.essay).length}</small></div>
        <div class="kpi ${Math.abs(total - 100) > 0.01 ? 'bad' : ''}"><span>배점 합계</span><b>${total}점</b><small>${Math.abs(total - 100) > 0.01 ? '100점이 아닙니다' : '맞음'}</small></div>
        <div class="kpi"><span>난이도</span><b class="sm">${H.diffBarCounts(cnt)}</b><small>기본 ${cnt[1]} · 응용 ${cnt[2]} · 실력 ${cnt[3]} · 심화 ${cnt[4]}${cnt[0] ? ` · 미정 ${cnt[0]}` : ''}</small></div>
        <div class="kpi ${unchecked ? 'gold' : ''}"><span>확인할 문항</span><b>${unchecked}개</b><small>${unchecked ? '노란 줄을 보고 ✓' : '모두 확인'}</small></div>
        <label class="kpi sel"><span>시험 난이도</span><select id="rvLevel"><option value="">고르기</option>${LEVELS.map(l => `<option ${l === d.level ? 'selected' : ''}>${l}</option>`).join('')}</select><small>제안: ${suggestLevel(rows)} (실력·심화 배점 기준)</small></label>
      </div>
      ${d.warnings && d.warnings.length ? `<div class="callout">${d.warnings.map(w => esc(w)).join('<br>')}</div>` : ''}
      <details class="card cuts"><summary>등급컷 넣기 <small>선택 · 학교 알리미 등에서 확인한 값</small></summary><div class="cutrow">${['1등급', '2등급', '3등급', '4등급', '5등급'].map(k => `<label class="sel"><span>${k}</span><input data-cut="${k}" value="${esc((d.cuts || {})[k] || '')}" placeholder="예: 89점"></label>`).join('')}</div></details>
      <div class="tablewrap rvwrap"><table class="rvtbl">
        <thead><tr><th>번호</th><th>배점</th><th>난이도</th><th>행동</th><th>중단원</th><th>유형 · 지난 출제</th><th>서답</th><th>확인</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => rowHtml(r, i, course, mids, d.id)).join('')}</tbody></table></div>
      <div class="rvfoot"><button type="button" class="btn ghost sm" id="rvAdd">문항 추가</button><span class="dl">새 유형은 저장할 때 단원·유형 목록에 함께 들어갑니다.</span></div>`;
    bindReview();
  }
  function rowHtml(r, i, course, mids, selfId) {
    const types = r.mid ? typesOf(course, r.mid) : [];
    const known = r.code && types.some(([c]) => c[0] === r.code);
    const past = r.code ? pastOf(r.code, selfId) : [];
    const midOpts = mids.map(x => `<option value="${esc(x.mid)}" ${x.mid === r.mid ? 'selected' : ''}>${esc(x.mid)}${x.isNew ? ' (새)' : ''}</option>`).join('');
    const typeSel = `<select data-k="code" aria-label="${r.no}번 유형"><option value="">${r.mid ? '고르기' : '중단원 먼저'}</option>${types.map(([c]) => `<option value="${esc(c[0])}" ${c[0] === r.code ? 'selected' : ''}>${esc(c[5])}.${esc(c[6] || '(이름 없음)')}</option>`).join('')}<option value="__new" ${!known && (r.type || r.mid) && !r.code ? 'selected' : ''}>＋ 새 유형</option></select>`;
    const newIn = !known && !r.code && (r.type || r.mid) ? `<input data-k="type" value="${esc(String(r.type).replace(/^\d+\.\s*/, ''))}" placeholder="새 유형 이름">` : '';
    return `<tr data-i="${i}" class="${r.ok ? '' : 'need'}">
      <td><input data-k="no" type="number" min="1" value="${r.no}" class="w3"></td>
      <td><input data-k="pts" type="number" step="0.1" min="0" value="${r.pts}" class="w4 ${r.pts === '' ? 'miss' : ''}"></td>
      <td><div class="dseg">${[1, 2, 3, 4].map(k => `<button type="button" data-diff="${k}" class="d${k}" aria-pressed="${r.diff === k}" title="${DIFF[k]}">${DIFF[k]}</button>`).join('')}</div></td>
      <td><select data-k="beh" aria-label="${r.no}번 행동영역"><option value=""></option>${BEHK.map(k => `<option value="${k}" ${r.beh === k ? 'selected' : ''}>${BEH[k]}</option>`).join('')}</select></td>
      <td><select data-k="mid" aria-label="${r.no}번 중단원"><option value="">고르기</option>${midOpts}<option value="__new">＋ 새 중단원</option></select></td>
      <td><div class="tcell">${typeSel}${newIn}${past.length ? `<small class="past" title="${esc(past.map(p => `${p.s} ${p.e.y} ${p.e.g}-${p.e.t} ${p.e.x} ${p.no}번`).join('\n'))}">지난 출제 ${past.length}번 · ${esc(past.slice(0, 2).map(p => `${H.short(p.s)} ${p.e.g}-${p.e.t}${p.e.x[0]} ${p.no}번`).join(', '))}${past.length > 2 ? ' 외' : ''}</small>` : ''}${r.note ? `<small class="note">AI: ${esc(r.note)}</small>` : ''}</div></td>
      <td><input data-k="essay" type="checkbox" ${r.essay ? 'checked' : ''} aria-label="${r.no}번 서답형"></td>
      <td><button type="button" class="okbtn" data-ok aria-pressed="${!!r.ok}" title="확인">${r.ok ? '✓' : '확인'}</button></td>
      <td><button type="button" class="xbtn" data-del title="문항 빼기" aria-label="${r.no}번 빼기">×</button></td></tr>`;
  }
  function touch(rerender) { R.draft.updatedAt = now(); local.set(R.draft); if (rerender) renderReview(); }
  function bindReview() {
    const d = R.draft;
    $('#rvBack').onclick = () => { if (confirmLeave()) closeDraft(); };
    $('#rvTemp').onclick = async ev => { ev.currentTarget.disabled = true; try { await saveDraftRemote(d); toast('임시 저장했습니다. 검수 대기에서 이어서 볼 수 있습니다'); } catch (e) { toast('저장하지 못했습니다: ' + e.message); } ev.currentTarget.disabled = false; };
    $('#rvSave').onclick = ev => saveFinal(ev.currentTarget);
    $('#rvLevel').onchange = ev => { d.level = ev.target.value; touch(); };
    $$('[data-cut]').forEach(inp => inp.onchange = () => { d.cuts = d.cuts || {}; if (inp.value.trim()) d.cuts[inp.dataset.cut] = inp.value.trim(); else delete d.cuts[inp.dataset.cut]; touch(); });
    $('#rvAdd').onclick = () => { d.rows.push(emptyRow((d.rows.reduce((m, r) => Math.max(m, +r.no || 0), 0)) + 1)); touch(true); };
    $$('.rvtbl tbody tr').forEach(tr => {
      const r = d.rows[+tr.dataset.i];
      const mark = () => { r.ok = 1; tr.classList.remove('need'); const b = $('[data-ok]', tr); b.setAttribute('aria-pressed', 'true'); b.textContent = '✓'; };
      $$('[data-diff]', tr).forEach(b => b.onclick = () => { r.diff = +b.dataset.diff; $$('[data-diff]', tr).forEach(x => x.setAttribute('aria-pressed', String(x === b))); mark(); touch(); refreshSum(); });
      $$('[data-k]', tr).forEach(el => el.onchange = () => {
        const k = el.dataset.k;
        if (k === 'no') r.no = +el.value;
        else if (k === 'pts') { r.pts = el.value === '' ? '' : +el.value; el.classList.toggle('miss', el.value === ''); }
        else if (k === 'beh') r.beh = el.value;
        else if (k === 'essay') r.essay = el.checked ? 1 : 0;
        else if (k === 'type') r.type = el.value.trim();
        else if (k === 'mid') {
          if (el.value === '__new') {
            const name = prompt('새 중단원 이름 (예: 03.일차부등식)'); if (!name) { el.value = r.mid; return; }
            const big = prompt('대단원 이름 (예: Ⅱ.문자와 식)', r.big || '') || '';
            Object.assign(r, { mid: name.trim(), big: big.trim(), code: '', type: '' });
          } else {
            const x = midsOf(d.meta.course, d.rows).find(y => y.mid === el.value);
            Object.assign(r, { mid: el.value, big: x ? x.big : r.big, code: '', type: '' });
          }
          mark(); touch(true); return;
        } else if (k === 'code') {
          if (el.value === '__new') { r.code = ''; r.type = r.type && !/^\d+\./.test(r.type) ? r.type : ''; }
          else if (el.value) { const c = D.catalog[catIdx()[el.value]]; Object.assign(r, { code: c[0], big: c[2], mid: `${c[3]}.${c[4]}`, type: `${c[5]}.${c[6]}` }); }
          else { r.code = ''; }
          mark(); touch(true); return;
        }
        mark(); touch(); refreshSum();
      });
      $('[data-ok]', tr).onclick = ev => { r.ok = r.ok ? 0 : 1; tr.classList.toggle('need', !r.ok); ev.currentTarget.setAttribute('aria-pressed', String(!!r.ok)); ev.currentTarget.textContent = r.ok ? '✓' : '확인'; touch(); refreshSum(); };
      $('[data-del]', tr).onclick = () => { d.rows.splice(+tr.dataset.i, 1); touch(true); };
    });
  }
  // 표를 다시 그리지 않고 위쪽 숫자만 고침 (입력 중 커서 유지)
  function refreshSum() {
    const rows = R.draft.rows, total = sumOf(rows), un = rows.filter(r => !r.ok).length;
    const k = $$('.rvsum .kpi');
    const cnt = [0, 0, 0, 0, 0]; rows.forEach(r => cnt[r.diff]++);
    k[1].classList.toggle('bad', Math.abs(total - 100) > 0.01); k[1].querySelector('b').textContent = total + '점'; k[1].querySelector('small').textContent = Math.abs(total - 100) > 0.01 ? '100점이 아닙니다' : '맞음';
    k[2].querySelector('b').innerHTML = H.diffBarCounts(cnt); k[2].querySelector('small').textContent = `기본 ${cnt[1]} · 응용 ${cnt[2]} · 실력 ${cnt[3]} · 심화 ${cnt[4]}${cnt[0] ? ` · 미정 ${cnt[0]}` : ''}`;
    k[3].classList.toggle('gold', !!un); k[3].querySelector('b').textContent = un + '개'; k[3].querySelector('small').textContent = un ? '노란 줄을 보고 ✓' : '모두 확인';
    k[0].querySelector('small').textContent = '서답형 ' + rows.filter(r => r.essay).length;
  }
  function confirmLeave() { return confirm('목록으로 갈까요? 고친 내용은 ‘임시 저장’을 눌러야 다른 기기에서도 이어서 볼 수 있습니다.'); }

  // 저장: 새 유형 코드 만들기 → Firestore → 화면 데이터 갱신
  async function saveFinal(btn) {
    const d = R.draft, m = d.meta, course = m.course, rows = d.rows.slice().sort((a, b) => a.no - b.no);
    const probs = [];
    if (!rows.length) probs.push('문항이 없습니다');
    const nos = rows.map(r => r.no); if (new Set(nos).size !== nos.length) probs.push('번호가 겹칩니다');
    if (rows.some(r => r.pts === '' || !(+r.pts > 0))) probs.push('배점이 빈 문항이 있습니다');
    if (rows.some(r => !r.diff)) probs.push('난이도가 빈 문항이 있습니다');
    if (rows.some(r => !r.beh)) probs.push('행동영역이 빈 문항이 있습니다');
    if (rows.some(r => !r.mid)) probs.push('중단원이 빈 문항이 있습니다');
    if (probs.length) { toast(probs[0]); return; }
    const soft = [];
    const total = sumOf(rows); if (Math.abs(total - 100) > 0.01) soft.push(`배점 합계가 ${total}점입니다`);
    const un = rows.filter(r => !r.ok).length; if (un) soft.push(`확인하지 않은 문항이 ${un}개 있습니다`);
    if (!d.level) soft.push('시험 난이도를 고르지 않았습니다');
    if (soft.length && !confirm(soft.join('\n') + '\n\n그래도 저장할까요?')) return;

    // 새 유형 만들기
    const newTypes = [], ci = catIdx();
    const roman = big => (String(big).split('.')[0] || '').trim() || '?';
    for (const r of rows) {
      if (r.code && ci[r.code] !== undefined) continue;
      let mm = String(r.mid).match(/^(\d+)\.\s*(.+)$/), midNo, midName;
      if (mm) { midNo = pad2(+mm[1]); midName = mm[2].trim(); }
      else {
        midName = String(r.mid).trim();
        const ex = D.catalog.concat(newTypes.map(t => [t.code, t.course, t.big, t.midNo, t.mid])).find(c => c[1] === course && c[4] === midName);
        midNo = ex ? ex[3] : pad2(1 + Math.max(0, ...D.catalog.concat(newTypes.map(t => [0, t.course, 0, t.midNo])).filter(c => c[1] === course).map(c => +c[3] || 0)));
      }
      const name = String(r.type || '').replace(/^\d+\.\s*/, '').trim() || '(이름 없음)';
      const all = D.catalog.map(c => ({ code: c[0], course: c[1], midNo: c[3], typeNo: c[5], name: c[6] })).concat(newTypes);
      const same = all.find(t => t.course === course && t.midNo === midNo && t.name === name);
      if (same) { r.code = same.code; r.mid = `${midNo}.${midName}`; r.type = `${same.typeNo}.${name}`; continue; }
      const typeNo = pad2(1 + Math.max(0, ...all.filter(t => t.course === course && t.midNo === midNo).map(t => +t.typeNo || 0)));
      let code = `${m.grade}-${m.sem}·${roman(r.big)}·${midNo}·${typeNo}`;
      while (all.some(t => t.code === code)) code += '+';
      const t = { code, course, big: r.big || '', midNo, mid: midName, typeNo, name, addedAt: now(), from: d.id };
      newTypes.push(t);
      Object.assign(r, { code, mid: `${midNo}.${midName}`, type: `${typeNo}.${name}` });
    }
    const analysis = {
      level: d.level || null, cuts: d.cuts || {}, essay: rows.filter(r => r.essay).length,
      items: rows.map(r => ({ no: +r.no, pts: +r.pts, diff: DIFF[r.diff], beh: BEH[r.beh], course, big: r.big || '', mid: r.mid, type: r.type || '', code: r.code || '', essay: !!r.essay })),
      source: Object.assign({}, d.source || {}, { checkedAt: now() }), savedAt: now()
    };
    const isNew = !byId[d.id];
    const exam = isNew ? { school: m.school, main: MAIN4.includes(m.school), year: +m.year, grade: +m.grade, sem: +m.sem, exam: m.exam,
      hasPaper: true, hasAnswer: false, hasPoints: false, hasRubric: false, formats: ['pdf'], files: [], primary: '', notes: ['시험 등록에서 추가 (원본은 MYBOX에 넣어 주세요)'] } : null;
    btn.disabled = true; btn.textContent = '저장하는 중…';
    try {
      if (ctx) await ctx.saveAnalysis({ id: d.id, exam, analysis, newTypes });
      delete D.drafts[d.id];
      H.applySaved({ id: d.id, exam, analysis, newTypes });
      R.draft = null; local.set(null); R.examId = null;
      toast('저장했습니다. 보관함과 분석지에 바로 나옵니다');
      H.openExam(d.id);
    } catch (e) { toast('저장하지 못했습니다: ' + e.message); btn.disabled = false; btn.textContent = '검수 끝 · 저장'; }
  }

  // ---------- MYBOX 폴더 일괄 분석 (PC) ----------
  function batchCard() {
    const B = R.batch;
    const cand = B.map ? candidates() : [];
    return `<section class="card"><h2>MYBOX 폴더 한꺼번에</h2>
      ${!B.map ? `<p class="dl">‘B. 학교별 기출문제’ 폴더를 통째로 고르면, 분석 전 시험의 PDF를 차례로 AI가 읽어 <b>검수 대기</b>에 넣습니다. 파일은 이 컴퓨터에서 바로 읽고, 폴더에는 아무것도 쓰지 않습니다.</p>
        <label class="btn ghost" for="batchDir">폴더 고르기</label><input type="file" id="batchDir" webkitdirectory multiple hidden>`
      : `<div class="pickrow"><label class="sel"><span>학교</span><select id="bSchool">${['4개 학교', '전체', ...H.schools].map(s => `<option ${s === B.school ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label class="sel"><span>연도</span><select id="bYear">${['전체', ...H.years].map(y => `<option ${String(y) === String(B.year) ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>
        <p class="dl">읽을 수 있는 시험 <b>${cand.length}건</b>${R.ai.url ? '' : ' · 먼저 AI 연결을 마쳐 주세요'}. 한 번에 2건씩 읽습니다.</p>
        ${B.running ? '<button type="button" class="btn ghost" id="bStop">멈추기</button>' : `<button type="button" class="btn" id="bStart" ${cand.length && R.ai.url ? '' : 'disabled'}>${cand.length}건 읽기 시작</button>`}`}
      ${B.list.length ? `<div class="blist">${B.list.map(j => `<div class="bjob ${j.st}"><span>${esc(H.short(j.e.s))} ${j.e.y} ${j.e.g}-${j.e.t} ${esc(j.e.x)}</span><b>${esc(j.msg)}</b></div>`).join('')}</div>` : ''}
    </section>`;
  }
  function filesFor(e) {
    const M = R.batch.map;
    const take = p => M.get(p);
    const ok = p => /\.(pdf|jpe?g|png)$/i.test(p);
    const main = ok(e.pr) && take(e.pr) ? e.pr : (e.fl.find(f => (f[1] === 'P' || f[1] === 'PA') && ok(f[0]) && take(f[0])) || [])[0];
    if (!main) return null;
    const extra = e.fl.filter(f => f[1] === 'S' && /\.pdf$/i.test(f[0]) && take(f[0]) && f[0] !== main).map(f => f[0]);
    return [main, ...extra].map(take);
  }
  function candidates() {
    const B = R.batch;
    return D.exams.filter(e => !e.an && !D.drafts[e.id]
      && (B.school === '전체' || (B.school === '4개 학교' ? MAIN4.includes(e.s) : e.s === B.school))
      && (B.year === '전체' || String(e.y) === String(B.year)) && filesFor(e))
      .sort((a, b) => b.y - a.y || a.s.localeCompare(b.s, 'ko') || a.g - b.g || a.t - b.t);
  }
  function bindBatch() {
    const B = R.batch;
    const dir = $('#batchDir');
    if (dir) dir.onchange = () => {
      const keys = new Set(D.exams.flatMap(e => e.fl.map(f => f[0])));
      const map = new Map();
      [...dir.files].forEach(f => {
        const segs = (f.webkitRelativePath || f.name).split('/');
        for (let k = 0; k < segs.length; k++) { const p = segs.slice(k).join('/'); if (keys.has(p)) { map.set(p, f); break; } }
      });
      if (!map.size) { toast('보관함 시험과 맞는 파일을 찾지 못했습니다. ‘B. 학교별 기출문제’ 폴더를 골라 주세요'); return; }
      B.map = map; toast(`파일 ${map.size}개를 찾았습니다`); render();
    };
    const bs = $('#bSchool'); if (bs) bs.onchange = () => { B.school = bs.value; render(); };
    const by = $('#bYear'); if (by) by.onchange = () => { B.year = by.value; render(); };
    const st = $('#bStart'); if (st) st.onclick = startBatch;
    const sp = $('#bStop'); if (sp) sp.onclick = () => { B.stop = true; sp.disabled = true; sp.textContent = '지금 읽는 것까지만 하고 멈춥니다'; };
  }
  async function startBatch() {
    const B = R.batch;
    const list = candidates().map(e => ({ e, st: 'wait', msg: '대기' }));
    B.list = list; B.running = true; B.stop = false; render();
    const paint = () => { if ((location.hash || '').startsWith('#register') && !R.draft) render(); };
    let next = 0;
    const worker = async () => {
      while (!B.stop && next < list.length) {
        const j = list[next++], t0 = Date.now();
        j.st = 'run'; j.msg = '읽는 중'; paint();
        try {
          const m = metaOf(j.e), course = courseOf(m);
          const { result, usage } = await window.SudoAI.analyze({ settings: R.ai, getToken: ctx.getToken, files: filesFor(j.e), meta: Object.assign({ course }, m), catalogLines: catalogLines(course), example: exampleFor(m) });
          const d = newDraft(m, { kind: 'ai', provider: R.ai.provider, model: R.ai.model, at: now(), files: filesFor(j.e).map(f => f.name), usage, secs: Math.round((Date.now() - t0) / 1000), batch: true }, rowsFromAI(result, course));
          d.warnings = result.warnings || [];
          if (result.total_pts) d.warnings.unshift(`시험지에 적힌 배점 합계: ${result.total_pts}점`);
          await saveDraftRemote(d);
          j.st = 'done'; j.msg = `${d.rows.length}문항 · 확인 ${d.rows.filter(r => !r.ok).length}`;
        } catch (e) { j.st = 'fail'; j.msg = '실패: ' + e.message.slice(0, 40); }
        paint();
      }
    };
    await Promise.all([worker(), worker()]);
    B.running = false;
    const done = list.filter(j => j.st === 'done').length;
    toast(`${done}건을 읽어 검수 대기에 넣었습니다`);
    if (B.stop) list.filter(j => j.st === 'wait').forEach(j => { j.msg = '멈춤'; });
    paint();
  }

  return {
    render,
    pickExam(id) { const e = byId[id]; if (!e) return; R.draft = null; local.set(null); R.pick = 'archive'; R.school = e.s; R.onlyRaw = !e.an; R.examId = id; R.files = []; H.go('register'); render(); },
    editExam(id) { const e = byId[id]; if (e && e.an) openDraft(draftFromAnalysis(e)); },
    busy: () => !!(R.busy || R.batch.running)
  };
};
