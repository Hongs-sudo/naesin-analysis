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
    files: [], busy: null, draft: null, withAns: (() => { try { return localStorage.getItem('sudo.withAns') === '1'; } catch (_) { return false; } })(), ai: Object.assign({}, AI_DEFAULT, D.ai || {}),
    tab: 'one', pages: null,
    pre: { map: null, nFiles: 0, years: [2026, 2025], groups: ['4개교', '기타 학교'], model: '', conc: 2, withAns: true, list: [], running: false, stop: false, usage: { in: 0, out: 0, n: 0 } }
  };
  const BEHN = { 이해: 'U', 계산: 'C', 추론: 'R', 문제해결: 'P' };
  const okFile = p => /\.(pdf|jpe?g|png)$/i.test(p || '');
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
  function emptyRow(no) { return { no, pts: '', diff: 0, beh: '', essay: 0, big: '', mid: '', type: '', code: '', conf: 1, note: '', ok: 1, ans: '', sol: '', q: '', pg: 0, box: null, ik: '' }; }
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
      r.ans = it.ans || ''; r.sol = it.sol || '';
      r.q = it.q || ''; r.pg = +it.pg || 0; r.box = Array.isArray(it.box) && it.box.length === 4 ? it.box.map(Number) : null;
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
    const ai = e.an.status === 'ai';
    const rows = e.an.items.map(i => {
      const r = emptyRow(i[0]);
      Object.assign(r, { pts: i[1] || (ai ? '' : i[1]), diff: i[2], beh: i[3], essay: i[9], big: i[5], mid: i[6], type: i[7], code: i[8] >= 0 ? D.catalog[i[8]][0] : '', ans: i[10] || '', sol: i[11] || '',
        q: i[12] || '', ik: i[13] || '', conf: i[14], pg: i[15] || 0, box: i[16] || null, boxSrc: i[17] || '', be: i[18] || 0 });
      if (ai) r.ok = r.conf >= 0.7 && r.pts !== '' ? 1 : 0;
      return r;
    });
    const src = ai ? Object.assign({}, e.an.source || {}, { kind: 'ai', review: true }) : { kind: 'edit', at: now() };
    return newDraft(metaOf(e), src, rows, { level: e.an.level || '', cuts: Object.assign({}, e.an.cuts || {}), warnings: ai ? ((e.an.source || {}).warnings || []) : [] });
  }
  // 저장된 분석(배열) → 저장 모양
  function docFromAn(an) {
    return { level: an.level || null, cuts: an.cuts || {}, essay: an.essay || 0, source: an.source || null, status: an.status || 'checked',
      items: an.items.map(i => ({ no: i[0], pts: i[1], diff: DIFF[i[2]] || '', beh: BEH[i[3]] || '', course: i[4], big: i[5], mid: i[6], type: i[7],
        code: i[8] >= 0 ? D.catalog[i[8]][0] : '', essay: !!i[9], ans: i[10] || '', sol: i[11] || '', q: i[12] || '', ik: i[13] || '', conf: i[14], pg: i[15] || 0, box: i[16] || null, bs: i[17] || '', be: i[18] || 0 })) };
  }
  // 문항 영역 잘라 그림 만들기 → {key: dataURL}
  function cropRows(rows, pages, id) {
    const imgs = {};
    rows.forEach(r => {
      const pg = pages[(r.pg || 0) - 1]; if (!pg || !r.box) return;
      const d = window.SudoPages.crop(pg, r.box); if (!d) return;
      r.ik = `e_${id}_${r.no}`; imgs[r.ik] = d;
    });
    return imgs;
  }

  // ---------- 화면: 고르기 ----------
  function render() {
    if (!R.draft) { const l = local.get(); if (l) { R.draft = l; toast('고치던 문항표를 이어서 엽니다'); } }
    if (R.draft) return renderReview();
    if (R.tab === 'pre' && H.mode() !== 'phone') return renderPre();
    const ready = !!R.ai.url;
    const curId = R.pick === 'archive' ? R.examId : (R.meta.school ? idOf(Object.assign({}, R.meta, { school: /중$/.test(R.meta.school) ? R.meta.school : R.meta.school + '중' })) : null);
    if (curId && isOwner()) loadFails(curId);
    const drafts = Object.values(D.drafts).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">새 시험을 넣고 문항표를 채웁니다</div><h1>시험 등록</h1></div>${tabsHtml()}</div>
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
            ${R.busy ? `<div class="busybox"><span class="spin" aria-hidden="true"></span><div><b>${esc(R.busy.label)}</b>${stepsHtml(R.busy.stage)}<span id="busyT">${esc(R.busy.sub || '')}</span></div><button type="button" class="btn ghost sm" id="cancelAI">그만두기</button></div>` : `${failBox(curId)}
            <div class="fillrow">
              <label class="chk ansopt"><input type="checkbox" id="withAns" ${R.withAns ? 'checked' : ''}> 정답도 AI가 풀기 <small>답지가 없을 때 · 시간과 비용이 조금 더 듭니다</small></label>
              <button type="button" class="btn big" id="runAI" ${ready ? '' : 'disabled'}>AI로 문항표 채우기</button>
              <div class="manual"><label>문항 수 <input type="number" id="nItems" min="1" max="40" value="24"></label><button type="button" class="btn ghost" id="runManual">직접 입력</button></div>
            </div>
            <p class="dl">${ready ? `${esc(modelLabel())}로 읽습니다. 보통 1~2분 걸리고, 다 읽으면 검수 화면이 열립니다.` : '오른쪽 ‘AI 연결’을 먼저 마치면 AI로 읽을 수 있습니다. 그 전에는 직접 입력으로 문항표를 만들 수 있습니다.'}</p>`}
          </section>
        </div>
        <aside class="regside">
          ${drafts.length ? `<section class="card"><h2>검수 대기 <small>${drafts.length}건</small></h2><div class="dlist">${drafts.map(d => `<button type="button" class="drow" data-draft="${esc(d.id)}"><b>${esc(d.meta.school)} ${d.meta.year} ${d.meta.grade}-${d.meta.sem} ${esc(d.meta.exam)}</b><span>${d.rows.length}문항 · 확인 ${d.rows.filter(r => !r.ok).length}개${d.source && d.source.kind === 'ai' ? ' · AI' : ''}</span></button>`).join('')}</div></section>` : ''}
          ${aiCard()}
        </aside>
      </div>`;
    bindPick();
  }
  function modelLabel(id) {
    const m = (window.SudoAI.MODELS[R.ai.provider] || []).find(x => x[0] === (id || R.ai.model));
    return m ? m[1].replace(/ \(.*\)$/, '') : (id || R.ai.model);
  }
  function tabsHtml() {
    return `<div class="segx" role="tablist" aria-label="등록 방법"><button type="button" role="tab" data-tab="one" aria-selected="${R.tab === 'one'}">한 건씩 등록</button><button type="button" role="tab" data-tab="pre" aria-selected="${R.tab === 'pre'}">미리 분석 (한꺼번에)</button></div>`;
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
    if (ctx && ctx.can && !ctx.can.aiSettings) return `<section class="card aicard"><h2>AI ${R.ai.url ? '<span class="pill ok">연결됨</span>' : '<span class="pill warn">원장님 설정 전</span>'}</h2><p class="dl" id="quotaLine">이번 달 AI 사용량을 확인하는 중…</p></section>`;
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
    const ra = $('#runAI'); if (ra) ra.onclick = () => runAI();
    const rsp = $('#runSplit'); if (rsp) rsp.onclick = () => runAI({ split: true, confirmed: true });
    const fc = $('#failClear'); if (fc) fc.onclick = async () => {
      const m = currentMeta(); if (!m) return; const id = idOf(m);
      failLocal.clear(id); R.fails[id] = []; R.lastFail = null;
      if (ctx && ctx.clearFails) await ctx.clearFails(id).catch(() => {});
      toast('실패 기록을 지웠습니다'); render();
    };
    const rm = $('#runManual'); if (rm) rm.onclick = () => {
      const m = currentMeta(); if (!m) return;
      const n = Math.max(1, Math.min(40, +$('#nItems').value || 24));
      openDraft(newDraft(m, { kind: 'manual', at: now() }, Array.from({ length: n }, (_, i) => emptyRow(i + 1))));
    };
    const wa = $('#withAns'); if (wa) wa.onchange = () => { R.withAns = wa.checked; try { localStorage.setItem('sudo.withAns', wa.checked ? '1' : '0'); } catch (_) {} };
    const ca = $('#cancelAI'); if (ca) ca.onclick = () => { if (R.busy && R.busy.ctrl) R.busy.ctrl.abort(); };
    $$('[data-draft]').forEach(b => b.onclick = () => openDraft(JSON.parse(JSON.stringify(D.drafts[b.dataset.draft]))));
    bindAI(); bindTabs();
    const ql = $('#quotaLine'); if (ql) quotaLeft().then(q => { ql.textContent = q.limit === Infinity || q.limit === undefined ? 'AI 사용 제한 없음' : `이번 달 AI 사용 ${q.used}/${q.limit}건 (시험지 한 건 읽기 = 1건)`; });
  }
  function bindTabs() { $$('[data-tab]').forEach(b => b.onclick = () => { R.tab = b.dataset.tab; render(); }); }
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
        msg.textContent = `연결됐습니다. Claude 키 ${s.claude ? '있음' : '없음'} · GPT 키 ${s.openai ? '있음' : '없음'}${s.colo ? ` · 처리 위치 ${s.colo}${s.colo === 'HKG' ? ' (홍콩: Claude가 막을 수 있음)' : ''}` : ''}`
          + ((R.ai.provider === 'claude' && !s.claude) || (R.ai.provider === 'openai' && !s.openai) ? ' — 고른 AI의 키가 Worker에 없습니다.' : '');
      } catch (e) { msg.textContent = '연결하지 못했습니다: ' + e.message; }
    };
  }

  // AI 사용 한도 (원장님 외 관리자는 한 달 기본 30건)
  async function quotaLeft() { try { return ctx && ctx.quota ? await ctx.quota() : { left: Infinity }; } catch (_) { return { left: Infinity }; } }

  // ---------- 실패 기록: 왜 안 됐는지 남기고, 같은 실패를 되풀이하지 않게 ----------
  // 기록은 이 컴퓨터(localStorage)와 서버(regfails, 원장님만 읽기)에 함께. 화면에 보이는 것은 원장님만, 방금 실패한 것은 누른 사람에게도.
  const STAGES = [['open', '파일 열기'], ['img', '그림 바꾸기'], ['send', 'AI에 보내기'], ['wait', 'AI 답 기다리기'], ['parse', '결과 정리'], ['save', '저장']];
  const stageName = k => (STAGES.find(x => x[0] === k) || [k, k])[1];
  const isOwner = () => !!(ctx && ctx.can && ctx.can.fails);
  const fileSig = files => files.map(f => `${f.name}:${f.size}`).sort().join('|');
  const failLocal = {
    all() { try { return JSON.parse(localStorage.getItem('sudo.regfails') || '{}'); } catch (_) { return {}; } },
    get(id) { return this.all()[id] || []; },
    put(id, rec) { try { const a = this.all(); a[id] = (a[id] || []).concat(rec).slice(-8); localStorage.setItem('sudo.regfails', JSON.stringify(a)); } catch (_) {} },
    clear(id) { try { const a = this.all(); delete a[id]; localStorage.setItem('sudo.regfails', JSON.stringify(a)); } catch (_) {} }
  };
  R.fails = {};   // id → 기록 목록 (불러온 것)
  async function getFails(id) {
    let list = failLocal.get(id);
    if (isOwner() && ctx.getFails) { try { const remote = await ctx.getFails(id); const seen = new Set(list.map(x => x.at)); list = list.concat(remote.filter(x => !seen.has(x.at))); } catch (_) {} }
    list.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    // 마지막으로 성공한 뒤의 실패만
    const k = list.map(x => !!x.ok).lastIndexOf(true);
    return list.slice(k + 1);
  }
  function loadFails(id) {
    if (!id || R.fails[id]) return;
    R.fails[id] = [];
    getFails(id).then(list => { R.fails[id] = list; if (!R.draft && !R.busy && (location.hash || '').startsWith('#register')) render(); });
  }
  function recordFail(id, rec) {
    failLocal.put(id, rec);
    R.fails[id] = (R.fails[id] || []).concat(rec);
    if (ctx && ctx.saveFail) ctx.saveFail(id, rec).catch(() => {});
  }
  function recordOk(id) {
    const rec = { ok: 1, at: now() };
    failLocal.put(id, rec); R.fails[id] = [];
    if (ctx && ctx.saveFail) ctx.saveFail(id, rec).catch(() => {});
  }
  // 오류 → 쉬운 말 이유 + 다음에 할 일
  function explain(rec) {
    const many = rec.pages > 4 && !rec.split, splitTip = many ? '‘4쪽씩 나눠 읽기’로 다시 하거나, ' : rec.split ? '이미 4쪽씩 나눠 읽었는데도 실패했습니다. 잠시 뒤 다시 하거나, ' : '';
    switch (rec.code) {
      case 'timeout': return { why: `AI가 ${rec.stage === 'send' ? '그림을 받은 뒤' : '답을 만들다'} 3분 동안 아무 답을 주지 않았습니다.${rec.photo ? ' 사진 시험지에 손글씨가 많아 읽는 데 오래 걸린 것으로 보입니다.' : ''}`, next: `${splitTip}학생 풀이가 없는 시험지(정리본·스캔)를 넣어 주세요.`, split: many };
      case 'net': return { why: '인터넷 연결이 끊겼거나 중계 서버(Worker)에 닿지 못했습니다.', next: `인터넷 연결을 확인하고 다시 해 주세요. 같은 일이 되풀이되면 ${many ? '‘4쪽씩 나눠 읽기’를 써 주세요' : '잠시 뒤 다시 해 주세요'}.`, split: many };
      case 'big': return { why: `보내는 그림이 너무 큽니다${rec.mb ? ` (${rec.mb}MB)` : ''}.`, next: `${rec.split ? '' : '‘4쪽씩 나눠 읽기’로 다시 해 주세요. '}정답·해설 파일은 빼고 시험지만 넣어도 됩니다.`, split: !rec.split };
      case 'cut': return { why: '문항이 많아 AI의 답이 중간에 잘렸습니다.', next: rec.split ? '‘정답도 AI가 풀기’를 끄고 다시 해 주세요.' : '‘4쪽씩 나눠 읽기’로 다시 해 주세요.', split: !rec.split };
      case 'empty': return { why: 'AI가 문항을 찾지 못하고 빈 결과를 돌려줬습니다.', next: rec.photo ? '사진이 기울었거나 흐릴 수 있습니다. 종이만 나오게 다시 찍거나 스캔본을 넣어 주세요.' : '시험지 파일이 맞는지(정답지만 넣지 않았는지) 확인해 주세요.', split: many };
      case 'refuse': return { why: 'AI가 이 그림을 읽기를 거절했습니다.', next: '시험지가 아닌 그림이 섞이지 않았는지 확인해 주세요.' };
      case 'busy': return { why: `AI 서버가 바빠서 받지 못했습니다${rec.status ? ` (응답 ${rec.status})` : ''}.`, next: '5~10분 뒤 다시 해 주세요.' };
      case 'auth': return { why: 'AI 연결 권한 문제입니다 (키 또는 Worker 설정).', next: '오류 원문을 확인하고 Worker 설정을 점검해 주세요. 다시 눌러도 같은 결과가 나옵니다.' };
      case 'credit': return { why: 'AI 크레딧이 부족합니다.', next: 'Anthropic 콘솔 Billing에서 충전한 뒤 다시 해 주세요.' };
      case 'open': return { why: '파일을 열지 못했습니다.', next: 'PDF·JPG·PNG인지, 파일이 깨지지 않았는지 확인해 주세요. 한글 파일은 PDF로 저장해서 넣어 주세요.' };
      case 'save': return { why: 'AI가 읽은 결과를 저장하지 못했습니다.', next: '인터넷 연결을 확인하고 다시 해 주세요. 결과는 이 컴퓨터에 임시로 남아 있을 수 있습니다.' };
      default: return { why: 'AI가 오류를 돌려줬습니다.', next: '오류 원문을 확인해 주세요.', split: many };
    }
  }
  function makeRec(e, ctxInfo) {
    const code = (typeof e.code === 'string' && e.code) || (ctxInfo.stage === 'open' || ctxInfo.stage === 'img' ? 'open' : ctxInfo.stage === 'save' ? 'save' : 'http');
    return { at: now(), stage: e.stage || ctxInfo.stage, code, msg: String(e.message || e).slice(0, 400), secs: Math.round((Date.now() - ctxInfo.t0) / 1000),
      pages: ctxInfo.pages || 0, mb: e.mb ? Math.round(e.mb * 10) / 10 : (ctxInfo.mb || 0), model: ctxInfo.model || '', files: (ctxInfo.files || []).slice(0, 4), sig: ctxInfo.sig || '',
      tries: e.tries || 1, split: !!ctxInfo.split, photo: !!ctxInfo.photo, part: ctxInfo.part || '', status: e.status || 0, by: (ctx && ctx.me && ctx.me.email) || '' };
  }
  const fmtAt = iso => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  function stepsHtml(cur, done) {
    const i = STAGES.findIndex(x => x[0] === cur);
    return `<div class="fsteps">${STAGES.map((x, k) => `<span class="${k < i ? 'ok' : k === i ? (done ? 'x' : 'now') : ''}">${x[1]}</span>`).join('')}</div>`;
  }
  // 실패 상자: 원장님은 저장된 기록 전체, 다른 분은 방금 실패한 것만
  function failBox(id) {
    const list = isOwner() ? (R.fails[id] || []).filter(x => !x.ok) : (R.lastFail && R.lastFail.id === id ? [R.lastFail.rec] : []);
    if (!list.length) return '';
    const f = list[list.length - 1], x = explain(f);
    const same = list.filter(y => y.code === f.code && y.sig === f.sig).length;
    return `<div class="failbox" role="alert">
      <div class="fh"><b>지난번에 읽지 못했습니다</b><small>${fmtAt(f.at)}${same > 1 ? ` · ${same}번째 같은 이유` : ''}${f.by && isOwner() ? ` · ${esc(f.by.split('@')[0])}` : ''}</small></div>
      ${stepsHtml(f.stage, true)}
      <p><b>${esc(x.why)}</b></p>
      <p class="fnext"><b>다음에 할 일</b> · ${esc(x.next)}</p>
      <details><summary>자세히 (오류 원문)</summary><code>${esc(`단계=${stageName(f.stage)}${f.part ? ` (${f.part} 묶음)` : ''} · ${f.secs}초 · ${f.pages}쪽${f.photo ? '(사진)' : ''} · ${f.mb}MB · ${f.model} · 시도 ${f.tries}번${f.split ? ' · 나눠 읽기' : ''}\n${f.msg}\n파일: ${(f.files || []).join(', ')}`)}</code>
        ${list.length > 1 ? `<ul>${list.slice(0, -1).reverse().slice(0, 4).map(y => `<li>${fmtAt(y.at)} · ${esc(stageName(y.stage))} · ${esc(explain(y).why)}</li>`).join('')}</ul>` : ''}</details>
      <div class="frow">${x.split && !f.split && R.files.length ? '<button type="button" class="btn sm" id="runSplit">4쪽씩 나눠 읽기</button>' : ''}${isOwner() ? '<button type="button" class="btn ghost sm" id="failClear">기록 지우기</button>' : ''}</div></div>`;
  }
  // 같은 파일이 같은 이유로 2번 실패했으면 묻기 → 'split' | 'again' | null
  function askRepeat(list) {
    return new Promise(resolve => {
      const f = list[list.length - 1], x = explain(f), sh = $('#sheet');
      sh.innerHTML = `<div class="sheet-back" data-close></div><section class="statdlg" role="dialog" aria-modal="true" aria-labelledby="rpT">
        <h2 id="rpT">이 파일은 같은 이유로 ${list.length}번 실패했습니다</h2>
        <p class="dl">이유: ${esc(stageName(f.stage))}에서 — ${esc(x.why)} (${list.map(y => fmtAt(y.at).split(' ').pop()).join(', ')})</p>
        <p>같은 방법으로 다시 하면 또 실패할 가능성이 큽니다. ${esc(x.next)}</p>
        <div class="row2" style="justify-content:flex-end"><button type="button" class="btn ghost" data-r="">그만두기</button><button type="button" class="btn ghost danger" data-r="again">그래도 다시</button>${x.split && !list.every(y => y.split) ? '<button type="button" class="btn" data-r="split">권장: 4쪽씩 나눠 읽기</button>' : ''}</div></section>`;
      sh.hidden = false;
      const done = v => { sh.hidden = true; sh.innerHTML = ''; resolve(v); };
      $$('[data-r]', sh).forEach(b => b.onclick = () => done(b.dataset.r || null));
      $$('[data-close]', sh).forEach(b => b.onclick = () => done(null));
    });
  }
  // 시험지 읽기: 사진 시험지이고 6쪽이 넘으면(또는 split) 4쪽씩 나눠 읽고 합친다
  async function readExam({ settings, pages, meta, withAns, signal, split, onStage }) {
    const course = courseOf(meta);
    const groups = []; for (let k = 0; k < pages.length; k += split ? 4 : pages.length) groups.push(pages.slice(k, k + (split ? 4 : pages.length)));
    const items = [], warnings = [], usage = { in: 0, out: 0 }; let total = 0;
    for (let g = 0; g < groups.length; g++) {
      const off = g * 4, part = groups.length > 1 ? `${g + 1}/${groups.length}` : '';
      const note = groups.length > 1 ? `[나눠 읽기] 이번에 보내는 그림은 시험지 전체 ${pages.length}쪽 중 ${off + 1}~${off + groups[g].length}쪽입니다. 이 그림들에서 문항 번호가 보이는 문항만 돌려주세요 (번호가 앞 묶음에 있던 문항은 빼기). pg는 이번에 보낸 그림 순서(1부터)로 적습니다. 배점 합계가 100점이 되지 않아도 괜찮습니다.` : '';
      let r;
      try {
        r = await window.SudoAI.analyze({ settings, getToken: ctx.getToken, pages: groups[g], meta: Object.assign({ course }, meta), catalogLines: catalogLines(course), example: exampleFor(meta), signal, withAns, note,
          onStage: (s, info) => onStage && onStage(s, Object.assign({ part }, info)) });
      } catch (e) { e.part = part; throw e; }
      (r.result.items || []).forEach(it => { it.pg = +it.pg ? +it.pg + (groups.length > 1 ? off : 0) : 0; items.push(it); });
      (r.result.warnings || []).forEach(w => warnings.push(part ? `[${part}] ${w}` : w));
      if (r.result.total_pts) total = groups.length > 1 ? 0 : r.result.total_pts;
      usage.in += r.usage.in; usage.out += r.usage.out;
    }
    // 같은 번호가 두 묶음에 나오면 확신도가 높은 것 하나만
    const byNo = new Map();
    items.forEach(it => { const k = `${it.essay ? 'e' : ''}${it.no}`, o = byNo.get(k); if (!o || (+it.conf || 0) > (+o.conf || 0)) byNo.set(k, it); });
    const merged = [...byNo.values()];
    if (groups.length > 1) warnings.unshift(`사진 시험지라 ${groups.length}번에 나눠 읽고 합쳤습니다. 문항 번호가 빠지거나 겹치지 않았는지 확인해 주세요`);
    if (!merged.length) throw Object.assign(new Error('AI가 문항을 하나도 돌려주지 않았습니다'), { code: 'empty', stage: 'parse' });
    return { result: { items: merged, warnings, total_pts: total || undefined }, usage };
  }
  const useOne = () => { if (ctx && ctx.addUsage) ctx.addUsage(1); };
  async function runAI(opt) {
    opt = opt || {};
    const m = currentMeta(); if (!m) return;
    if (!R.files.length) { toast('시험지 파일을 먼저 넣어 주세요'); return; }
    const id = idOf(m), sig = fileSig(R.files);
    let split = !!opt.split;
    if (!opt.confirmed) {
      const prev = (await getFails(id)).filter(f => !f.ok && f.sig === sig);
      const last = prev[prev.length - 1];
      const same = last ? prev.filter(f => f.code === last.code && (!split || f.split)) : [];
      if (same.length >= 2) { const ch = await askRepeat(same); if (!ch) return; if (ch === 'split') split = true; }
    }
    const q = await quotaLeft(); if (q.left < 1) { toast(`이번 달 AI 사용 한도(${q.limit}건)를 다 썼습니다. 원장님께 한도를 늘려 달라고 요청해 주세요`); return; }
    const ctrl = new AbortController(), t0 = Date.now();
    const info = { t0, stage: 'open', files: R.files.map(f => f.name), sig, model: R.ai.model, split };
    R.lastFail = null;
    R.busy = { label: `${modelLabel()}가 시험지를 읽고 있습니다`, ctrl, t0, stage: 'open', chars: 0, lastAt: 0, note: '' };
    render();
    const tick = setInterval(paintBusy, 1000);
    const setStage = (st, extra) => { info.stage = st; Object.assign(R.busy || {}, { stage: st }, extra || {}); paintBusy(true); };
    try {
      const course = courseOf(m);
      setStage('img', { label: '시험지를 그림으로 바꾸는 중' });
      let pages;
      try { pages = await window.SudoPages.load(R.files); } catch (e) { info.stage = /열지 못했|읽을 수 있습니다|Invalid|PDF/.test(e.message) ? 'open' : 'img'; throw Object.assign(new Error(e.message || String(e)), { code: 'open' }); }
      info.pages = pages.length; info.photo = pages.some(p => p.photo);
      if (info.photo && pages.length > 6) split = true;
      info.split = split;
      setStage('send', { label: `${modelLabel()}가 시험지 ${pages.length}쪽을 읽고 있습니다${info.photo ? ' (사진 · 종이만 잘라 보냄)' : ''}`, note: split ? '4쪽씩 나눠 읽습니다' : '' });
      const { result, usage } = await readExam({ settings: R.ai, pages, meta: m, withAns: R.withAns, signal: ctrl.signal, split,
        onStage: (st, x) => {
          if (st === 'retry') { setStage('send', { note: `다시 보내는 중 (${x.why || '연결 문제'})${x.part ? ` · ${x.part} 묶음` : ''}` }); return; }
          if (x.part) info.part = x.part;
          setStage(st, { chars: x.chars || 0, lastAt: Date.now(), part: x.part || '', note: split ? `4쪽씩 나눠 읽는 중${x.part ? ` · ${x.part} 묶음` : ''}` : '' });
        } });
      setStage('parse');
      const d = newDraft(m, { kind: 'ai', provider: R.ai.provider, model: R.ai.model, at: now(), files: R.files.map(f => f.name), nPages: pages.length, photo: info.photo || undefined, split: split || undefined, usage, secs: Math.round((Date.now() - t0) / 1000), withAns: R.withAns }, rowsFromAI(result, course));
      d.warnings = result.warnings || [];
      if (result.total_pts) d.warnings.unshift(`시험지에 적힌 배점 합계: ${result.total_pts}점`);
      const snapped = window.SudoPages.snap(d.rows, pages, 0, { aiEnds: true });
      const nMiss = d.rows.length - snapped;
      d.warnings.push(`문항 영역: ${d.rows.length}문항 중 ${snapped}개를 번호 위치로 맞췄습니다${nMiss > 0 ? ` · ${nMiss}개는 아래 ‘문항 위치’에서 번호 찍기로 채워 주세요` : ''}`);
      const imgs = cropRows(d.rows, pages, d.id);
      setStage('save');
      R.files = []; R.pages = pages;
      try { if (ctx) await ctx.saveImgs(imgs); } catch (_) { d.warnings.push('문항 그림 일부를 저장하지 못했습니다. 저장할 때 다시 시도합니다'); d.pendingImgs = 1; }
      useOne();
      try { await saveDraftRemote(d); } catch (_) {}
      recordOk(id);
      clearInterval(tick); R.busy = null;
      openDraft(d, true);
    } catch (e) {
      clearInterval(tick); R.busy = null;
      if (e.name === 'AbortError' && ctrl.signal.aborted) { toast('그만두었습니다'); render(); return; }
      if (e.part) info.part = e.part;
      const rec = makeRec(e, info);
      recordFail(id, rec);
      R.lastFail = { id, rec };
      toast('읽지 못했습니다. ③ 아래에 이유를 남겼습니다');
      render();
      const fb = $('.failbox'); if (fb) fb.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } finally { clearInterval(tick); }
  }
  // 읽는 동안 화면: 단계 · 받은 글자 수 · 마지막 응답
  function paintBusy(full) {
    const b = R.busy; if (!b) return;
    if (full) { const bx = $('.busybox'); if (bx) { const t = $('b', bx); if (t) t.textContent = b.label; const st = $('.fsteps', bx); if (st) st.outerHTML = stepsHtml(b.stage); } }
    const el = $('#busyT'); if (!el) return;
    const secs = Math.round((Date.now() - b.t0) / 1000), mm = secs >= 60 ? `${Math.floor(secs / 60)}분 ${secs % 60}초` : `${secs}초`;
    const parts = [mm];
    if (b.stage === 'wait') parts.push(b.chars ? `답 받는 중 · ${b.chars.toLocaleString()}자` : 'AI가 읽는 중', b.lastAt ? `마지막 응답 ${Math.round((Date.now() - b.lastAt) / 1000)}초 전` : '');
    if (b.note) parts.push(b.note);
    parts.push('창을 닫지 말아 주세요');
    el.textContent = parts.filter(Boolean).join(' · ');
  }
  async function saveDraftRemote(d) {
    d.updatedAt = now();
    D.drafts[d.id] = JSON.parse(JSON.stringify(d));
    if (ctx) await ctx.saveDraft(d.id, D.drafts[d.id]);
  }
  function openDraft(d, keepPages) { if (!keepPages) R.pages = null; R.draft = d; local.set(d); H.go('register'); render(); window.scrollTo(0, 0); }
  function closeDraft() { R.draft = null; R.pages = null; local.set(null); render(); }

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
    const showAns = !!(d.showAns || src.withAns || rows.some(r => r.ans));
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
      ${pagesBar(d)}
      ${locCard(rows)}
      <section class="card cuts"><div class="head"><h2>학교 성적 자료 <small>선택 · 학교알리미 학기 자료나 학교 발표 평균·A~E 비율</small></h2>${byId[d.id] ? `<button type="button" class="btn ghost sm" id="rvStats">${byId[d.id].st ? '고치기 ✓' : '넣기'}</button>` : '<span class="dl">새 시험은 저장한 뒤 보관함에서 넣을 수 있습니다</span>'}</div></section>
      <div class="tablewrap rvwrap"><table class="rvtbl">
        <thead><tr><th>그림</th><th>번호</th><th>배점</th><th>난이도</th><th>행동</th><th>중단원</th><th>유형 · 지난 출제</th><th>서답</th>${showAns ? '<th>정답</th>' : ''}<th>확인</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => rowHtml(r, i, course, mids, d.id, showAns)).join('')}</tbody></table></div>
      <div class="rvfoot"><button type="button" class="btn ghost sm" id="rvAdd">문항 추가</button>${showAns ? '<button type="button" class="btn ghost sm" id="rvAns">정답표 복사</button>' : '<button type="button" class="btn ghost sm" id="rvAnsOn">정답 칸 열기</button>'}<span class="dl">새 유형은 저장할 때 단원·유형 목록에 함께 들어갑니다.</span></div>`;
    bindReview();
  }
  // ---------- 검수 화면에서 시험지 열기 ----------
  // 처음 AI가 읽은 파일 목록(source.files) 순서대로 열어야 저장된 '몇 쪽'이 맞는다
  function srcNames(d) { return ((d.source && d.source.files) || []).map(n => String(n).split('/').pop()); }
  function mbState() { const mb = window.__mybox; return mb ? mb.state().state : 'none'; }
  async function mbFilesFor(d) {
    const mb = window.__mybox, e = byId[d.id]; if (!mb || !e) return null;
    let st = mb.state().state;
    if (st === 'ask') { await mb.reconnect(); st = mb.state().state; }
    if (st !== 'ok') return null;
    for (let k = 0; k < 60 && !mb.ready(); k++) await new Promise(r => setTimeout(r, 250));   // 폴더 훑기 기다리기 (최대 15초)
    if (!mb.ready()) return null;
    const names = srcNames(d);
    const byName = n => e.fl.find(f => f[0].split('/').pop() === n);
    let list = names.map(byName).filter(Boolean).map(f => mb.fileOf('exam', f[0])).filter(Boolean);
    if (!list.length || list.length < names.length) { const one = mbExamFile(d.id, d); if (one && !list.includes(one)) list = list.length ? list : [one]; }
    return list.length ? list : null;
  }
  function pickFiles() {
    return new Promise(resolve => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = ACCEPT; inp.hidden = true;
      document.body.appendChild(inp);
      const done = v => { inp.remove(); resolve(v); };
      inp.onchange = () => done(inp.files && inp.files.length ? [...inp.files] : null);
      inp.addEventListener('cancel', () => done(null));
      inp.click();
    });
  }
  // how: '' 알아서(MYBOX → 파일 고르기) · 'mb' · 'pick'
  async function ensurePages(d, how) {
    if (R.pages && !how) return true;
    let files = null, from = '';
    try {
      if (how !== 'pick') { files = await mbFilesFor(d); from = 'MYBOX'; }
      if (!files) {
        if (how === 'mb') { toast('MYBOX에서 이 시험지를 찾지 못했습니다. ‘파일 고르기’로 열어 주세요'); return false; }
        toast(srcNames(d).length > 1 ? `처음 읽은 파일 ${srcNames(d).length}개를 모두 골라 주세요` : '시험지 파일을 골라 주세요');
        files = await pickFiles(); from = '';
        if (!files) return false;
        const names = srcNames(d);   // 처음 읽은 순서대로 정렬
        files.sort((a, b) => ((names.indexOf(a.name) + 1) || 99) - ((names.indexOf(b.name) + 1) || 99));
      }
      toast(`시험지를 여는 중… ${files.map(f => f.name).join(', ')}`);
      R.pages = await window.SudoPages.load(files);
      R.pagesFrom = from;
      toast(`${from ? from + '에서 ' : ''}${R.pages.length}쪽을 열었습니다`);
      renderReview();
      return true;
    } catch (e) { toast('시험지를 열지 못했습니다: ' + e.message); return false; }
  }
  function pagesBar(d) {
    const names = srcNames(d);
    if (R.pages) {
      const opened = [...new Set(R.pages.map(p => p.file))], n0 = d.source && d.source.nPages;
      const maxPg = d.rows.reduce((m, r) => Math.max(m, +r.pg || 0), 0);
      const off = n0 && n0 !== R.pages.length ? `처음 읽을 때 ${n0}쪽, 지금 ${R.pages.length}쪽 — 위치가 어긋날 수 있습니다` : maxPg > R.pages.length ? `문항 위치가 ${maxPg}쪽까지 있는데 지금 ${R.pages.length}쪽만 열렸습니다 — 처음 읽은 파일을 모두 열어 주세요` : '';
      return `<div class="pgbar ${off ? 'warn' : 'ok'}"><b>시험지 ${R.pages.length}쪽 열림</b><small>${esc(opened.join(' + '))}${off ? '' : n0 ? ' · 처음 읽을 때와 같음' : ''}</small>${off ? `<span class="pgwarn">${esc(off)}</span><button type="button" class="btn ghost sm" data-pgopen="pick">다른 파일로 다시 열기</button>` : ''}</div>`;
    }
    const st = mbState(), mbOk = (st === 'ok' || st === 'ask') && byId[d.id];
    return `<div class="pgbar"><b>시험지가 열려 있지 않습니다</b><small>문항 그림을 고치려면 필요합니다${st === 'ask' ? ' · MYBOX는 누르면 크롬이 폴더 읽기를 다시 물어봅니다' : ''}</small>
      <span class="frow">${mbOk ? '<button type="button" class="btn sm" data-pgopen="mb">MYBOX에서 열기</button>' : ''}<button type="button" class="btn ${mbOk ? 'ghost ' : ''}sm" data-pgopen="pick">파일 고르기</button></span>
      ${names.length > 1 ? `<span class="dl">처음 읽은 파일 ${names.length}개(${esc(names.join(', '))})를 같은 순서로 엽니다</span>` : ''}</div>`;
  }
  // 문항 위치: 번호로 찾은 문항(초록) · 직접 찍거나 고친 문항(금색) · AI 짐작뿐인 문항(빨강)
  const FOUND = ['text', 'num'], HAND = ['pin', 'manual'];
  const locOf = r => FOUND.includes(r.boxSrc) ? 'ok' : HAND.includes(r.boxSrc) ? 'hand' : 'miss';
  function locCard(rows) {
    const list = rows.slice().sort((a, b) => (+a.essay || 0) - (+b.essay || 0) || a.no - b.no);
    const nOk = rows.filter(r => locOf(r) === 'ok').length, nHand = rows.filter(r => locOf(r) === 'hand').length, nMiss = rows.length - nOk - nHand;
    const nNoEnd = rows.filter(r => locOf(r) !== 'miss' && r.boxSrc !== 'manual' && !r.essay && !r.be).length;
    return `<section class="card locbar" aria-label="문항 위치 확인"><div class="head"><h2>문항 위치 <small>${rows.length}문항 중 ${nOk}개 번호로 찾음${nHand ? ` · ${nHand}개 직접` : ''}${nMiss ? ` · <b class="goldt">${nMiss}개 못 찾음</b>` : ''}</small></h2>
      <div class="row2">${R.pages ? `<button type="button" class="btn ghost sm" id="rvSnap">번호 기준으로 다시 잡기</button><button type="button" class="btn sm" id="rvPin" ${nMiss ? '' : 'disabled'}>${nMiss ? `번호 찍기로 ${nMiss}개 채우기` : '모두 찾음'}</button>`
        : '<button type="button" class="btn sm" data-pgopen>시험지 열기 <small>번호 확인·찍기</small></button>'}</div></div>
      <div class="locchips">${list.map(r => { const noEnd = locOf(r) !== 'miss' && r.boxSrc !== 'manual' && !r.essay && !r.be; return `<button type="button" class="${locOf(r) === 'ok' ? '' : locOf(r)} ${noEnd ? 'noend' : ''}" data-loc="${rows.indexOf(r)}" title="${r.no}번 · ${{ text: 'PDF 글자로 번호 찾음', num: '그림에서 번호 찾음', pin: '번호 직접 찍음', manual: '영역 직접 고침' }[r.boxSrc] || 'AI 짐작 (번호를 못 찾음)'}${noEnd ? ' · 보기 ⑤를 못 찾아 다음 번호 바로 위까지' : ''}">${r.essay ? '서' : ''}${r.no}</button>`; }).join('')}</div>
      <div class="loclegend"><span><i></i>번호로 찾음</span><span><i class="hand"></i>직접 찍음·고침</span><span><i class="miss"></i>못 찾음 (AI 짐작) · 누르면 영역을 고칠 수 있습니다</span>${nNoEnd ? `<span><i class="noend"></i>끝(보기 ⑤)을 못 찾아 다음 번호 바로 위까지 잡음 ${nNoEnd}개</span>` : ''}</div></section>`;
  }
  function rowHtml(r, i, course, mids, selfId, showAns) {
    const types = r.mid ? typesOf(course, r.mid) : [];
    const known = r.code && types.some(([c]) => c[0] === r.code);
    const past = r.code ? pastOf(r.code, selfId) : [];
    const midOpts = mids.map(x => `<option value="${esc(x.mid)}" ${x.mid === r.mid ? 'selected' : ''}>${esc(x.mid)}${x.isNew ? ' (새)' : ''}</option>`).join('');
    const typeSel = `<select data-k="code" aria-label="${r.no}번 유형"><option value="">${r.mid ? '고르기' : '중단원 먼저'}</option>${types.map(([c]) => `<option value="${esc(c[0])}" ${c[0] === r.code ? 'selected' : ''}>${esc(c[5])}.${esc(c[6] || '(이름 없음)')}</option>`).join('')}<option value="__new" ${!known && (r.type || r.mid) && !r.code ? 'selected' : ''}>＋ 새 유형</option></select>`;
    const newIn = !known && !r.code && (r.type || r.mid) ? `<input data-k="type" value="${esc(String(r.type).replace(/^\d+\.\s*/, ''))}" placeholder="새 유형 이름">` : '';
 const thumb = `<td class="thc">${r.ik ? `<button type="button" class="thumb" data-zoom title="크게 보기"><img data-ik="${esc(r.ik)}" alt="${r.no}번 문항 그림"></button>` : '<span class="dl">없음</span>'}<button type="button" class="linkbtn" data-rebox>영역 ${r.ik ? '고치기' : '잡기'}</button></td>`;
    return `<tr data-i="${i}" class="${r.ok ? '' : 'need'}">${thumb}
      <td><input data-k="no" type="number" min="1" value="${r.no}" class="w3"></td>
      <td><input data-k="pts" type="number" step="0.1" min="0" value="${r.pts}" class="w4 ${r.pts === '' ? 'miss' : ''}"></td>
      <td><div class="dseg">${[1, 2, 3, 4].map(k => `<button type="button" data-diff="${k}" class="d${k}" aria-pressed="${r.diff === k}" title="${DIFF[k]}">${DIFF[k]}</button>`).join('')}</div></td>
      <td><select data-k="beh" aria-label="${r.no}번 행동영역"><option value=""></option>${BEHK.map(k => `<option value="${k}" ${r.beh === k ? 'selected' : ''}>${BEH[k]}</option>`).join('')}</select></td>
      <td><select data-k="mid" aria-label="${r.no}번 중단원"><option value="">고르기</option>${midOpts}<option value="__new">＋ 새 중단원</option></select></td>
      <td><div class="tcell">${typeSel}${newIn}${past.length ? `<small class="past" title="${esc(past.map(p => `${p.s} ${p.e.y} ${p.e.g}-${p.e.t} ${p.e.x} ${p.no}번`).join('\n'))}">지난 출제 ${past.length}번 · ${esc(past.slice(0, 2).map(p => `${H.short(p.s)} ${p.e.g}-${p.e.t}${p.e.x[0]} ${p.no}번`).join(', '))}${past.length > 2 ? ' 외' : ''}</small>` : ''}${r.note ? `<small class="note">AI: ${esc(r.note)}</small>` : ''}${r.q ? `<small class="qtx" title="${esc(r.q)}">${esc(r.q)}</small>` : ''}</div></td>
      <td><input data-k="essay" type="checkbox" ${r.essay ? 'checked' : ''} aria-label="${r.no}번 서답형"></td>
      ${showAns ? `<td><input data-k="ans" value="${esc(r.ans || '')}" class="w5" aria-label="${r.no}번 정답" title="${esc(r.sol || '')}">${r.sol ? `<small class="sol">${esc(r.sol)}</small>` : ''}</td>` : ''}
      <td><button type="button" class="okbtn" data-ok aria-pressed="${!!r.ok}" title="확인">${r.ok ? '✓' : '확인'}</button></td>
      <td><button type="button" class="xbtn" data-del title="문항 빼기" aria-label="${r.no}번 빼기">×</button></td></tr>`;
  }
  function touch(rerender) { R.draft.updatedAt = now(); local.set(R.draft); if (rerender) renderReview(); }
  function bindReview() {
    const d = R.draft;
    $('#rvBack').onclick = () => { if (confirmLeave()) closeDraft(); };
    $('#rvTemp').onclick = async ev => { const bt = ev.currentTarget; bt.disabled = true; try { await saveDraftRemote(d); toast('임시 저장했습니다. 검수 대기에서 이어서 볼 수 있습니다'); } catch (e) { toast('저장하지 못했습니다: ' + e.message); } bt.disabled = false; };
    $('#rvSave').onclick = ev => saveFinal(ev.currentTarget);
    $('#rvLevel').onchange = ev => { d.level = ev.target.value; touch(); };
    const rs = $('#rvStats'); if (rs) rs.onclick = () => H.openStats(byId[d.id], () => renderReview());
    const ra = $('#rvAns'); if (ra) ra.onclick = () => {
      const m = d.meta, txt = `${m.school} ${m.year} ${m.grade}-${m.sem} ${m.exam} 정답\n` + d.rows.slice().sort((x, y) => x.no - y.no).map(r => `${r.no}. ${r.ans || '?'}`).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('정답표를 복사했습니다'), () => toast('복사하지 못했습니다'));
    };
    const ro = $('#rvAnsOn'); if (ro) ro.onclick = () => { d.showAns = true; touch(true); };
    loadThumbs();
    const saveCrops = async list => {
      const imgs = cropRows(list, R.pages, d.id);
      try { if (ctx) await ctx.saveImgs(imgs); else Object.assign(H.imgCache || {}, imgs); } catch (e) { toast('그림 저장 실패: ' + e.message); }
    };
    const sn = $('#rvSnap'); if (sn) sn.onclick = async () => {
      sn.disabled = true; sn.textContent = '번호 찾는 중…';
      await new Promise(r => setTimeout(r, 30));
      d.rows.forEach(r => { if (FOUND.includes(r.boxSrc)) r.boxSrc = ''; });
      const hit = window.SudoPages.snap(d.rows, R.pages, 0);
      await saveCrops(d.rows.filter(r => FOUND.includes(r.boxSrc)));
      const miss = d.rows.filter(r => locOf(r) === 'miss').length;
      touch(true); toast(hit ? `${hit}문항을 번호 위치로 맞췄습니다${miss ? ` · ${miss}문항은 ‘번호 찍기’로 채워 주세요` : ''}` : '번호를 찾지 못했습니다. ‘번호 찍기’로 번호를 눌러 주세요');
    };
    const pn = $('#rvPin'); if (pn) pn.onclick = async () => {
      const miss = d.rows.filter(r => locOf(r) === 'miss').sort((a, b) => (+a.essay || 0) - (+b.essay || 0) || a.no - b.no);
      const near = r => { const o = d.rows.filter(x => x.pg && x !== r).sort((a, b) => Math.abs(a.no - r.no) - Math.abs(b.no - r.no))[0]; return r.pg || (o && o.pg) || 1; };
      const marks = d.rows.filter(r => locOf(r) !== 'miss' && r.pg && (r.an || r.box)).map(r => ({ pg: r.pg, an: r.an || [r.box[0] + 8, r.box[1] + 6], label: r.no }));
      const got = await window.SudoPages.pickNumbers(R.pages, miss.map(r => ({ label: r.no, pg: near(r), essay: !!r.essay })), marks);
      if (!got || !got.length) return;
      got.forEach(g => { const r = miss[g.k]; r.pg = g.pg; r.an = g.an; r.end = g.end; r.endPg = g.endPg; r.boxSrc = 'pin'; });
      const pgs = [...new Set(got.map(g => g.pg))];
      window.SudoPages.pinBoxes(d.rows, R.pages, 0, pgs);
      await saveCrops(d.rows.filter(r => pgs.includes(r.pg) && (FOUND.includes(r.boxSrc) || r.boxSrc === 'pin')));
      touch(true); toast(`${got.length}문항의 번호를 찍어 영역을 만들었습니다`);
    };
    $$('[data-pgopen]').forEach(b => b.onclick = () => ensurePages(d, b.dataset.pgopen || ''));
    $$('[data-loc]').forEach(b => b.onclick = () => {
      const tr = document.querySelector(`.rvtbl tbody tr[data-i="${b.dataset.loc}"]`); if (!tr) return;
      const rb = $('[data-rebox]', tr);
      if (rb) { tr.scrollIntoView({ block: 'center' }); rb.click(); }
    });
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
        else if (k === 'ans') r.ans = el.value.trim();
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
      const zb = $('[data-zoom]', tr); if (zb) zb.onclick = () => window.SudoPages.zoom($('img', zb).src, `${r.no}번 문항`);
      const rb = $('[data-rebox]', tr); if (rb) rb.onclick = async () => {
        if (!R.pages && !(await ensurePages(d))) return;
        const others = d.rows.filter(o => o !== r && o.box).map(o => ({ pg: o.pg, box: o.box, label: o.no }));
        const res = await window.SudoPages.pickBox(R.pages, r.pg || 1, r.box, others); if (!res) return;
        r.pg = res.pg; r.box = res.box; r.boxSrc = 'manual';
        const img = window.SudoPages.crop(R.pages[res.pg - 1], res.box); if (!img) { toast('영역이 너무 작습니다'); return; }
        r.ik = `e_${d.id}_${r.no}`;
        try { if (ctx) await ctx.saveImgs({ [r.ik]: img }); else (H.imgCache || {})[r.ik] = img; mark(); touch(true); toast('문항 그림을 바꿨습니다'); }
        catch (e) { toast('그림을 저장하지 못했습니다: ' + e.message); }
      };
    });
  }
  function loadThumbs() {
    const imgs = $$('img[data-ik]'); if (!imgs.length) return;
    const fill = map => imgs.forEach(im => { const v = map[im.dataset.ik]; if (v) im.src = v; else im.closest('td').innerHTML = '<span class="dl">없음</span>'; });
    if (ctx && ctx.getImgs) ctx.getImgs(imgs.map(i => i.dataset.ik)).then(fill, () => {}); else fill(H.imgCache || {});
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

    const newTypes = makeTypes(rows, course, m, d.id);
    const analysis = {
      level: d.level || null, cuts: d.cuts || {}, essay: rows.filter(r => r.essay).length, status: 'checked',
      items: rows.map(r => ({ no: +r.no, pts: +r.pts, diff: DIFF[r.diff], beh: BEH[r.beh], course, big: r.big || '', mid: r.mid, type: r.type || '', code: r.code || '', essay: !!r.essay, ans: r.ans || '', sol: r.sol || '',
        q: r.q || '', ik: r.ik || '', pg: r.pg || 0, box: r.box || null, bs: r.boxSrc || '', be: r.be ? 1 : 0 })),
      source: Object.assign({}, d.source || {}, { checkedAt: now() }), savedAt: now()
    };
    delete analysis.source.review;
    const isNew = !byId[d.id];
    const exam = isNew ? { school: m.school, main: MAIN4.includes(m.school), year: +m.year, grade: +m.grade, sem: +m.sem, exam: m.exam,
      hasPaper: true, hasAnswer: false, hasPoints: false, hasRubric: false, formats: ['pdf'], files: [], primary: '', notes: ['시험 등록에서 추가 (원본은 MYBOX에 넣어 주세요)'] } : null;
    btn.disabled = true; btn.textContent = '저장하는 중…';
    try {
      if (ctx) await ctx.saveAnalysis({ id: d.id, exam, analysis, newTypes });
      delete D.drafts[d.id];
      H.applySaved({ id: d.id, exam, analysis, newTypes });
      R.draft = null; R.pages = null; local.set(null); R.examId = null;
      toast('저장했습니다. 보관함과 분석지에 바로 나옵니다');
      H.openExam(d.id);
    } catch (e) { toast('저장하지 못했습니다: ' + e.message); btn.disabled = false; btn.textContent = '검수 끝 · 저장'; }
  }
  // 목록에 없는 유형은 새 코드로 만들어 행에 붙인다 (검수할 때만)
  function makeTypes(rows, course, m, fromId) {
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
      const t = { code, course, big: r.big || '', midNo, mid: midName, typeNo, name, addedAt: now(), from: fromId };
      newTypes.push(t);
      Object.assign(r, { code, mid: `${midNo}.${midName}`, type: `${typeNo}.${name}` });
    }
    return newTypes;
  }

  // ---------- 미리 분석: MYBOX 폴더의 시험을 한꺼번에 AI로 읽어 '검수 전'으로 바로 저장 ----------
  const P = R.pre;
  const isMain = e => MAIN4.includes(e.s);
  const readable = e => okFile(e.pr) || e.fl.some(f => (f[1] === 'P' || f[1] === 'PA') && okFile(f[0]));
  function filesFor(e) {
    const M = P.map; if (!M) return null;
    const take = p => M.get(p);
    const main = okFile(e.pr) && take(e.pr) ? e.pr : (e.fl.find(f => (f[1] === 'P' || f[1] === 'PA') && okFile(f[0]) && take(f[0])) || [])[0];
    if (!main) return null;
    const extra = e.fl.filter(f => (f[1] === 'S' || f[1] === 'A') && /\.pdf$/i.test(f[0]) && take(f[0]) && f[0] !== main).map(f => f[0]).slice(0, 2);
    return [main, ...extra].map(take);
  }
  const inGroup = e => (P.groups.includes('4개교') && isMain(e)) || (P.groups.includes('기타 학교') && !isMain(e));
  function preCands(year) {
    return D.exams.filter(e => !e.an && !D.drafts[e.id] && (year ? e.y === year : P.years.includes(e.y)) && inGroup(e) && readable(e) && (!P.map || filesFor(e)))
      .sort((a, b) => b.y - a.y || (isMain(b) - isMain(a)) || a.s.localeCompare(b.s, 'ko') || a.g - b.g || a.t - b.t || (a.x === '기말') - (b.x === '기말'));
  }
  const preExcluded = () => D.exams.filter(e => !e.an && P.years.includes(e.y) && inGroup(e) && e.p && !readable(e));
  const fillCands = () => D.exams.filter(e => e.an && e.an.status !== 'ai' && !e.an.items.some(i => i[13]) && readable(e) && (!P.map || filesFor(e)));
  // 번호 기준으로 다시 잡을 시험: 분석은 있는데 번호로 확인하지 않은 문항이 남은 시험
  const LOCATED = ['text', 'num', 'pin', 'manual'];
  const snapCands = () => D.exams.filter(e => e.an && e.an.items.some(i => !LOCATED.includes(i[17])) && readable(e) && (!P.map || filesFor(e)));
  const fmtDur = s => s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round(s % 3600 / 60)}분` : `${Math.max(1, Math.round(s / 60))}분`;
  const PHASES = [['1차', [2026, 2025], '지금 분석지에 바로 쓰이는 시험'], ['2차', [2024, 2023, 2022], '연도별로 나눠 하루 한 해씩 권장']];

  // MYBOX가 연결돼 있으면 폴더를 고르지 않아도 자동으로 씀
  function mbMap() {
    const mb = window.__mybox; if (!mb || !mb.ready()) return false;
    const keys = new Set(D.exams.flatMap(e => e.fl.map(f => f[0]))), M = new Map();
    mb.examMap().forEach((f, p) => { if (keys.has(p)) M.set(p, f); });
    P.map = M; P.nFiles = M.size; P.fromMb = true; return true;
  }
  // 검수 화면: 이 시험을 분석할 때 쓴 파일(없으면 대표 시험지)을 MYBOX에서 찾기
  function mbExamFile(id, d) {
    const mb = window.__mybox, e = byId[id]; if (!mb || !mb.ready() || !e) return null;
    const used = ((d && d.source && d.source.files) || [])[0];
    const pick = (used && e.fl.find(f => f[0].split('/').pop() === used)) || (e.pr && e.fl.find(f => f[0] === e.pr)) || e.fl.find(f => (f[1] === 'P' || f[1] === 'PA') && /\.(pdf|jpe?g|png)$/i.test(f[0]));
    return pick ? mb.fileOf('exam', pick[0]) || null : null;
  }
  function renderPre() {
    if (!P.map || P.fromMb) mbMap();
    const cands = preCands(), ex = preExcluded();
    const allYears = [...new Set(D.exams.map(e => e.y))].sort((a, b) => b - a).slice(0, 6);
    const nAI = D.exams.filter(e => e.an && e.an.status === 'ai').length, nChk = D.exams.filter(e => e.an && e.an.status !== 'ai').length;
    const model = P.model || R.ai.model;
    const st = { done: 0, run: 0, fail: 0, wait: 0 }; P.list.forEach(j => { st[j.st] = (st[j.st] || 0) + 1; });
    const avgSecs = (() => { const d = P.list.filter(j => j.secs); return d.length ? d.reduce((s, j) => s + j.secs, 0) / d.length : 100; })();
    const fc = fillCands();
    const chip = (attr, v, label, on) => `<button type="button" class="chip" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">분석지를 만들기 전에 AI가 미리 문항표를 채워 둡니다</div><h1>미리 분석</h1></div>${tabsHtml()}</div>
      <div class="tiles">
        <div class="tile dark"><span>미리 분석할 시험</span><b>${cands.length}건</b><span>${P.years.slice().sort().join('·')}년 · 읽을 수 있는 파일 있음</span></div>
        <div class="tile"><span>4개교</span><b>${cands.filter(isMain).length}건</b><span>목운 · 신목 · 양정 · 월촌</span></div>
        <div class="tile"><span>기타 학교</span><b>${cands.filter(e => !isMain(e)).length}건</b><span>인근 학교 비교용</span></div>
        <div class="tile"><span>이미 분석됨</span><b>${nChk + nAI}건</b><span>검수 완료 ${nChk} · 검수 전 ${nAI}</span></div></div>
      <div class="pregrid">
        <section class="card"><h2>무엇을 미리 분석할까요</h2>
          ${P.map ? `<div class="folderok"><b>MYBOX ‘B. 학교별 기출문제’ 연결됨${P.fromMb ? ' (자동)' : ''}</b><span>파일 ${P.nFiles}개를 찾았습니다 · 폴더에는 아무것도 쓰지 않습니다${P.fromMb ? ' · 새 파일은 10분마다 자동으로 찾습니다' : ''}</span>${P.fromMb ? '<a class="btn ghost sm" href="#mybox">MYBOX 연결 보기</a>' : '<label class="btn ghost sm" for="preDir">다시 고르기</label>'}</div>`
            : `<div class="folderok off"><b>먼저 MYBOX 폴더를 골라 주세요</b><span>N:\\공유\\공유받은\\2026 중등부\\A. 내신대비\\<b>B. 학교별 기출문제</b> 폴더를 통째로 고릅니다. 이 컴퓨터에서 바로 읽고, 폴더에는 아무것도 쓰지 않습니다.</span><label class="btn sm" for="preDir">폴더 고르기</label></div>`}
          <input type="file" id="preDir" webkitdirectory multiple hidden>
          <div class="fgroup"><span class="lab">연도</span><div class="chips">${allYears.map(y => chip('data-py', y, `${y} · ${preCands(y).length}건`, P.years.includes(y))).join('')}</div><small class="dl">숫자는 PDF·사진이 있어 바로 읽을 수 있는 분석 전 시험 수입니다.</small></div>
          <div class="fgroup"><span class="lab">학교</span><div class="chips">${['4개교', '기타 학교'].map(g => chip('data-pg', g, g, P.groups.includes(g))).join('')}</div></div>
          <div class="row2">
            <label class="sel"><span>AI 모델</span><select id="preModel">${(window.SudoAI.MODELS[R.ai.provider] || []).map(m => `<option value="${m[0]}" ${m[0] === model ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}</select></label>
            <label class="sel"><span>한 번에</span><select id="preConc">${[1, 2, 3].map(n => `<option value="${n}" ${n === P.conc ? 'selected' : ''}>${n}건씩</option>`).join('')}</select></label></div>
          <label class="chk"><input type="checkbox" id="preAns" ${P.withAns ? 'checked' : ''}> 정답도 AI가 풀기 <small>답지 없는 시험만</small></label>
          <div class="presum"><b>선택한 시험 ${cands.length}건 · 예상 ${fmtDur(cands.length * avgSecs / P.conc)} 안팎</b>
            <span>결과는 <b class="goldt">‘검수 전’</b> 표시를 달고 보관함과 분석지에 바로 올라갑니다. 검수는 나중에 하셔도 됩니다.</span></div>
          ${P.running ? '<button type="button" class="btn ghost big" id="preStop">멈추기 <small>지금 읽는 것까지만</small></button>' : `<div class="row2 btnrow">
            <button type="button" class="btn ghost big" id="preTry" ${cands.length && R.ai.url && P.map ? '' : 'disabled'}>먼저 3건 시험해 보기</button>
            <button type="button" class="btn big" id="preAll" ${cands.length && R.ai.url && P.map ? '' : 'disabled'}>${cands.length}건 모두 시작</button></div>`}
          ${P.running ? '' : !R.ai.url ? '<p class="callout why">버튼이 잠긴 이유: AI 연결이 아직 안 됐습니다. ‘한 건씩 등록’ 화면의 AI 연결을 먼저 마쳐 주세요.</p>'
            : !P.map ? '<p class="callout why">버튼이 잠긴 이유: MYBOX 폴더가 연결되지 않았습니다. 왼쪽 메뉴 ‘MYBOX 연결’에서 한 번 연결해 두면 자동으로 쓰고, 지금 한 번만 쓰려면 위 ‘폴더 고르기’로 ‘B. 학교별 기출문제’ 폴더를 골라 주세요.</p>'
            : !cands.length ? '<p class="callout why">버튼이 잠긴 이유: 고른 연도·학교에 분석할 시험이 없습니다. 연도나 학교를 더 켜 보세요.</p>' : ''}
          <div class="phases"><b>나눠서 진행하기 (권장 순서)</b>${PHASES.map(([k, ys, sub]) => {
            const tot = D.exams.filter(e => ys.includes(e.y) && readable(e)), done = tot.filter(e => e.an).length;
            const on = ys.every(y => P.years.includes(y)) && P.years.length === ys.length;
            return `<button type="button" class="phase ${on ? 'on' : ''}" data-phase="${ys.join(',')}"><span class="ptag">${k}</span><span class="pt"><b>${ys[ys.length - 1]}~${ys[0]}년 · ${tot.length}건</b><small>${sub}</small></span><span class="pst">${done >= tot.length ? '끝' : `${done}/${tot.length}`}</span></button>`;
          }).join('')}</div>
          ${ex.length ? `<details class="exd"><summary>제외된 시험 ${ex.length}건 — 한글 파일만 있음</summary><div class="exl">${ex.map(e => `<div><span>${esc(e.s)} ${e.y} ${e.g}-${e.t} ${esc(e.x)}</span><span class="goldt">PDF로 저장 필요</span></div>`).join('')}</div></details>` : ''}
          ${nChk ? `<div class="fillbox"><b>검수 끝난 시험에 문항 그림 채우기</b><span>예전에 검수한 시험 중 문항 그림·핵심 내용이 없는 ${fc.length}건${P.map ? '' : ' (폴더를 고르면 셉니다)'}. 유사문항에 그림을 넣으려면 필요합니다. 문항표(배점·난이도·유형)는 바꾸지 않습니다.</span>
            <button type="button" class="btn ghost sm" id="preFill" ${fc.length && R.ai.url && P.map && !P.running ? '' : 'disabled'}>${fc.length}건 그림 채우기</button></div>` : ''}
          ${nChk + nAI ? (() => { const sc = snapCands(); return `<div class="fillbox"><b>문항 영역을 번호 기준으로 다시 잡기</b><span>이미 분석한 시험 중 문항 영역을 번호로 확인하지 않은 ${sc.length}건${P.map ? '' : ' (폴더를 고르면 셉니다)'}. 각 문항 왼쪽 위 번호를 찾아 문항 그림을 다시 자릅니다. AI를 쓰지 않아 사용 한도에서 빠지지 않고, 배점·난이도·유형은 그대로입니다.</span>
            <button type="button" class="btn ghost sm" id="preSnap" ${sc.length && P.map && !P.running ? '' : 'disabled'}>${sc.length}건 다시 잡기</button></div>`; })() : ''}
        </section>
        <section class="card" aria-label="진행 상황"><div class="head"><h2>진행 상황 <small>${P.list.length ? `${st.done} / ${P.list.length}건${P.running && st.wait + st.run ? ` · 남은 시간 약 ${fmtDur((st.wait + st.run) * avgSecs / P.conc)}` : ''}` : '아직 시작 전'}</small></h2>
            ${!P.running && st.fail ? '<button type="button" class="btn ghost sm" id="preRetry">실패한 것 다시</button>' : ''}</div>
          ${P.list.length ? `<div class="pbar" role="progressbar" aria-valuenow="${st.done}" aria-valuemin="0" aria-valuemax="${P.list.length}" aria-label="진행률"><i style="width:${st.done / P.list.length * 100}%"></i><i class="run" style="width:${st.run / P.list.length * 100}%"></i></div>
          <div class="pcnt"><span><b>${st.done}</b> 완료(검수 전)</span><span><b>${st.run}</b> 읽는 중</span><span><b class="goldt">${st.fail}</b> 다시 필요</span><span><b>${st.wait}</b> 대기</span></div>
          <p class="dl tip">이 창을 닫으면 지금 읽는 것까지만 끝나고 멈춥니다. 다시 열어 폴더를 고르고 시작하면 남은 시험부터 이어서 합니다.</p>
          ${P.usage.n ? `<p class="dl">사용량: ${P.usage.n}건 · 입력 ${Math.round(P.usage.in / 1000)}천 · 출력 ${Math.round(P.usage.out / 1000)}천 토큰 (한 건 평균 입력 ${Math.round(P.usage.in / P.usage.n / 1000)}천 · 출력 ${Math.round(P.usage.out / P.usage.n / 1000)}천). 정확한 금액은 Claude 콘솔 Usage에서 확인하세요.</p>` : ''}
          <div class="jlist">${P.list.map(j => `<div class="job" data-jid="${esc(j.e.id)}"><span><b>${esc(j.e.s)}</b> ${j.e.y} · ${j.e.g}학년 ${j.e.t}학기 ${esc(j.e.x)}${j.kind === 'fill' ? ' <small>그림 채우기</small>' : j.kind === 'snap' ? ' <small>영역 다시 잡기</small>' : ''}</span><span class="dl">${esc(j.msg || '')}${j.st === 'fail' && j.more ? `<details class="jmore"><summary>펼쳐 보기</summary>${esc(j.more).replace(/\n/g, '<br>')}</details>` : ''}</span><span class="jst ${j.st}">${{ done: j.kind === 'fill' ? '그림 완료' : j.kind === 'snap' ? '다시 잡음' : '검수 전', run: j.kind === 'snap' ? '찾는 중' : '읽는 중', fail: '다시 필요', wait: '대기' }[j.st]}</span></div>`).join('')}</div>`
          : '<div class="empty">왼쪽에서 연도·학교를 고르고 ‘먼저 3건 시험해 보기’를 누르면 여기에 진행 상황이 나옵니다. 3건을 먼저 돌려 시간·사용량을 보고 모델을 정하세요.</div>'}
        </section></div>`;
    bindPre();
  }
  function bindPre() {
    bindTabs();
    const dir = $('#preDir');
    dir.onchange = () => {
      const keys = new Set(D.exams.flatMap(e => e.fl.map(f => f[0])));
      const map = new Map();
      [...dir.files].forEach(f => {
        const segs = (f.webkitRelativePath || f.name).split('/');
        for (let k = 0; k < segs.length; k++) { const p = segs.slice(k).join('/'); if (keys.has(p)) { map.set(p, f); break; } }
      });
      if (!map.size) { toast('보관함 시험과 맞는 파일을 찾지 못했습니다. ‘B. 학교별 기출문제’ 폴더를 골라 주세요'); return; }
      P.map = map; P.nFiles = map.size; P.fromMb = false; toast(`파일 ${map.size}개를 찾았습니다`); render();
    };
    $$('[data-py]').forEach(b => b.onclick = () => { const y = +b.dataset.py; P.years = P.years.includes(y) ? P.years.filter(x => x !== y) : P.years.concat(y); render(); });
    $$('[data-pg]').forEach(b => b.onclick = () => { const g = b.dataset.pg; P.groups = P.groups.includes(g) ? P.groups.filter(x => x !== g) : P.groups.concat(g); render(); });
    $$('[data-phase]').forEach(b => b.onclick = () => { P.years = b.dataset.phase.split(',').map(Number); render(); });
    $('#preModel').onchange = ev => { P.model = ev.target.value; };
    $('#preConc').onchange = ev => { P.conc = +ev.target.value; render(); };
    $('#preAns').onchange = ev => { P.withAns = ev.target.checked; };
    const go = (list, kind) => { if (!P.running) runPre(list.map(e => ({ e, st: 'wait', msg: '', kind }))); };
    const t = $('#preTry'); if (t) t.onclick = () => go(preCands().slice(0, 3), 'an');
    const al = $('#preAll'); if (al) al.onclick = () => { const c = preCands(); if (confirm(`${c.length}건을 차례로 읽습니다. 예상 ${fmtDur(c.length * 100 / P.conc)} 안팎이고, 그동안 이 창을 열어 두어야 합니다. 시작할까요?`)) go(c, 'an'); };
    const fl = $('#preFill'); if (fl) fl.onclick = () => go(fillCands(), 'fill');
    const ps = $('#preSnap'); if (ps) ps.onclick = () => { if (!P.running) runSnap(snapCands().map(e => ({ e, st: 'wait', msg: '', kind: 'snap' }))); };
    const sp = $('#preStop'); if (sp) sp.onclick = () => { P.stop = true; sp.disabled = true; sp.textContent = '지금 읽는 것까지만 하고 멈춥니다'; };
    const rt = $('#preRetry'); if (rt) rt.onclick = () => runPre(P.list.filter(j => j.st === 'fail').map(j => Object.assign(j, { st: 'wait', msg: '', final: false })), true);
  }
  // 번호 기준으로 다시 잡기 (AI 없이, 이 컴퓨터에서만)
  async function runSnap(list) {
    P.list = list; P.running = true; P.stop = false; render();
    for (const j of list) {
      if (P.stop) break;
      j.st = 'run'; j.msg = '쪽 여는 중'; prePaint();
      try {
        const files = filesFor(j.e); if (!files) throw new Error('파일을 찾지 못함');
        const pages = await window.SudoPages.load(files.slice(0, 1), { maxPages: 16, noB64: true });
        j.msg = `${pages.length}쪽에서 번호 찾는 중`; prePaint();
        await new Promise(r => setTimeout(r, 20));
        const rows = j.e.an.items.map(i => ({ no: i[0], essay: i[9], pg: i[15] || 0, box: i[16] || null, boxSrc: LOCATED.includes(i[17]) ? i[17] : '', be: i[18] || 0, ik: i[13] || '' }));
        const keep = rows.filter(r => r.boxSrc === 'manual' || r.boxSrc === 'pin');
        rows.forEach(r => { if (r.boxSrc === 'text' || r.boxSrc === 'num') r.boxSrc = ''; });
        const hit = window.SudoPages.snap(rows, pages, 0);
        const imgs = cropRows(rows.filter(r => r.boxSrc === 'text' || r.boxSrc === 'num'), pages, j.e.id);
        const analysis = docFromAn(j.e.an);
        analysis.items.forEach((it, k) => { const r = rows[k]; if (keep.includes(r)) return; Object.assign(it, { pg: r.pg, box: r.box, bs: r.boxSrc || '', be: r.be ? 1 : 0, ik: r.ik || it.ik }); });
        analysis.source = Object.assign({}, analysis.source || {}, { resnapAt: now() });
        if (ctx) await ctx.saveAnalysis({ id: j.e.id, analysis, imgs });
        H.applySaved({ id: j.e.id, analysis });
        j.final = true; j.st = 'done'; j.msg = `${rows.length}문항 중 ${hit + keep.length}개 번호로 맞춤`;
      } catch (e) { j.final = true; j.st = 'fail'; j.msg = String(e.message || e).slice(0, 60); }
      prePaint();
    }
    P.running = false;
    const done = list.filter(j => j.st === 'done').length;
    toast(`${done}건의 문항 영역을 다시 잡았습니다. 못 찾은 문항은 검수 화면의 ‘번호 찍기’로 채울 수 있습니다`);
    render();
  }
  const prePaint = () => { if ((location.hash || '').startsWith('#register') && !R.draft && R.tab === 'pre') render(); };
  async function runPre(list, keep) {
    const q = await quotaLeft();
    if (q.left < 1) { toast(`이번 달 AI 사용 한도(${q.limit}건)를 다 썼습니다`); return; }
    if (list.length > q.left) { toast(`이번 달 남은 한도 ${q.left}건까지만 읽습니다`); list = list.slice(0, q.left); }
    if (!keep) P.list = list;
    P.running = true; P.stop = false; render();
    let next = 0;
    const settings = Object.assign({}, R.ai, { model: P.model || R.ai.model });
    const worker = async () => {
      while (!P.stop && next < list.length) {
        const j = list[next++], t0 = Date.now();
        j.st = 'run'; j.msg = '쪽 여는 중'; prePaint();
        const info = { t0, stage: 'open', model: settings.model };
        const tick = setInterval(() => { if (j.final) return; j.msg = `${Math.round((Date.now() - t0) / 1000)}초째 · ${stageName(info.stage)}`; const el = document.querySelector(`.job[data-jid="${CSS.escape(j.e.id)}"] .dl`); if (el) el.textContent = j.msg; }, 5000);
        try {
          const files = filesFor(j.e); if (!files) throw Object.assign(new Error('MYBOX에서 파일을 찾지 못함'), { code: 'open' });
          info.files = files.map(f => f.name); info.sig = fileSig(files);
          info.stage = 'img';
          let pages;
          try { pages = await window.SudoPages.load(files, { maxPages: 16 }); } catch (e) { throw Object.assign(new Error(e.message || String(e)), { code: 'open' }); }
          info.pages = pages.length; info.photo = pages.some(p => p.photo);
          const split = info.photo && pages.length > 6; info.split = split;
          j.msg = `${pages.length}쪽 읽는 중${split ? ' (사진 · 4쪽씩 나눠 읽기)' : ''}`; prePaint();
          const m = metaOf(j.e), course = courseOf(m);
          const withAns = j.kind === 'an' && P.withAns && !j.e.a;
          info.stage = 'send';
          const { result, usage } = await readExam({ settings, pages, meta: m, withAns, split, onStage: st => { if (st !== 'retry') info.stage = st; } });
          info.stage = 'save';
          P.usage.in += usage.in; P.usage.out += usage.out; P.usage.n++;
          const rows = rowsFromAI(result, course);
          window.SudoPages.snap(rows, pages, 0, { aiEnds: true });
          const imgs = cropRows(rows, pages, j.e.id);
          const secs = Math.round((Date.now() - t0) / 1000);
          let analysis;
          if (j.kind === 'fill') {
            analysis = docFromAn(j.e.an);
            const byNo = Object.fromEntries(rows.map(r => [r.no, r]));
            let hit = 0;
            analysis.items.forEach(it => { const r = byNo[it.no]; if (r) { hit++; Object.assign(it, { q: r.q, pg: r.pg, box: r.box, ik: r.ik, bs: r.boxSrc || '', be: r.be ? 1 : 0 }); } });
            Object.keys(imgs).forEach(k => { if (!analysis.items.some(it => it.ik === k)) delete imgs[k]; });
            analysis.source = Object.assign({}, analysis.source || {}, { imgFill: { model: settings.model, at: now(), usage } });
            j.final = true; j.msg = `${hit}문항 그림`;
          } else {
            const warnings = (result.warnings || []).slice(0, 6);
            if (result.total_pts) warnings.unshift(`시험지에 적힌 배점 합계: ${result.total_pts}점`);
            analysis = {
              level: suggestLevel(rows), cuts: {}, essay: rows.filter(r => r.essay).length, status: 'ai',
              items: rows.map(r => ({ no: +r.no, pts: r.pts === '' ? 0 : +r.pts, diff: DIFF[r.diff] || '', beh: BEH[r.beh] || '', course, big: r.big || '', mid: r.mid || '', type: r.type || '', code: r.code || '', essay: !!r.essay,
                ans: r.ans || '', sol: r.sol || '', q: r.q || '', ik: r.ik || '', conf: Math.round(r.conf * 100) / 100, pg: r.pg || 0, box: r.box || null, bs: r.boxSrc || '', be: r.be ? 1 : 0 })),
              source: { kind: 'ai', provider: settings.provider, model: settings.model, at: now(), usage, secs, withAns, batch: true, files: files.map(f => f.name), warnings }, savedAt: now()
            };
            j.final = true; j.msg = `${rows.length}문항 · 확인 ${rows.filter(r => !r.ok).length}개 · ${secs}초`;
          }
          if (ctx) await ctx.saveAnalysis({ id: j.e.id, analysis, imgs });
          useOne();
          H.applySaved({ id: j.e.id, analysis });
          j.st = 'done'; j.secs = secs;
          if (j.kind === 'an') recordOk(j.e.id);
        } catch (e) {
          j.final = true; j.st = 'fail';
          if (e.part) info.part = e.part;
          const rec = makeRec(e, info), x = explain(rec);
          recordFail(j.e.id, rec);
          j.msg = `${stageName(rec.stage)} · ${x.why}`; j.more = `${x.next}\n${rec.msg}`;
        }
        clearInterval(tick);
        prePaint();
      }
    };
    await Promise.all(Array.from({ length: Math.min(P.conc, list.length) }, worker));
    P.running = false;
    if (P.stop) list.filter(j => j.st === 'wait').forEach(j => { j.msg = '멈춤'; });
    const done = list.filter(j => j.st === 'done').length, fail = list.filter(j => j.st === 'fail').length;
    toast(`${done}건 끝${fail ? ` · ${fail}건 다시 필요` : ''}. 보관함에 ‘검수 전’으로 올라갔습니다`);
    render();
  }

  return {
    render,
    pickExam(id) { const e = byId[id]; if (!e) return; R.tab = 'one'; R.draft = null; local.set(null); R.pick = 'archive'; R.school = e.s; R.onlyRaw = !e.an; R.examId = id; R.files = []; H.go('register'); render(); },
    editExam(id) { const e = byId[id]; if (e && e.an) openDraft(draftFromAnalysis(e)); },
    busy: () => !!(R.busy || R.pre.running),
    openPre() { R.draft = null; local.set(null); R.tab = 'pre'; H.go('register'); render(); },
    // 자료실·학생 화면이 같이 쓰는 도우미
    catalogLines, midsOf, typesOf, catIdx, courseOf, aiSettings: () => R.ai, modelLabel
  };
};
