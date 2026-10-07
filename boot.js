// 수도 내신분석 — Firebase 로그인·데이터 읽기·첫 가져오기
(function () {
  const firebaseConfig = {
    apiKey: 'AIzaSyCkLTkcgzVqVYVAq2qCnbq7HHKbggUo9PQ',
    authDomain: 'sudo-naesin.firebaseapp.com',
    projectId: 'sudo-naesin',
    storageBucket: 'sudo-naesin.firebasestorage.app',
    messagingSenderId: '754171401551',
    appId: '1:754171401551:web:8f351feecbc0d6d9e0e13a'
  };
  document.body.dataset.mode = innerWidth >= 1200 ? 'pc' : innerWidth >= 768 ? 'tab' : 'phone';
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const main = document.getElementById('main');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let started = false;

  function screen(html) { main.innerHTML = `<section class="card gate">${html}</section>`; }

  function loginScreen(msg) {
    screen(`<h1>수도 내신분석</h1>
      <p>수학도서관 원장님 Google 계정으로 로그인하면 시험지 보관함과 학교별 분석을 볼 수 있습니다.</p>
      ${msg ? `<p class="callout">${esc(msg)}</p>` : ''}
      <button type="button" class="primary" id="login">Google로 로그인</button>`);
    document.getElementById('login').onclick = () => {
      const pv = new firebase.auth.GoogleAuthProvider();
      // 홈 화면에 설치한 앱(특히 아이폰·아이패드)은 팝업이 막힐 수 있어 화면 전환 방식으로 한 번 더 시도
      auth.signInWithPopup(pv).catch(e => {
        if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || '')) return auth.signInWithRedirect(pv);
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') loginScreen('로그인하지 못했습니다: ' + e.message);
      });
    };
  }

  // Firestore 문서 → 화면이 쓰는 모양(D)
  async function load() {
    const [ex, an, ty, meta, dr, ai] = await Promise.all([
      db.collection('exams').get(), db.collection('analyses').get(), db.collection('types').get(), db.doc('meta/info').get(),
      db.collection('drafts').get(), db.doc('meta/ai').get()]);
    if (ex.empty) return null;
    const types = ty.docs.map(d => d.data()).sort((a, b) =>
      a.course.localeCompare(b.course) || a.midNo.localeCompare(b.midNo) || a.typeNo.localeCompare(b.typeNo));
    const idx = {}; types.forEach((t, i) => { idx[t.code] = i; });
    const DIFF = { 기본: 1, 응용: 2, 실력: 3, 심화: 4 };
    const BEH = { 이해: 'U', 계산: 'C', 추론: 'R', 문제해결: 'P' };
    const analyzed = {};
    an.docs.forEach(d => {
      const a = d.data();
      analyzed[d.id] = {
        level: a.level || null, cuts: a.cuts || {}, essay: a.essay || 0, source: a.source || null,
        items: (a.items || []).map(i => [i.no, i.pts, DIFF[i.diff] || 0, BEH[i.beh] || '', i.course || '', i.big || '', i.mid || '', i.type || '',
          i.code && idx[i.code] !== undefined ? idx[i.code] : -1, i.essay ? 1 : 0, i.ans || '', i.sol || ''])
      };
    });
    const exams = ex.docs.map(d => {
      const e = d.data();
      return { id: d.id, s: e.school, m: e.main ? 1 : 0, y: e.year, g: e.grade, t: e.sem, x: e.exam,
        p: e.hasPaper ? 1 : 0, a: e.hasAnswer ? 1 : 0, sc: e.hasPoints ? 1 : 0, r: e.hasRubric ? 1 : 0, f: e.formats || [],
        fl: (e.files || []).map(f => [f.path, f.role, f.variant || '']), pr: e.primary || '', n: e.notes || [] };
    });
    const m = meta.exists ? meta.data() : {};
    return { v: 1, built: m.built || '', root: m.root || '', exams, analyzed,
      catalog: types.map(t => [t.code, t.course, t.big, t.midNo, t.mid, t.typeNo, t.name || '']), predicted: m.predicted || [],
      drafts: Object.fromEntries(dr.docs.map(d => [d.id, d.data()])), ai: ai.exists ? ai.data() : null };
  }

  // 받은 데이터 파일(앱용 JSON)을 Firestore에 넣는다
  async function importFile(file, log) {
    const D = JSON.parse(await file.text());
    if (!D.exams || !D.catalog || !D.analyzed) throw new Error('수도 내신분석 데이터 파일이 아닙니다.');
    const DIFF = ['', '기본', '응용', '실력', '심화'];
    const BEH = { U: '이해', C: '계산', R: '추론', P: '문제해결' };
    const ops = [];
    D.catalog.forEach(c => ops.push(['types', c[0], { code: c[0], course: c[1], big: c[2], midNo: c[3], mid: c[4], typeNo: c[5], name: c[6] || '' }]));
    D.exams.forEach(e => ops.push(['exams', e.id, { school: e.s, main: !!e.m, year: e.y, grade: e.g, sem: e.t, exam: e.x,
      hasPaper: !!e.p, hasAnswer: !!e.a, hasPoints: !!e.sc, hasRubric: !!e.r, formats: e.f,
      files: e.fl.map(f => ({ path: f[0], role: f[1], variant: f[2] })), primary: e.pr, notes: e.n }]));
    Object.entries(D.analyzed).forEach(([id, a]) => ops.push(['analyses', id, { level: a.level || null, cuts: a.cuts || {}, essay: a.essay || 0,
      items: a.items.map(i => ({ no: i[0], pts: i[1], diff: DIFF[i[2]] || '', beh: BEH[i[3]] || '', course: i[4], big: i[5], mid: i[6], type: i[7],
        code: i[8] >= 0 ? D.catalog[i[8]][0] : '', essay: !!i[9] })) }]));
    ops.push(['meta', 'info', { built: D.built || '', root: D.root || '', predicted: D.predicted || [], importedAt: new Date().toISOString() }]);
    for (let k = 0; k < ops.length; k += 400) {
      const b = db.batch();
      ops.slice(k, k + 400).forEach(([c, id, data]) => b.set(db.collection(c).doc(id), data));
      await b.commit();
      log(`${Math.min(k + 400, ops.length)} / ${ops.length}건 저장`);
    }
  }

  function importScreen(user) {
    screen(`<h1>처음 한 번, 데이터 넣기</h1>
      <p>아직 저장된 시험이 없습니다. 채팅에서 받은 <b>sudo-naesin-app-data.json</b> 파일을 고르면 시험·문항·단원·유형이 저장됩니다. 한 번만 하면 됩니다.</p>
      <label class="primary" for="file">데이터 파일 고르기</label><input type="file" id="file" accept=".json,application/json" hidden>
      <p class="dl" id="log">${esc(user.email)} 로 로그인됨</p>`);
    document.getElementById('file').onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return;
      const log = t => { document.getElementById('log').textContent = t; };
      try { await importFile(f, log); log('저장 끝. 화면을 불러옵니다…'); boot(user); }
      catch (e) { log('저장하지 못했습니다: ' + e.message); }
    };
  }

  async function boot(user) {
    screen('<p class="dl">불러오는 중…</p>');
    let D;
    try { D = await load(); }
    catch (e) {
      if (e.code === 'permission-denied') return loginScreen(`${user.email} 계정에는 볼 수 있는 권한이 없습니다. 원장님 계정으로 로그인해 주세요.`);
      return screen(`<p>데이터를 불러오지 못했습니다: ${esc(e.message)}</p>`);
    }
    if (!D) return importScreen(user);
    const ctx = {
      user: user.email,
      signOut: () => auth.signOut(),
      shareReport: (id, data) => db.collection('shared').doc(id).set(data),
      saveTypeName: (code, name) => db.collection('types').doc(code).update({ name, editedAt: new Date().toISOString() }),
      getToken: () => auth.currentUser.getIdToken(),
      saveAI: s => db.doc('meta/ai').set(s),
      saveDraft: (id, d) => db.collection('drafts').doc(id).set(d),
      deleteDraft: id => db.collection('drafts').doc(id).delete(),
      // 검수 끝난 문항표 저장: 새 유형 → 시험(새 시험이면) → 분석 → 임시본 지우기를 한 번에
      saveAnalysis: async ({ id, exam, analysis, newTypes }) => {
        const b = db.batch();
        (newTypes || []).forEach(t => b.set(db.collection('types').doc(t.code), t));
        if (exam) b.set(db.collection('exams').doc(id), exam, { merge: true });
        b.set(db.collection('analyses').doc(id), analysis);
        b.delete(db.collection('drafts').doc(id));
        await b.commit();
      }
    };
    if (!started) { started = true; window.startApp(D, ctx); }
    else location.reload();
  }

  auth.getRedirectResult().catch(e => loginScreen('로그인하지 못했습니다: ' + e.message));
  auth.onAuthStateChanged(u => { if (u) boot(u); else { started = false; loginScreen(); } });
})();
