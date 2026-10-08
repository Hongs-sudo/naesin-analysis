// 수도 내신분석 — 학생: 등록 · 시험마다 틀린 번호 입력 → 학생 분석지
window.SudoStudents = function (H) {
  const { D, ctx, byId, esc, toast, $, $$, DIFF, short } = H;
  D.students = D.students || {}; D.results = D.results || {};
  const store = { get(k, d) { try { const v = localStorage.getItem('sudo.' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem('sudo.' + k, JSON.stringify(v)); } catch (_) {} } };
  const S = Object.assign({ school: '', grade: '', q: '', sel: null, exam: null, pickOn: false, avgOn: true }, store.get('students', {}));
  S.form = null; S.pickFor = null; S.work = null;
  const keep = () => store.set('students', { school: S.school, grade: S.grade, sel: S.sel, pickOn: S.pickOn, avgOn: S.avgOn });
  const PICKS = ['①', '②', '③', '④', '⑤'];
  const now = () => new Date().toISOString();
  const order = (a, b) => b.y - a.y || b.g - a.g || b.t - a.t || (b.x === '기말') - (a.x === '기말');
  const label = e => `${e.s} ${e.y} ${e.g}학년 ${e.t}학기 ${e.x}`;
  const rid = (sid, eid) => `${sid}_${eid}`;
  const studs = () => Object.values(D.students).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const resultsOf = sid => Object.values(D.results).filter(r => r.student === sid);
  const examsFor = st => D.exams.filter(e => e.an && e.s === st.school).sort(order);
  // 같은 시험을 넣은 학원생 평균
  function average(eid) {
    const e = byId[eid], rs = Object.values(D.results).filter(r => r.exam === eid && D.students[r.student]);
    if (!e || !e.an || !rs.length) return null;
    const cs = rs.map(r => window.SudoReport.studentCalc(e, r));
    const avg = a => Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10;
    const rate = [0, 1, 2, 3, 4].map(d => { const v = cs.map(c => c.rate[d]).filter(x => x !== null); return v.length ? Math.round(avg(v)) : null; });
    const beh = {}; ['U', 'C', 'R', 'P'].forEach(k => { const v = cs.map(c => c.beh[k] && c.beh[k].r).filter(x => x !== null && x !== undefined); if (v.length) beh[k] = Math.round(avg(v)); });
    return { score: avg(cs.map(c => c.score)), n: rs.length, rate, beh };
  }
  // 분석지에 쓰는 학생 자료
  function reportData(sid, eid, avgOn) {
    const st = D.students[sid], r = D.results[rid(sid, eid)], e = byId[eid];
    if (!st || !r || !e || !e.an) return null;
    const hist = resultsOf(sid).map(x => ({ x, e: byId[x.exam] })).filter(o => o.e && o.e.an)
      .sort((a, b) => order(b.e, a.e)).map(o => { const sc = window.SudoReport.studentCalc(o.e, o.x).score; return { label: `${o.e.g}-${o.e.t} ${o.e.x}`, score: sc, me: o.e.id === eid, d: o.e.st && +o.e.st.avg > 0 ? Math.round((sc - o.e.st.avg) * 10) / 10 : null }; });
    const upto = hist.findIndex(h => h.me);
    return { name: st.name, res: r, avg: avgOn ? average(eid) : null, hist: upto >= 0 ? hist.slice(0, upto + 1) : hist };
  }

  // ---------- 화면 ----------
  function render() {
    const all = studs();
    const schools = [...new Set(all.map(s => s.school))].sort((a, b) => a.localeCompare(b, 'ko'));
    const list = all.filter(s => (!S.school || s.school === S.school) && (!S.grade || String(s.grade) === String(S.grade)) && (!S.q || s.name.includes(S.q.trim())));
    if (S.sel && !D.students[S.sel]) S.sel = null;
    const st = S.sel ? D.students[S.sel] : null;
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">학생을 등록하고 시험마다 틀린 번호를 넣으면 학생별 분석지가 만들어집니다</div><h1>학생</h1></div>
        <button type="button" class="btn" id="stNew">학생 등록</button></div>
      <div class="stgrid">
        <section class="card stlist" aria-label="학생 목록">
          <div class="row2"><label class="sel"><span>학교</span><select id="stSchool"><option value="">전체</option>${schools.map(s => `<option ${s === S.school ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
            <label class="sel"><span>학년</span><select id="stGrade"><option value="">전체</option>${[1, 2, 3].map(g => `<option value="${g}" ${String(g) === String(S.grade) ? 'selected' : ''}>${g}학년</option>`).join('')}</select></label></div>
          <input type="search" id="stQ" class="bigsearch" placeholder="이름으로 찾기" value="${esc(S.q)}" aria-label="학생 찾기">
          <div class="slist">${list.map(s => { const rs = resultsOf(s.id).map(r => ({ r, e: byId[r.exam] })).filter(o => o.e && o.e.an).sort((a, b) => order(a.e, b.e));
            const last = rs[0];
            return `<button type="button" class="srow ${s.id === S.sel ? 'on' : ''}" data-st="${esc(s.id)}"><b>${esc(s.name)}</b><small>${esc(short(s.school))}중 ${s.grade}학년${s.cls ? ' · ' + esc(s.cls) : ''}${last ? ` · ${last.e.g}-${last.e.t} ${last.e.x} ${window.SudoReport.studentCalc(last.e, last.r).score}점` : ''}</small><span class="pill ${last ? 'ok' : 'gold'}">${last ? `${rs.length}개 시험` : '입력 필요'}</span></button>`; }).join('')
            || `<div class="empty">${all.length ? '조건에 맞는 학생이 없습니다.' : '아직 등록한 학생이 없습니다. 오른쪽 위 ‘학생 등록’을 눌러 주세요.'}</div>`}</div>
          <p class="dl">학생 정보는 원장님 계정에서만 보입니다.</p>
        </section>
        <section class="card" aria-label="시험 결과 입력">${S.form ? formHtml() : st ? entryHtml(st) : '<div class="empty">왼쪽에서 학생을 고르면 시험 결과를 넣을 수 있습니다.</div>'}</section>
      </div>`;
    bind();
  }
  function formHtml() {
    const f = S.form;
    return `<div class="head"><h2>${f.id ? '학생 정보 고치기' : '학생 등록'}</h2><button type="button" class="linkbtn" id="fX">닫기</button></div>
      <div class="addform">
        ${f.id ? '' : `<div class="segx sm" role="tablist"><button type="button" role="tab" data-fm="one" aria-selected="${!f.many}">한 명</button><button type="button" role="tab" data-fm="many" aria-selected="${!!f.many}">여러 명 한꺼번에</button></div>`}
        ${f.many ? `<label class="sel"><span>이름 <small>한 줄에 한 명</small></span><textarea id="fNames" rows="6" placeholder="김민준\n이서연">${esc(f.names || '')}</textarea></label>`
          : `<label class="sel"><span>이름</span><input id="fName" value="${esc(f.name || '')}" placeholder="예: 김민준"></label>`}
        <div class="row2"><label class="sel"><span>학교</span><input id="fSchool" list="fSchools" value="${esc(f.school || '')}" placeholder="예: 월촌중"><datalist id="fSchools">${H.schools.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
          <label class="sel"><span>학년</span><select id="fGrade">${[1, 2, 3].map(g => `<option value="${g}" ${+f.grade === g ? 'selected' : ''}>${g}학년</option>`).join('')}</select></label></div>
        <div class="row2"><label class="sel"><span>반 <small>선택</small></span><input id="fCls" value="${esc(f.cls || '')}" placeholder="예: 화목 A반"></label>
          <label class="sel"><span>담당 선생님 <small>선택</small></span><input id="fTeacher" value="${esc(f.teacher || '')}" placeholder="예: 홍길동"></label></div>
        <div class="row2"><button type="button" class="btn" id="fSave">${f.id ? '저장' : '등록'}</button>${f.id ? '<button type="button" class="btn ghost danger" id="fDel">학생 지우기</button>' : ''}</div></div>`;
  }
  function work(st, e) {
    const id = rid(st.id, e.id);
    if (!S.work || S.work.id !== id) {
      const r = D.results[id];
      S.work = { id, wrong: r ? r.wrong.slice() : [], picks: Object.assign({}, r ? r.picks : {}), partial: Object.assign({}, r ? r.partial : {}), saved: !!r };
    }
    return S.work;
  }
  function entryHtml(st) {
    const exs = examsFor(st);
    if (!S.exam || !exs.some(e => e.id === S.exam)) {
      const done = new Set(resultsOf(st.id).map(r => r.exam));
      S.exam = (exs.find(e => e.g === +st.grade && !done.has(e.id)) || exs.find(e => e.g === +st.grade) || exs[0] || {}).id || null;
    }
    const e = S.exam ? byId[S.exam] : null;
    const head = `<div class="head stHead"><div><span class="dl">${esc(st.school)} ${st.grade}학년${st.cls ? ' · ' + esc(st.cls) : ''}${st.teacher ? ' · 담당 ' + esc(st.teacher) : ''} <button type="button" class="linkbtn" id="stEdit">정보 고치기</button></span><h2 class="h2big">${esc(st.name)} 학생</h2></div>
      <label class="sel"><span>시험</span><select id="stExam">${exs.map(x => `<option value="${esc(x.id)}" ${x.id === S.exam ? 'selected' : ''}>${esc(label(x))}${D.results[rid(st.id, x.id)] ? ' ✓' : ''}${x.an.status === 'ai' ? ' · 검수 전' : ''}</option>`).join('')}</select></label></div>`;
    if (!e) return head + `<div class="empty">${esc(st.school)}에 분석된 시험이 아직 없습니다. 시험 등록에서 먼저 분석해 주세요.</div>`;
    const W = work(st, e), it = e.an.items;
    const res = { wrong: W.wrong, picks: W.picks, partial: W.partial, pickOn: S.pickOn };
    const C = window.SudoReport.studentCalc(e, res);
    const A = average(e.id);
    const cols = Math.min(12, it.length);
    const essays = it.filter(i => i[9]);
    const u = C.units[0];
    return head + `
      ${e.an.status === 'ai' ? '<p class="callout">이 시험은 AI가 분석했고 아직 검수 전입니다. 결과는 넣을 수 있고, 검수하면 분석지가 자동으로 바뀝니다.</p>' : ''}
      <div class="head"><b>틀린 번호를 누르세요</b><label class="chk"><input type="checkbox" id="stPickOn" ${S.pickOn ? 'checked' : ''}> 고른 답도 입력 <small>(선택 · 함정 분석용)</small></label></div>
      <div class="numgrid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${it.map(i => { const w = C.lost[i[0]] > 0;
        return `<button type="button" class="nbtn ${i[9] ? 'es' : ''} ${w ? 'on' : ''}" data-no="${i[0]}" aria-pressed="${w}" aria-label="${i[0]}번${i[9] ? ' 서답형' : ''}${w ? ' 틀림' : ''}"><b>${i[0]}</b><small>${i[9] ? (w ? '-' + C.lost[i[0]] : '서답') : (W.picks[i[0]] || '')}</small></button>`; }).join('')}</div>
      ${S.pickFor ? `<div class="pickrow2"><span>${S.pickFor}번에서 고른 답</span>${PICKS.map(p => `<button type="button" class="chip" data-pick="${p}" aria-pressed="${W.picks[S.pickFor] === p}">${p}</button>`).join('')}<button type="button" class="linkbtn" data-pick="">모름</button></div>` : ''}
      <span class="dl">금색 = 틀림${S.pickOn ? ' · 아래 작은 글자 = 고른 답' : ''}${essays.length ? ` · ${essays.map(i => i[0]).join('·')}번은 서답형 (받은 점수를 아래에)` : ''}</span>
      ${essays.length ? `<div class="essays">${essays.map(i => `<label class="sel"><span>서답 ${i[0]}번</span><span class="einp"><input type="number" step="0.1" min="0" max="${i[1]}" data-ess="${i[0]}" value="${W.partial[i[0]] !== undefined ? esc(W.partial[i[0]]) : ''}" placeholder="${i[1]}"> / ${i[1]}점</span></label>`).join('')}</div>` : ''}
      <div class="kpis4">
        <div class="kpi dark"><span>점수</span><b>${C.score}점</b><small>${C.total}점 만점 · 자동 계산</small></div>
        <div class="kpi"><span>틀린 문항</span><b>${C.wrongNos.length}개</b><small>${C.wrongNos.length ? C.wrongNos.join('·') + '번' : '없음'}</small></div>
        <div class="kpi gold"><span>잃은 점수 1위</span><b class="sm2">${u ? esc(u[0].replace(/^\d+\./, '')) : '—'}</b><small>${u ? Math.round(u[1] * 10) / 10 + '점' : ''}</small></div>
        <div class="kpi"><span>학원생 평균</span><b>${A ? A.score + '점' : '—'}</b><small>${A ? A.n + '명 기준' : '같은 시험 입력 없음'}</small></div></div>
      <div class="stfoot"><label class="chk"><input type="checkbox" id="stAvg" ${S.avgOn ? 'checked' : ''}> 분석지에 학원생 평균 비교 넣기 <small>(같은 시험 입력한 학원생 ${A ? A.n : 0}명)</small></label>
        <div class="row2">${W.saved ? '<button type="button" class="btn ghost sm danger" id="stDelRes">이 시험 결과 지우기</button>' : ''}<button type="button" class="btn ghost" id="stSave">저장</button><button type="button" class="btn gold" id="stReport">저장하고 학생 분석지 만들기</button></div></div>`;
  }

  function bind() {
    $('#stNew').onclick = () => { S.form = { school: S.school || (S.sel && D.students[S.sel] ? D.students[S.sel].school : ''), grade: S.grade || 2 }; render(); };
    $('#stSchool').onchange = ev => { S.school = ev.target.value; keep(); render(); };
    $('#stGrade').onchange = ev => { S.grade = ev.target.value; keep(); render(); };
    let t; $('#stQ').oninput = ev => { clearTimeout(t); t = setTimeout(() => { S.q = ev.target.value; render(); const n = $('#stQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    $$('[data-st]').forEach(b => b.onclick = () => { S.sel = b.dataset.st; S.form = null; S.exam = null; S.work = null; S.pickFor = null; keep(); render(); });
    if (S.form) return bindForm();
    const st = S.sel && D.students[S.sel]; if (!st) return;
    $('#stEdit').onclick = () => { S.form = Object.assign({}, st); render(); };
    const ex = $('#stExam'); if (ex) ex.onchange = () => { S.exam = ex.value; S.work = null; S.pickFor = null; render(); };
    const e = S.exam && byId[S.exam]; if (!e) return;
    const W = S.work;
    $('#stPickOn').onchange = ev => { S.pickOn = ev.target.checked; S.pickFor = null; keep(); render(); };
    $('#stAvg').onchange = ev => { S.avgOn = ev.target.checked; keep(); };
    $$('.nbtn').forEach(b => b.onclick = () => {
      const no = +b.dataset.no, i = e.an.items.find(x => x[0] === no);
      if (i[9]) { // 서답형: 누르면 0점 ↔ 만점
        if (W.partial[no] !== undefined && W.partial[no] !== '' && +W.partial[no] < i[1]) delete W.partial[no]; else W.partial[no] = 0;
        S.pickFor = null; render(); return;
      }
      const k = W.wrong.indexOf(no);
      if (k >= 0) { W.wrong.splice(k, 1); delete W.picks[no]; S.pickFor = null; }
      else { W.wrong.push(no); W.wrong.sort((a, b) => a - b); S.pickFor = S.pickOn ? no : null; }
      render();
    });
    $$('[data-pick]').forEach(b => b.onclick = () => { if (b.dataset.pick) W.picks[S.pickFor] = b.dataset.pick; else delete W.picks[S.pickFor]; S.pickFor = null; render(); });
    $$('[data-ess]').forEach(inp => inp.onchange = () => {
      const no = +inp.dataset.ess, i = e.an.items.find(x => x[0] === no);
      if (inp.value === '' || +inp.value >= i[1]) delete W.partial[no]; else W.partial[no] = Math.max(0, +inp.value);
      render();
    });
    const save = async () => {
      const res = { wrong: W.wrong, picks: W.picks, partial: W.partial, pickOn: S.pickOn };
      const C = window.SudoReport.studentCalc(e, res);
      const doc = { student: st.id, exam: e.id, wrong: W.wrong.slice(), picks: Object.assign({}, W.picks), partial: Object.assign({}, W.partial), pickOn: S.pickOn, score: C.score, total: C.total, at: now() };
      const old = D.results[W.id]; if (old && old.note) doc.note = old.note;
      if (ctx) await ctx.saveResult(W.id, doc);
      D.results[W.id] = Object.assign({ id: W.id }, doc); W.saved = true;
      return doc;
    };
    $('#stSave').onclick = async ev => { ev.currentTarget.disabled = true; try { await save(); toast('저장했습니다'); render(); } catch (er) { toast('저장하지 못했습니다: ' + er.message); ev.currentTarget.disabled = false; } };
    $('#stReport').onclick = async ev => { ev.currentTarget.disabled = true; try { await save(); H.openStudentReport(st.id, e.id, S.avgOn); } catch (er) { toast('저장하지 못했습니다: ' + er.message); ev.currentTarget.disabled = false; } };
    const dr = $('#stDelRes'); if (dr) dr.onclick = async () => {
      if (!confirm(`${st.name} 학생의 ${label(e)} 결과를 지울까요?`)) return;
      try { if (ctx) await ctx.deleteResult(W.id); delete D.results[W.id]; S.work = null; toast('지웠습니다'); render(); } catch (er) { toast('지우지 못했습니다: ' + er.message); }
    };
  }
  function bindForm() {
    const f = S.form;
    $('#fX').onclick = () => { S.form = null; render(); };
    $$('[data-fm]').forEach(b => b.onclick = () => { read(); f.many = b.dataset.fm === 'many'; render(); });
    function read() {
      if ($('#fName')) f.name = $('#fName').value.trim(); if ($('#fNames')) f.names = $('#fNames').value;
      f.school = $('#fSchool').value.trim(); f.grade = +$('#fGrade').value; f.cls = $('#fCls').value.trim(); f.teacher = $('#fTeacher').value.trim();
    }
    $('#fSave').onclick = async ev => {
      read();
      if (f.school && !/중$/.test(f.school)) f.school += '중';
      const names = f.many ? (f.names || '').split(/\n|,/).map(x => x.trim()).filter(Boolean) : [f.name].filter(Boolean);
      if (!names.length) { toast('이름을 넣어 주세요'); return; }
      if (!f.school) { toast('학교를 넣어 주세요'); return; }
      ev.currentTarget.disabled = true;
      try {
        let last = null;
        for (const name of names) {
          const id = f.id || ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
          const doc = { name, school: f.school, grade: f.grade, cls: f.cls || '', teacher: f.teacher || '', addedAt: f.addedAt || now(), editedAt: now() };
          if (ctx) await ctx.saveStudent(id, doc);
          D.students[id] = Object.assign({ id }, doc); last = id;
        }
        toast(f.id ? '저장했습니다' : `${names.length}명을 등록했습니다`);
        S.form = null; S.sel = last; S.school = f.school; S.grade = String(f.grade); S.exam = null; S.work = null; keep(); render();
      } catch (er) { toast('저장하지 못했습니다: ' + er.message); ev.currentTarget.disabled = false; }
    };
    const fd = $('#fDel'); if (fd) fd.onclick = async () => {
      const rs = resultsOf(f.id).map(r => r.id);
      if (!confirm(`${f.name} 학생과 시험 결과 ${rs.length}건을 지울까요?`)) return;
      try { if (ctx) await ctx.deleteStudent(f.id, rs); rs.forEach(r => delete D.results[r]); delete D.students[f.id]; S.form = null; S.sel = null; keep(); toast('지웠습니다'); render(); }
      catch (er) { toast('지우지 못했습니다: ' + er.message); }
    };
  }
  return { render, reportData, average, studs, resultsOf, label };
};
