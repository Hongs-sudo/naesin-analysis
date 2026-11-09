// 수학도서관 통합 2단계 — 통합 미리보기 (원장님만, 읽기만)
// 내신분석(sudo-naesin) 데이터와 오답노트(sudo-odap) 데이터를 나란히 세고, 겹치는 자료·학생·선생님을 찾아 보여 준다.
// 어떤 데이터도 쓰거나 지우지 않는다. '보고서 내려받기'는 읽은 내용 전체를 JSON 파일로 저장(첫 번째 백업).
window.SudoMerge = function (H) {
  const { D, ctx, esc, toast, $, $$ } = H;
  const ODAP = { apiKey: 'AIzaSyBjsP047j1IHSmObLP8-sRrqWnZb81R2Bg', authDomain: 'sudo-odap.firebaseapp.com', projectId: 'sudo-odap', appId: '1:723497466991:web:15675e85baf3812f4f219a' };
  const V = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const M = { mods: null, odap: null, naesin: null, rep: null, busy: '', err: '', tab: 'same', stab: 'both', user: null };

  // ---------- 오답노트 Firebase (따로 로그인, 읽기만) ----------
  function mods() {
    if (!M.mods) M.mods = Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-auth.js'), import(V + 'firebase-firestore.js')])
      .then(([A, AU, F]) => { const app = A.getApps().find(a => a.name === 'odap') || A.initializeApp(ODAP, 'odap'); return { A, AU, F, app, auth: AU.getAuth(app), db: F.getFirestore(app) }; });
    return M.mods;
  }
  async function currentOdapUser() {
    const m = await mods();
    await new Promise(r => { const u = m.AU.onAuthStateChanged(m.auth, () => { u(); r(); }); setTimeout(r, 3000); });
    return m.auth.currentUser;
  }
  const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && typeof x.toMillis === 'function') ? new Date(x.toMillis()).toISOString() : x));
  async function readOdap() {
    const m = await mods(), { F, db } = m, u = m.auth.currentUser;
    const me = await F.getDoc(F.doc(db, 'users', u.uid));
    if (!me.exists() || !me.data().academyId) throw new Error('오답노트에서 이 계정의 학원을 찾지 못했습니다');
    const aid = me.data().academyId;
    const ac = await F.getDoc(F.doc(db, 'academies', aid));
    const all = async name => { M.busy = `오답노트 읽는 중 · ${name}`; paint(); const s = await F.getDocs(F.collection(db, 'academies', aid, name)); return s.docs.map(d => Object.assign({ id: d.id }, plain(d.data()))); };
    const out = { academyId: aid, academy: ac.exists() ? plain(ac.data()) : null, readAt: new Date().toISOString(), by: u.email };
    for (const n of ['members', 'bookSets', 'books', 'students', 'catalogBooks', 'catalogInfo', 'bankItems', 'examScopes', 'aiUsage', 'settings']) {
      try { out[n] = await all(n); } catch (e) { out[n] = []; out.errors = (out.errors || []).concat(`${n}: ${e.message}`); }
    }
    try { out.analysisQueueCount = (await F.getCountFromServer(F.collection(db, 'academies', aid, 'analysisQueue'))).data().count; } catch (_) { out.analysisQueueCount = null; }
    return out;
  }
  async function readNaesin() {
    let members = [];
    try { members = await ctx.listMembers(); } catch (_) {}
    const exams = D.exams.map(e => ({ id: e.id, school: e.s, year: e.y, grade: e.g, sem: e.t, exam: e.x, files: (e.fl || []).map(f => ({ path: f[0], role: f[1], variant: f[2] || '' })), stats: e.st || null,
      analysis: e.an ? { status: e.an.status, level: e.an.level || null, items: (H.reg && H.reg.docFromAn) ? H.reg.docFromAn(e.an).items : [] } : null }));
    return { readAt: new Date().toISOString(), exams, materials: Object.values(D.materials || {}), students: Object.entries(D.students || {}).map(([id, s]) => Object.assign({ id }, s)),
      results: Object.entries(D.results || {}).map(([id, r]) => Object.assign({ id }, r)), members, catalogSize: (D.catalog || []).length };
  }

  // ---------- 겹침 찾기 ----------
  const base = p => String(p || '').split(/[\\/]/).pop();
  const stem = n => base(n).replace(/\.[^.]+$/, '');
  const norm = s => String(s || '').normalize('NFC').toLowerCase().replace(/_?unlocked/g, '').replace(/[\s_\-·.,()[\]{}]+/g, '');
  // 판을 뺀 이름: 연도·개정·교사용/학생용·정답 같은 말을 지움
  const title = s => norm(stem(s).replace(/20\d\d(학년도|년)?|\d\d개정|개정판?|교사용|학생용|정답(및|과)?(해설|풀이)?|해설|답지|수정본|최종|v\d+|\(\d\)/g, ''));
  const tokens = s => new Set(stem(s).normalize('NFC').toLowerCase().split(/[^0-9a-z가-힣]+/).filter(t => t.length >= 2 && !/^20\d\d$/.test(t)));
  const jac = (a, b) => { let n = 0; a.forEach(x => { if (b.has(x)) n++; }); return n / Math.max(1, a.size + b.size - n); };
  function filesOf(N, O) {
    const nf = [], of = [];
    N.exams.forEach(e => e.files.forEach(f => nf.push({ app: 'n', kind: '기출', name: base(f.path), path: f.path, size: 0, where: `${e.school} ${e.year} ${e.grade}-${e.sem} ${e.exam}` })));
    N.materials.forEach(m => nf.push({ app: 'n', kind: '자료실', name: base(m.path) || m.name, path: m.path || '', size: m.size || 0, where: m.name }));
    (O.catalogBooks || []).forEach(b => (b.files || []).forEach(f => of.push({ app: 'o', kind: b.kind || '교재', name: base(f.rel), path: f.rel, size: f.size || 0, where: b.title })));
    (O.books || []).forEach(b => ['mainFile', 'answerFile'].forEach(k => { const f = b[k]; if (f && f.name) of.push({ app: 'o', kind: '올린 교재', name: f.name, path: '', size: f.size || 0, where: b.title }); }));
    return { nf, of };
  }
  function matchFiles(nf, of) {
    const byName = new Map(); of.forEach(f => { const k = norm(stem(f.name)); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(f); });
    const byTitle = new Map(); of.forEach(f => { const k = title(f.name); if (k.length >= 4) { if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(f); } });
    const otok = of.map(f => ({ f, t: tokens(f.name) }));
    const out = [], usedO = new Set();
    nf.forEach(n => {
      const same = (byName.get(norm(stem(n.name))) || []).find(o => !n.size || !o.size || o.size === n.size);
      if (same) { out.push({ k: 'same', n, o: same }); usedO.add(same); return; }
      const ed = (byTitle.get(title(n.name)) || [])[0];
      if (ed) { out.push({ k: 'ed', n, o: ed }); usedO.add(ed); return; }
      const nt = tokens(n.name); if (nt.size < 2) return;
      let best = null, bs = 0; for (const x of otok) { const s = jac(nt, x.t); if (s > bs) { bs = s; best = x.f; } }
      if (best && bs >= 0.6) { out.push({ k: 'chk', n, o: best, s: bs }); usedO.add(best); }
    });
    return { pairs: out, onlyO: of.filter(f => !usedO.has(f)).length };
  }
  const schoolKey = s => { s = String(s || '').replace(/\s/g, '').replace(/중학교$/, '중').replace(/여자중$/, '여중'); return s && !/중$/.test(s) ? s + '중' : s; };
  const gradeKey = g => { const m = String(g || '').match(/[1-3]/); return m ? +m[0] : 0; };
  function matchStudents(N, O) {
    const tname = {}; (O.members || []).forEach(m => { tname[m.id] = m.name || m.email || ''; });
    const ns = N.students.map(s => ({ name: String(s.name || '').trim(), school: schoolKey(s.school), grade: gradeKey(s.grade), teacher: s.teacher || s.owner || '' }));
    const os = (O.students || []).map(s => ({ name: String(s.name || '').trim(), school: schoolKey(s.school), grade: gradeKey(s.grade), teacher: tname[s.teacherUid] || '', recs: (s.records || []).length, wrongs: (s.records || []).reduce((a, r) => a + (r.wrongs || []).length, 0) }));
    const rows = [], usedO = new Set();
    ns.forEach(n => {
      const same = os.find(o => !usedO.has(o) && o.name === n.name && o.school === n.school && o.grade === n.grade);
      if (same) { usedO.add(same); rows.push({ k: 'both', n, o: same }); return; }
      const near = os.find(o => !usedO.has(o) && o.name === n.name && (o.school === n.school || !o.school || !n.school));
      if (near) { usedO.add(near); rows.push({ k: 'chk', n, o: near }); return; }
      rows.push({ k: 'n', n });
    });
    os.filter(o => !usedO.has(o)).forEach(o => rows.push({ k: 'o', o }));
    return rows;
  }
  function analyze(N, O) {
    const { nf, of } = filesOf(N, O), fm = matchFiles(nf, of);
    const nItems = N.exams.reduce((a, e) => a + (e.analysis ? e.analysis.items.length : 0), 0) + N.materials.reduce((a, m) => a + ((m.problems || []).filter(p => !p.skip).length), 0);
    const nChecked = N.exams.filter(e => e.analysis && e.analysis.status !== 'ai').reduce((a, e) => a + e.analysis.items.length, 0);
    const bank = O.bankItems || [];
    const recs = (O.students || []).reduce((a, s) => a + (s.records || []).length, 0);
    const wrongs = (O.students || []).flatMap(s => (s.records || []).flatMap(r => r.wrongs || []));
    // 단원 연결: 오답노트 문항 은행의 단원 이름이 내신분석 단원·유형 목록에 있는지
    const names = new Set(); (D.catalog || []).forEach(c => { [c[4], c[6]].forEach(x => { if (x) names.add(norm(x)); }); });
    const units = [...new Set(bank.map(b => String(b.unit || '').replace(/^\s*[\dⅠ-Ⅹ]+[.)]\s*/, '').trim()).filter(Boolean))];
    const linked = units.filter(u => names.has(norm(u)) || [...names].some(x => x.length >= 3 && (norm(u).includes(x) || x.includes(norm(u))))).length;
    const tEmails = new Set((N.members || []).map(m => String(m.email || '').toLowerCase()).concat(['ilmvm66@gmail.com']));
    const teachers = (O.members || []).map(m => ({ name: m.name || '', email: m.email || '', role: m.role || '', has: tEmails.has(String(m.email || '').toLowerCase()) }));
    const students = matchStudents(N, O);
    const hwpOnly = N.exams.filter(e => e.files.length && e.files.every(f => /\.hwpx?$/i.test(f.path))).length;
    const cautions = [];
    if (hwpOnly) cautions.push(`한글 파일만 있는 시험 ${hwpOnly}건 — PDF로 바꿔야 문항을 읽을 수 있습니다`);
    const unanalyzed = N.exams.filter(e => !e.analysis && e.files.length).length; if (unanalyzed) cautions.push(`파일은 있지만 아직 분석하지 않은 시험 ${unanalyzed}건`);
    const noDate = (O.students || []).reduce((a, s) => a + (s.records || []).filter(r => !r.at).length, 0); if (noDate) cautions.push(`날짜가 없는 오답 기록 ${noDate}건`);
    const zipped = (O.catalogBooks || []).filter(b => b.zipped).length; if (zipped) cautions.push(`압축 파일만 있는 교재 ${zipped}개 — 풀어서 PDF로 두어야 합니다`);
    const review = (O.catalogBooks || []).filter(b => b.review).length; if (review) cautions.push(`오답노트 교재 정리에서 '확인 필요'로 남은 교재 ${review}개`);
    if (O.errors) cautions.push('오답노트에서 일부를 읽지 못했습니다: ' + O.errors.join(' / '));
    return {
      tiles: {
        files: { n: nf.length, o: of.length, same: fm.pairs.filter(p => p.k === 'same').length, ed: fm.pairs.filter(p => p.k === 'ed').length, chk: fm.pairs.filter(p => p.k === 'chk').length },
        items: { n: nItems, o: bank.length, nChecked, oChecked: bank.filter(b => b.status && b.status !== 'review').length },
        students: { n: N.students.length, o: (O.students || []).length, both: students.filter(s => s.k === 'both').length, chk: students.filter(s => s.k === 'chk').length },
        teachers: { n: (N.members || []).length, o: teachers.length, move: teachers.filter(t => !t.has).length },
        recs: { o: recs, wrongs: wrongs.length, cause: wrongs.filter(w => w.cause).length },
        units: { total: units.length, linked },
        books: { sets: (O.bookSets || []).length, books: (O.books || []).length, catalog: (O.catalogBooks || []).length, queue: O.analysisQueueCount }
      },
      pairs: fm.pairs, onlyO: fm.onlyO, students, teachers, cautions
    };
  }

  // ---------- 화면 ----------
  const paint = () => { if ((location.hash || '') === '#merge') render(); };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const n0 = v => (v === null || v === undefined) ? '—' : Number(v).toLocaleString();
  function tile(t, n, o, sub) { return `<div class="mgtile"><b>${t}</b><div class="mgnums"><span><strong>${n0(n)}</strong>내신분석</span><span><strong>${n0(o)}</strong>오답노트</span></div><span class="dl">${sub}</span></div>`; }
  async function render() {
    const main = $('#main');
    if (!M.user && !M.checked) { M.checked = true; currentOdapUser().then(u => { M.user = u; paint(); }).catch(() => {}); }
    else mods().catch(() => {});
    const R = M.rep;
    main.innerHTML = `
      <div class="head"><div><div class="kicker">원장님만 · 읽기만 함 · 데이터는 바꾸지 않습니다</div><h1>통합 미리보기</h1></div>
        <div class="headact">${R ? '<button type="button" class="btn ghost" id="mgRead">다시 읽기</button><button type="button" class="btn" id="mgDown">보고서 내려받기 (백업)</button>' : ''}</div></div>
      <p class="dl">내신분석 앱과 오답노트 앱을 합치기 전에, 두 앱에 무엇이 얼마나 있고 무엇이 겹치는지 보여 줍니다. 묶음은 제안일 뿐 저장하지 않습니다.</p>
      <section class="card mgsrc">
        <span><b>내신분석</b> <span class="dl">${M.naesin ? '읽음 · ' + new Date(M.naesin.readAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '아직'}</span></span>
        <span><b>오답노트</b> <span class="dl">${M.odap ? `읽음 · ${esc(M.odap.by)} · 학원 ${esc((M.odap.academy && M.odap.academy.name) || '')}` : M.user ? `${esc(M.user.email)}로 로그인됨` : '로그인 필요'}</span></span>
        ${!R ? `<button type="button" class="btn" id="mgRead" ${M.busy ? 'disabled' : ''}>${M.user ? '두 앱 읽기' : '오답노트 계정으로 로그인하고 읽기'}</button>` : ''}
        ${M.busy ? `<span class="dl">${esc(M.busy)}</span>` : ''}${M.err ? `<span class="goldt">${esc(M.err)}</span>` : ''}
      </section>
      ${R ? report(R) : `<div class="empty">‘${M.user ? '두 앱 읽기' : '오답노트 계정으로 로그인하고 읽기'}’를 누르면 오답노트(sudo-odap)를 같은 Google 계정으로 읽습니다. 로그인 창이 한 번 뜹니다.</div>`}`;
    const rd = $('#mgRead'); if (rd) rd.onclick = run;
    const dn = $('#mgDown'); if (dn) dn.onclick = download;
    $$('[data-mt]').forEach(b => b.onclick = () => { M.tab = b.dataset.mt; render(); });
    $$('[data-ms]').forEach(b => b.onclick = () => { M.stab = b.dataset.ms; render(); });
  }
  function report(R) {
    const T = R.tiles, P = R.pairs.filter(p => p.k === M.tab), S = R.students.filter(s => s.k === M.stab);
    const KN = { same: ['같은 파일', 'p-ok'], ed: ['다른 판', 'p-gold'], chk: ['확인 필요', 'p-warn'] };
    const SN = { both: ['같은 학생', 'p-ok'], chk: ['확인', 'p-warn'], n: ['내신분석에만', 'p-gold'], o: ['오답노트에만', 'p-gold'] };
    return `
      <div class="mgtiles">
        ${tile('자료 (파일)', T.files.n, T.files.o, `겹침 ${T.files.same + T.files.ed} · 확인 필요 ${T.files.chk}`)}
        ${tile('문항', T.items.n, T.items.o, `검수 끝 내신 ${n0(T.items.nChecked)} · 오답 ${n0(T.items.oChecked)}`)}
        ${tile('학생', T.students.n, T.students.o, `같은 학생 ${T.students.both} · 확인 ${T.students.chk}`)}
        ${tile('선생님', T.teachers.n, T.teachers.o, `새로 옮길 분 ${T.teachers.move}`)}
        ${tile('오답 기록', null, T.recs.o, `틀린 문항 ${n0(T.recs.wrongs)} · 틀린 이유 있음 ${pct(T.recs.cause, T.recs.wrongs)}%`)}
      </div>
      <section class="card"><h2>오답노트 교재 <small>세트 ${T.books.sets} · 교재 ${T.books.books} · 교재 정리 목록 ${T.books.catalog}${T.books.queue !== null ? ` · 분석 대기 ${T.books.queue}` : ''}</small></h2>
        <p class="dl">문항 은행 단원 ${T.units.total}개 중 ${T.units.linked}개(${pct(T.units.linked, T.units.total)}%)가 내신분석 단원·유형 목록과 이름으로 이어집니다. 나머지는 3단계에서 짝을 지어야 합니다.</p></section>
      <section class="card"><div class="mghead"><h2>자료 겹침 <small>원본(MYBOX)은 그대로, 앱 목록에서만 묶을 예정 · 오답노트에만 있는 파일 ${n0(R.onlyO)}개</small></h2>
        <div class="seg">${Object.entries(KN).map(([k, v]) => `<button type="button" data-mt="${k}" class="${M.tab === k ? 'on' : ''}">${v[0]} ${R.pairs.filter(p => p.k === k).length}</button>`).join('')}</div></div>
        <div class="tablewrap"><table class="mgtbl"><thead><tr><th>묶음</th><th>내신분석</th><th>오답노트</th><th>대표로 쓸 것 (제안)</th></tr></thead><tbody>
        ${P.slice(0, 80).map(p => `<tr><td><span class="pill ${KN[p.k][1]}">${KN[p.k][0]}</span></td><td>${esc(p.n.name)}<br><small class="dl">${esc(p.n.kind)} · ${esc(p.n.where)}</small></td><td>${esc(p.o.name)}<br><small class="dl">${esc(p.o.kind)} · ${esc(p.o.where)}</small></td>
          <td>${p.k === 'same' ? '그대로 하나로' : p.k === 'ed' ? (/(20\d\d)/.test(p.n.name) && /(20\d\d)/.test(p.o.name) ? `${Math.max(+p.n.name.match(/20\d\d/)[0], +p.o.name.match(/20\d\d/)[0])}판 · 다른 판은 ‘예전 판’` : '최신 판 · 다른 판은 ‘예전 판’') : '원장님이 보고 정함'}</td></tr>`).join('') || '<tr><td colspan="4" class="dl">없습니다</td></tr>'}
        </tbody></table></div>${P.length > 80 ? `<p class="dl">${P.length}개 중 80개만 보여 줍니다. 전체는 보고서 파일에 있습니다.</p>` : ''}</section>
      <section class="card"><div class="mghead"><h2>학생 <small>이름 + 학교 + 학년이 같으면 같은 학생</small></h2>
        <div class="seg">${Object.entries(SN).map(([k, v]) => `<button type="button" data-ms="${k}" class="${M.stab === k ? 'on' : ''}">${v[0]} ${R.students.filter(s => s.k === k).length}</button>`).join('')}</div></div>
        <div class="tablewrap"><table class="mgtbl"><thead><tr><th>학생</th><th>내신분석</th><th>오답노트</th><th>상태</th></tr></thead><tbody>
        ${S.slice(0, 120).map(s => { const a = s.n || s.o; return `<tr><td>${esc(a.name)}</td><td>${s.n ? `${esc(s.n.school)} ${s.n.grade || ''} · ${esc(s.n.teacher)}` : '—'}</td><td>${s.o ? `${esc(s.o.school)} ${s.o.grade || ''} · ${esc(s.o.teacher)} · 기록 ${s.o.recs}` : '—'}</td><td><span class="pill ${SN[s.k][1]}">${SN[s.k][0]}</span></td></tr>`; }).join('') || '<tr><td colspan="4" class="dl">없습니다</td></tr>'}
        </tbody></table></div></section>
      <section class="card"><h2>선생님 계정 <small>오답노트 선생님 → 내신분석 ‘선생님’ 권한으로</small></h2>
        <div class="tablewrap"><table class="mgtbl"><thead><tr><th>이름</th><th>이메일</th><th>오답노트 권한</th><th>내신분석</th></tr></thead><tbody>
        ${R.teachers.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.role)}</td><td>${t.has ? '<span class="pill p-ok">이미 있음</span>' : '<span class="pill p-gold">새로 옮김</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="dl">없습니다</td></tr>'}
        </tbody></table></div></section>
      ${R.cautions.length ? `<section class="card"><h2>옮길 때 주의할 것</h2><ul class="newslist">${R.cautions.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>` : ''}`;
  }
  async function run() {
    M.err = '';
    try {
      const m = await mods();
      if (!m.auth.currentUser) {
        const p = new m.AU.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account', login_hint: 'ilmvm66@gmail.com' });
        await m.AU.signInWithPopup(m.auth, p);
      }
      M.user = m.auth.currentUser;
      M.busy = '내신분석 읽는 중'; paint();
      M.naesin = await readNaesin();
      M.odap = await readOdap();
      M.busy = '겹침 찾는 중'; paint();
      M.rep = analyze(M.naesin, M.odap);
      M.busy = '';
      toast('두 앱을 읽었습니다. 아무것도 바꾸지 않았습니다');
    } catch (e) { M.busy = ''; M.err = /popup/i.test(e.code || e.message) ? '로그인 창이 막혔거나 닫혔습니다. 다시 눌러 주세요' : '읽지 못했습니다: ' + (e.message || e); }
    render();
  }
  function download() {
    if (!M.rep) return;
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const R = M.rep, data = { kind: '수학도서관 통합 미리보기 · 백업', exportedAt: d.toISOString(), note: '읽기만 해서 만든 파일입니다. 문항 그림(img)은 크기 때문에 빠져 있습니다.',
      summary: { tiles: R.tiles, cautions: R.cautions, files: R.pairs.map(p => ({ k: p.k, naesin: p.n, odap: p.o })), students: R.students, teachers: R.teachers },
      naesin: M.naesin, odap: M.odap };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `수학도서관-통합미리보기-${stamp}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(`보고서를 내려받았습니다 (${(blob.size / 1048576).toFixed(1)}MB)`);
  }
  return { render, analyze, matchFiles, matchStudents };
};
