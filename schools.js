// 수도 내신분석 — 학교 소식: 나이스 학사일정(시험 기간·D-day·바뀐 것) + 학교알리미 학업성취 붙여 넣기
// 데이터: Firestore meta/neis = { schools: {학교코드: {...events}}, news: [...], achieve: {학교코드: {'연도-학기-학년': {...}}} }
// 나이스는 Worker(/neis/...)를 거쳐 부른다. 키는 Worker에만 있다. 하루 한 번(원장·원장 공동이 앱을 열 때) 저절로 확인.
window.SudoSchools = function (H) {
  const { D, ctx, byId, esc, toast, $, $$ } = H;
  const CAN = (ctx && ctx.can) || {};
  const canSync = !!(ctx && CAN.aiSettings && ctx.getNeis);
  const S = { data: null, state: 'idle', msg: '', open: null, loading: null };
  // 처음 관리 학교 (원장님 4개교 + 11-03에 확인한 학교)
  const SEED = [['목운중', ''], ['신목중', ''], ['양정중', ''], ['월촌중', ''], ['양동중', '7081508'], ['당산서중', '7041172'], ['명덕여중', '7081519'], ['염창중', '7081512']];
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const toDate = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const md = s => { const d = toDate(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dday = s => Math.round((toDate(s) - today()) / 864e5);
  const short = n => String(n || '').replace(/학교$/, '').replace(/여자중$/, '여중').replace(/남자중$/, '남중');
  const url = () => ((D.ai && D.ai.url) || '').replace(/\/+$/, '');

  async function api(path) {
    if (!url()) throw Object.assign(new Error('AI 연결(Worker 주소)이 먼저 설정되어야 합니다'), { code: 'nourl' });
    const r = await fetch(url() + path, { headers: { Authorization: 'Bearer ' + await ctx.getToken() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((d.error && d.error.message) || 'HTTP ' + r.status), { code: (d.error && d.error.code) || 'http' });
    return d;
  }
  // 나이스 응답 → 줄 목록 (자료 없음은 빈 목록)
  function rows(d, svc) {
    if (d.RESULT) { if (d.RESULT.CODE === 'INFO-200') return []; throw new Error(`나이스: ${d.RESULT.MESSAGE || d.RESULT.CODE}`); }
    const arr = d[svc]; if (!Array.isArray(arr)) return [];
    const head = (arr[0] && arr[0].head) || [];
    const res = head.find(x => x.RESULT); if (res && res.RESULT.CODE !== 'INFO-000') throw new Error(`나이스: ${res.RESULT.MESSAGE}`);
    return (arr[1] && arr[1].row) || [];
  }
  // 행사 종류: exam(지필) · perf(수행) · off(휴업) · etc
  function kindOf(n, off) {
    if (/수행/.test(n)) return 'perf';
    if (/(중간|기말|[1-4]\s*회)\s*(고사|평가)|지필|정기\s*고사/.test(n)) return 'exam';
    if (/휴업/.test(off || '') && !/토요/.test(n)) return 'off';
    return 'etc';
  }
  const examName = (n, d) => {
    const sem = (+d.slice(4, 6) >= 8 || +d.slice(4, 6) <= 2) ? 2 : 1;
    const x = /기말|2\s*회/.test(n) ? '기말' : /중간|1\s*회/.test(n) ? '중간' : '';
    return x ? `${sem}학기 ${x}고사` : n.replace(/\s+/g, ' ').trim();
  };
  // 시험 날짜들을 학년별 기간으로 묶기 → [{label, start, end, grades}]
  function periods(events) {
    const byKey = new Map();
    (events || []).filter(e => e.k === 'exam').forEach(e => {
      const label = examName(e.n, e.d);
      (e.g.length ? e.g : [0]).forEach(g => { const k = `${label}|${g}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e.d); });
    });
    const out = [];
    byKey.forEach((ds, k) => {
      const [label, g] = k.split('|'); ds = [...new Set(ds)].sort();
      let st = ds[0], prev = ds[0];
      const push = () => out.push({ label, start: st, end: prev, g: +g });
      for (let i = 1; i < ds.length; i++) { if ((toDate(ds[i]) - toDate(prev)) / 864e5 > 4) { push(); st = ds[i]; } prev = ds[i]; }
      push();
    });
    // 같은 기간·이름이면 학년을 합친다
    const m = new Map();
    out.forEach(p => { const k = `${p.label}|${p.start}|${p.end}`; if (!m.has(k)) m.set(k, Object.assign({}, p, { grades: [] })); if (p.g) m.get(k).grades.push(p.g); });
    return [...m.values()].map(p => Object.assign(p, { grades: p.grades.sort() })).sort((a, b) => a.start.localeCompare(b.start));
  }
  const gradeTxt = gs => gs.length ? (gs.length === 3 ? '전 학년' : gs.map(g => g + '학년').join('·')) : '';
  const range = p => p.start === p.end ? md(p.start) : `${md(p.start)}~${md(p.end)}`;

  // ---------- 불러오기 · 저장 ----------
  async function load() {
    if (S.data) return S.data;
    if (!S.loading) S.loading = (ctx && ctx.getNeis ? ctx.getNeis() : Promise.resolve(null)).then(d => { S.data = Object.assign({ schools: {}, news: [], achieve: {} }, d || {}); return S.data; }, () => { S.data = { schools: {}, news: [], achieve: {} }; return S.data; });
    return S.loading;
  }
  async function findSchool(name, atpt) {
    const q = `/neis/schoolInfo?SCHUL_NM=${encodeURIComponent(name)}${atpt ? '&ATPT_OFCDC_SC_CODE=' + atpt : ''}&pSize=20`;
    return rows(await api(q), 'schoolInfo').map(r => ({ code: r.SD_SCHUL_CODE, atpt: r.ATPT_OFCDC_SC_CODE, name: short(r.SCHUL_NM), full: r.SCHUL_NM, kind: r.SCHUL_KND_SC_NM, edu: r.ATPT_OFCDC_SC_NM, addr: r.ORG_RDNMA || '', tel: r.ORG_TELNO || '', home: r.HMPG_ADRES || '' }));
  }
  async function infoByCode(code) {
    const r = rows(await api(`/neis/schoolInfo?SD_SCHUL_CODE=${code}`), 'schoolInfo')[0];
    return r ? { code: r.SD_SCHUL_CODE, atpt: r.ATPT_OFCDC_SC_CODE, name: short(r.SCHUL_NM), kind: r.SCHUL_KND_SC_NM, addr: r.ORG_RDNMA || '', tel: r.ORG_TELNO || '', home: r.HMPG_ADRES || '' } : null;
  }
  async function seed() {
    const d = await load(); const add = {};
    for (const [name, code] of SEED) {
      try {
        const info = code ? await infoByCode(code) : (await findSchool(name + '학교', 'B10')).find(x => /중학교/.test(x.kind || x.full || '') || /중$/.test(x.name));
        if (info) add[info.code] = Object.assign({ managed: true }, info, { events: [], syncedAt: '' });
      } catch (e) { if (e.code === 'nokey' || e.code === 'nourl') throw e; }
    }
    Object.assign(d.schools, add);
    await ctx.saveNeis({ schools: add });
  }
  // 한 학교의 학사일정 (지난 14일 ~ 앞으로 120일)
  async function syncOne(sc, news) {
    const t = today(), from = new Date(t - 14 * 864e5), to = new Date(+t + 120 * 864e5);
    const list = rows(await api(`/neis/SchoolSchedule?ATPT_OFCDC_SC_CODE=${sc.atpt}&SD_SCHUL_CODE=${sc.code}&AA_FROM_YMD=${ymd(from)}&AA_TO_YMD=${ymd(to)}`), 'SchoolSchedule');
    const fresh = list.map(r => ({ d: r.AA_YMD, n: String(r.EVENT_NM || '').trim(), g: [r.ONE_GRADE_EVENT_YN, r.TW_GRADE_EVENT_YN, r.THREE_GRADE_EVENT_YN].map((y, i) => y === 'Y' ? i + 1 : 0).filter(Boolean), k: kindOf(String(r.EVENT_NM || ''), r.SBTR_DD_SC_NM) }))
      .filter(e => e.n && e.k !== 'etc' || /방학|개학|졸업|입학|재량|체험|축제|수학여행/.test(e.n));
    const keepOld = (sc.events || []).filter(e => e.d < ymd(from) && e.d >= ymd(new Date(t - 200 * 864e5)));
    const events = keepOld.concat(fresh).sort((a, b) => a.d.localeCompare(b.d));
    // 바뀐 시험만 새 소식으로
    if (sc.syncedAt) {
      const key = p => `${p.label}|${p.grades.join(',')}`;
      const before = new Map(periods(sc.events).map(p => [key(p), p])), after = new Map(periods(events).map(p => [key(p), p]));
      after.forEach((p, k) => {
        const o = before.get(k);
        if (!o) news.push({ code: sc.code, name: sc.name, text: `${gradeTxt(p.grades)} ${p.label} ${range(p)} 일정이 올라왔습니다` });
        else if (o.start !== p.start || o.end !== p.end) news.push({ code: sc.code, name: sc.name, text: `${gradeTxt(p.grades)} ${p.label} 날짜가 바뀌었습니다: ${range(o)} → ${range(p)}` });
      });
      before.forEach((p, k) => { if (!after.has(k) && p.start >= ymd(from)) news.push({ code: sc.code, name: sc.name, text: `${gradeTxt(p.grades)} ${p.label} ${range(p)} 일정이 나이스에서 빠졌습니다` }); });
    }
    return { events, syncedAt: new Date().toISOString(), err: '' };
  }
  // ---------- 학교알리미 공시: 학년별 학생 수(apiType 63)·학급 수(62) ----------
  // 2026년부터 발급된 키는 시·군·구 코드(sggCode)가 꼭 필요 → 주소의 구 이름으로 찾는다 (서울)
  const SEOUL_GU = { 종로구: 11110, 중구: 11140, 용산구: 11170, 성동구: 11200, 광진구: 11215, 동대문구: 11230, 중랑구: 11260, 성북구: 11290, 강북구: 11305, 도봉구: 11320, 노원구: 11350, 은평구: 11380, 서대문구: 11410, 마포구: 11440, 양천구: 11470, 강서구: 11500, 구로구: 11530, 금천구: 11545, 영등포구: 11560, 동작구: 11590, 관악구: 11620, 서초구: 11650, 강남구: 11680, 송파구: 11710, 강동구: 11740 };
  const guOf = sc => { const m = String(sc.addr || '').match(/서울\S*\s+(\S+구)/); return m && SEOUL_GU[m[1]] ? SEOUL_GU[m[1]] : 0; };
  async function alimi(type, gu, yr) {
    const d = await api(`/schoolinfo?apiType=${type}&pbanYr=${yr}&schulKndCode=03&sidoCode=11&sggCode=${gu}`);
    if (d.resultCode !== 'success') throw new Error(`학교알리미: ${d.resultMsg || d.resultCode}`);
    return d.list || [];
  }
  // 관리 학교의 학생 수: 한 달에 한 번, 구마다 한 번씩 부름
  async function syncInfo(list, force) {
    const need = list.filter(sc => guOf(sc) && (force || !sc.info || Date.now() - new Date(sc.info.at) > 30 * 864e5));
    const patch = {};
    for (const gu of [...new Set(need.map(guOf))]) {
      let yr = new Date().getFullYear(), stu = [];
      try { stu = await alimi(63, gu, yr); } catch (_) {}
      if (!stu.length) { yr--; stu = await alimi(63, gu, yr); }
      let cls = []; try { cls = await alimi(62, gu, yr); } catch (_) {}
      need.filter(sc => guOf(sc) === gu).forEach(sc => {
        const r = stu.find(x => short(x.SCHUL_NM) === sc.name), c = cls.find(x => short(x.SCHUL_NM) === sc.name);
        if (!r) return;
        const st = {}; [1, 2, 3].forEach(g => { st[g] = (+r['COL_M' + g] || 0) + (+r['COL_W' + g] || 0); });
        patch[sc.code] = { info: { yr, students: st, total: +r.SUM || 0, classes: c ? { 1: +c.COL_1 || 0, 2: +c.COL_2 || 0, 3: +c.COL_3 || 0 } : null, avgClass: c ? +c.AVG_FGR_SUM || 0 : null, at: new Date().toISOString() } };
      });
    }
    return patch;
  }
  async function sync(force) {
    if (!canSync || S.state === 'sync') return;
    const d = await load();
    if (!force && d.syncedAt && Date.now() - new Date(d.syncedAt) < 20 * 3600e3) return;
    S.state = 'sync'; S.msg = ''; S.msg2 = ''; paint();
    try {
      if (!Object.keys(d.schools).length) await seed();
      if (!Object.keys(d.schools).length) throw new Error('관리 학교를 나이스에서 찾지 못했습니다. Worker 코드와 NEIS_KEY를 확인해 주세요');   // 다음에 다시 시도하도록 확인 시각을 남기지 않음
      const news = [], patch = {};
      for (const sc of Object.values(d.schools).filter(x => x.managed)) {
        try { patch[sc.code] = await syncOne(sc, news); }
        catch (e) { if (e.code === 'nokey' || e.code === 'nourl') throw e; patch[sc.code] = { err: e.message }; }
      }
      // 학교알리미 학생 수 (실패해도 학사일정은 그대로 저장)
      try { const ip = await syncInfo(Object.values(d.schools).filter(x => x.managed), force); Object.keys(ip).forEach(k => { patch[k] = Object.assign(patch[k] || {}, ip[k]); }); }
      catch (e) { if (e.code !== 'nokey') S.msg2 = e.message; }
      Object.keys(patch).forEach(k => Object.assign(d.schools[k], patch[k]));
      const at = new Date().toISOString();
      d.news = news.map(n => Object.assign({ at }, n)).concat(d.news || []).slice(0, 40);
      d.syncedAt = at;
      await ctx.saveNeis({ schools: patch, news: d.news, syncedAt: at });
      S.state = 'ok';
      if (news.length) toast(`학교 소식 ${news.length}개: ${news[0].name} ${news[0].text}`);
    } catch (e) { S.state = e.code === 'nokey' ? 'nokey' : 'err'; S.msg = e.message; }
    paint();
  }
  const paint = () => { if ((location.hash || '') === '#news') render(); };

  // ---------- 학업성취 (학교알리미 '교과별 학업성취 사항' 표 붙여 넣기) ----------
  // 가장 최근 공시: 4월 = 지난해 2학기, 9월 = 올해 1학기
  function latestTerm() { const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear(); return m >= 9 ? { y, t: 1 } : m >= 4 ? { y: y - 1, t: 2 } : { y: y - 1, t: 1 }; }
  // 붙여 넣은 글에서 학년별 수학 줄 찾기 → {학년: {avg, sd, n, dist}}
  function parseAlimi(text) {
    const out = {}; let grade = 0, auto = 1;
    String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const gm = line.match(/([1-3])\s*학년/) || line.match(/^([1-3])(?=[\s\t])/);
      if (gm) grade = +gm[1];
      if (!/수학/.test(line)) return;
      const nums = (line.replace(/[1-3]\s*학년/g, ' ').replace(/^([1-3])(?=[\s\t])/, ' ').match(/\d+(?:\.\d+)?/g) || []).map(Number);
      // A~E 비율: 합이 100 근처인 연속 5칸. 평균·표준편차 뒤(3번째 칸부터)에 있는 것을 먼저
      const wins = [];
      for (let i = 0; i + 5 <= nums.length; i++) { const five = nums.slice(i, i + 5), s = five.reduce((a, b) => a + b, 0); if (s >= 95 && s <= 105.5 && five.every(x => x <= 100)) wins.push(i); }
      const di = wins.find(i => i >= 2) ?? (wins.length ? wins[0] : -1);
      const before = di >= 0 ? nums.slice(0, di) : nums, after = di >= 0 ? nums.slice(di + 5) : [];
      const avg = before.find(x => x >= 20 && x <= 100);
      const sd = before.find(x => x > 0 && x < 45 && x !== avg);
      const n = before.concat(after).find(x => Number.isInteger(x) && x > 100 && x < 2000);
      if (avg === undefined) return;
      const g = grade || auto++;
      if (out[g]) return;   // 학년마다 첫 수학 줄
      out[g] = { avg, sd: sd ?? '', n: n ?? '', dist: di >= 0 ? Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((k, i) => [k, nums[di + i]])) : { A: '', B: '', C: '', D: '', E: '' } };
    });
    return out;
  }
  function achieveFor(code, y, t) { const a = ((S.data && S.data.achieve) || {})[code] || {}; return [1, 2, 3].filter(g => a[`${y}-${t}-${g}`]); }
  function openPaste(sc) {
    const L = latestTerm(), V = { y: L.y, t: L.t, rows: {} };
    const sh = $('#sheet');
    const draw = () => {
      sh.innerHTML = `<div class="sheet-back" data-close></div><section class="statdlg" role="dialog" aria-modal="true" aria-labelledby="apT">
        <div class="head"><h2 id="apT">학업성취 넣기 <small>${esc(sc.name)} · 학교알리미</small></h2><button type="button" class="linkbtn" data-close>닫기</button></div>
        <ol class="apsteps"><li><a href="https://www.schoolinfo.go.kr" target="_blank" rel="noopener">학교알리미</a>에서 ‘${esc(sc.name)}학교’를 찾고 <b>학업성취사항 → 교과별 학업성취 사항</b>을 엽니다 (사람 확인 한 번)</li>
          <li>학년·학기를 고른 뒤 표 전체를 끌어서 복사(Ctrl+C)하고, 아래 칸에 붙여 넣습니다(Ctrl+V). 학년 탭마다 반복해도 됩니다</li></ol>
        <div class="row2"><label class="sel"><span>공시 학년도</span><select id="apY">${[L.y + 1, L.y, L.y - 1, L.y - 2].map(y => `<option ${y === V.y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <label class="sel"><span>학기</span><select id="apT2">${[1, 2].map(t => `<option value="${t}" ${t === V.t ? 'selected' : ''}>${t}학기</option>`).join('')}</select></label></div>
        <label class="sel"><span>붙여 넣기 <small>수학 줄의 평균·표준편차·A~E 비율을 찾아 아래 칸을 채웁니다</small></span><textarea id="apTx" rows="5" placeholder="여기에 붙여 넣기 (Ctrl+V)"></textarea></label>
        <div class="tablewrap"><table class="aptbl"><thead><tr><th>학년</th><th>평균</th><th>표준편차</th><th>수강자</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead><tbody>
          ${[1, 2, 3].map(g => { const r = V.rows[g] || { dist: {} }; return `<tr><td>${g}학년</td>${['avg', 'sd', 'n'].map(k => `<td><input data-g="${g}" data-k="${k}" type="number" step="0.1" value="${esc(r[k] ?? '')}" aria-label="${g}학년 ${k}"></td>`).join('')}${['A', 'B', 'C', 'D', 'E'].map(k => `<td><input data-g="${g}" data-d="${k}" type="number" step="0.1" value="${esc((r.dist || {})[k] ?? '')}" aria-label="${g}학년 ${k} 비율"></td>`).join('')}</tr>`; }).join('')}
        </tbody></table></div>
        <p class="dl" id="apMsg">평균이 있는 학년만 저장합니다. 보관함에 있는 ${esc(sc.name)} 같은 학년도·학년·학기 시험(중간·기말)에 ‘학교 성적 자료’로 함께 들어갑니다.</p>
        <div class="row2"><button type="button" class="btn" id="apSave">저장</button></div></section>`;
      sh.hidden = false;
      $$('[data-close]', sh).forEach(b => b.onclick = () => { sh.hidden = true; sh.innerHTML = ''; });
      $('#apY').onchange = ev => { V.y = +ev.target.value; };
      $('#apT2').onchange = ev => { V.t = +ev.target.value; };
      const tx = $('#apTx');
      tx.oninput = () => {
        const got = parseAlimi(tx.value), gs = Object.keys(got);
        Object.keys(got).forEach(g => { if (got[g].n === '' && sc.info && sc.info.students[g]) { got[g].n = sc.info.students[g]; got[g].nAuto = 1; } });
        Object.assign(V.rows, got); const keep = tx.value; draw(); $('#apTx').value = keep;
        $('#apMsg').textContent = gs.length ? `${gs.map(g => g + '학년').join('·')} 수학 줄을 찾았습니다. 숫자를 확인하고 저장을 눌러 주세요${gs.some(g => got[g].nAuto) ? ' (수강자 칸이 비어 있던 학년은 학교알리미 학생 수로 채웠습니다)' : ''}` : '수학 줄을 찾지 못했습니다. 표 전체(제목 줄 포함)를 다시 복사해 붙여 넣거나, 칸에 직접 넣어 주세요';
      };
      $$('[data-g]', sh).forEach(inp => inp.onchange = () => {
        const g = +inp.dataset.g, r = V.rows[g] = V.rows[g] || { dist: {} };
        if (inp.dataset.k) r[inp.dataset.k] = inp.value; else { r.dist = r.dist || {}; r.dist[inp.dataset.d] = inp.value; }
      });
      $('#apSave').onclick = async ev => {
        const num = v => v === '' || v === null || v === undefined ? null : +v;
        const save = {}, ids = {}; let bad = '';
        Object.entries(V.rows).forEach(([g, r]) => {
          if (!(num(r.avg) > 0)) return;
          const dist = {}; ['A', 'B', 'C', 'D', 'E'].forEach(k => { if (num((r.dist || {})[k]) !== null) dist[k] = num(r.dist[k]); });
          const nd = Object.keys(dist).length, tot = Object.values(dist).reduce((a, b) => a + b, 0);
          if (nd && (nd < 5 || tot < 95 || tot > 105)) { bad = `${g}학년 A~E 비율을 확인해 주세요 (합 ${Math.round(tot * 10) / 10}%)`; return; }
          save[g] = { src: 'alimi', year: V.y, grade: +g, sem: V.t, avg: num(r.avg), sd: num(r.sd), n: num(r.n), dist: nd ? dist : null, savedAt: new Date().toISOString() };
          ids[g] = D.exams.filter(e => e.s === sc.name && e.y === V.y && e.g === +g && e.t === V.t).map(e => e.id);
        });
        if (bad) { toast(bad); return; }
        if (!Object.keys(save).length) { toast('평균이 있는 학년이 없습니다'); return; }
        ev.currentTarget.disabled = true;
        try {
          const ach = {}; Object.entries(save).forEach(([g, st]) => { ach[`${V.y}-${V.t}-${g}`] = st; });
          await ctx.saveNeis({ achieve: { [sc.code]: ach } });
          S.data.achieve[sc.code] = Object.assign(S.data.achieve[sc.code] || {}, ach);
          let nEx = 0;
          for (const g of Object.keys(save)) if (ids[g].length) { await ctx.saveExamStats(ids[g], save[g]); ids[g].forEach(id => { byId[id].st = save[g]; }); nEx += ids[g].length; }
          sh.hidden = true; sh.innerHTML = '';
          toast(`${sc.name} ${V.y} ${V.t}학기 학업성취를 저장했습니다${nEx ? ` · 시험 ${nEx}건에 반영` : ' · 보관함에 해당 시험이 없어 학교 자료로만 저장'}`);
          render();
        } catch (er) { toast('저장하지 못했습니다: ' + er.message); ev.currentTarget.disabled = false; }
      };
    };
    draw();
  }

  // ---------- 화면 ----------
  async function render() {
    const main = $('#main');
    if (!S.data) { main.innerHTML = '<p class="dl">학교 소식을 불러오는 중…</p>'; await load(); if ((location.hash || '') !== '#news') return; }
    const d = S.data, list = Object.values(d.schools).filter(x => x.managed).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const t0 = ymd(today());
    const up = [];
    list.forEach(sc => periods(sc.events).filter(p => p.end >= t0).forEach(p => up.push(Object.assign({ sc }, p))));
    up.sort((a, b) => a.start.localeCompare(b.start));
    const L = latestTerm();
    const banner = S.state === 'nokey' ? `<div class="callout"><b>나이스 인증키를 기다리고 있습니다.</b> Worker에 NEIS_KEY를 넣고 새 Worker 코드를 배포하면, 앱을 열 때마다 하루 한 번 관리 학교 학사일정을 가져옵니다.</div>`
      : S.state === 'err' ? `<div class="callout">학사일정을 가져오지 못했습니다: ${esc(S.msg)}</div>`
      : S.state === 'sync' ? '<div class="callout">나이스에서 학사일정을 가져오는 중…</div>'
      : S.msg2 ? `<div class="callout">학사일정은 가져왔지만 학교알리미 학생 수를 가져오지 못했습니다: ${esc(S.msg2)}</div>` : '';
    main.innerHTML = `
      <div class="head"><div><div class="kicker">나이스 학사일정 · 학교알리미 학업성취</div><h1>학교 소식</h1></div>
        <div class="headact">${canSync ? `<button type="button" class="btn ghost" id="nwSync" ${S.state === 'sync' ? 'disabled' : ''}>지금 확인</button><button type="button" class="btn" id="nwAdd">학교 추가</button>` : ''}</div></div>
      <p class="dl">${d.syncedAt ? `마지막 확인 ${new Date(d.syncedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ` : ''}하루 한 번, 원장님이 앱을 열 때 저절로 확인합니다.</p>
      ${banner}
      <section class="card"><h2>다가오는 시험 <small>나이스에 올라온 지필평가</small></h2>
        ${up.length ? `<div class="ddays">${up.slice(0, 12).map(p => { const n = dday(p.start), live = n <= 0; return `<div class="dd ${live ? 'live' : n <= 14 ? 'soon' : ''}"><b class="ddn">${live ? '시험 중' : 'D-' + n}</b><span class="ddsc">${esc(p.sc.name)} ${esc(gradeTxt(p.grades))}</span><span>${esc(p.label)}</span><small>${range(p)}</small></div>`; }).join('')}</div>`
        : `<div class="empty">${list.length ? '앞으로 120일 안에 나이스에 올라온 시험 일정이 없습니다.' : '관리 학교가 아직 없습니다.'} 나이스에 없는 시험은 학교 공지를 보고 직접 확인해 주세요.</div>`}
      </section>
      ${(d.news || []).length ? `<section class="card"><h2>새 소식 <small>바뀐 시험 일정</small></h2><ul class="newslist">${d.news.slice(0, 12).map(n => `<li><b>${esc(n.name)}</b> ${esc(n.text)} <small class="dl">${esc(new Date(n.at).toLocaleDateString('ko-KR'))}</small></li>`).join('')}</ul></section>` : ''}
      <section class="card"><h2>관리 학교 <small>${list.length}곳 · 학업성취는 ${L.y} ${L.t}학기 공시 기준</small></h2>
        <div class="tablewrap"><table class="sctbl"><thead><tr><th>학교</th><th>다음 시험</th><th>학업성취 (${L.y}-${L.t})</th><th></th></tr></thead><tbody>
        ${list.map(sc => { const nx = periods(sc.events).find(p => p.end >= t0), got = achieveFor(sc.code, L.y, L.t); return `<tr>
          <td><b>${esc(sc.name)}</b>${sc.home ? ` <a class="dl" href="${esc(/^https?:/.test(sc.home) ? sc.home : 'http://' + sc.home)}" target="_blank" rel="noopener">홈페이지</a>` : ''}${sc.info ? `<br><small class="dl" title="학교알리미 ${sc.info.yr} 공시">학생 ${[1, 2, 3].map(g => `${g}학년 ${sc.info.students[g]}`).join(' · ')}${sc.info.classes ? ` · 학급 ${[1, 2, 3].map(g => sc.info.classes[g]).join('/')}` : ''}</small>` : ''}${sc.err ? `<br><small class="goldt">${esc(sc.err)}</small>` : ''}</td>
          <td>${nx ? `${esc(gradeTxt(nx.grades))} ${esc(nx.label)} <small class="dl">${range(nx)}</small>` : '<span class="dl">나이스에 없음</span>'}</td>
          <td>${got.length === 3 ? '<span class="pill ok">넣음</span>' : got.length ? `<span class="pill">${got.join('·')}학년만</span>` : '<span class="pill warn">아직</span>'} ${canSync ? `<button type="button" class="linkbtn" data-ach="${esc(sc.code)}">붙여 넣기</button>` : ''}</td>
          <td><button type="button" class="linkbtn" data-ev="${esc(sc.code)}">${S.open === sc.code ? '일정 닫기' : '일정 보기'}</button>${canSync ? ` · <button type="button" class="linkbtn" data-rm="${esc(sc.code)}">빼기</button>` : ''}</td></tr>
          ${S.open === sc.code ? `<tr class="evrow"><td colspan="4"><ul class="evlist">${(sc.events || []).filter(e => e.d >= t0).slice(0, 40).map(e => `<li class="${e.k}"><span>${md(e.d)}</span><b>${esc(e.n)}</b><small>${esc(gradeTxt(e.g))}</small></li>`).join('') || '<li class="dl">앞으로의 일정이 없습니다</li>'}</ul></td></tr>` : ''}`; }).join('')}
        </tbody></table></div></section>`;
    const sy = $('#nwSync'); if (sy) sy.onclick = () => sync(true);
    const ad = $('#nwAdd'); if (ad) ad.onclick = openAdd;
    $$('[data-ev]').forEach(b => b.onclick = () => { S.open = S.open === b.dataset.ev ? null : b.dataset.ev; render(); });
    $$('[data-ach]').forEach(b => b.onclick = () => openPaste(d.schools[b.dataset.ach]));
    $$('[data-rm]').forEach(b => b.onclick = async () => {
      const sc = d.schools[b.dataset.rm]; if (!confirm(`${sc.name}을(를) 관리 학교에서 뺄까요?`)) return;
      sc.managed = false; await ctx.saveNeis({ schools: { [sc.code]: { managed: false } } }).catch(() => {}); render();
    });
  }
  function openAdd() {
    const sh = $('#sheet');
    sh.innerHTML = `<div class="sheet-back" data-close></div><section class="statdlg" role="dialog" aria-modal="true" aria-labelledby="naT">
      <div class="head"><h2 id="naT">관리 학교 추가</h2><button type="button" class="linkbtn" data-close>닫기</button></div>
      <div class="row2"><label class="sel"><span>학교 이름</span><input id="naQ" placeholder="예: 목동중"></label><button type="button" class="btn" id="naGo">찾기</button></div>
      <div id="naList" class="dl">나이스에서 찾습니다 (서울 학교 먼저).</div></section>`;
    sh.hidden = false;
    $$('[data-close]', sh).forEach(b => b.onclick = () => { sh.hidden = true; sh.innerHTML = ''; });
    const go = async () => {
      const q = $('#naQ').value.trim(); if (!q) return;
      const box = $('#naList'); box.textContent = '찾는 중…';
      try {
        let r = await findSchool(q.replace(/중$/, '중학교'), 'B10'); if (!r.length) r = await findSchool(q, '');
        box.innerHTML = r.length ? r.slice(0, 10).map((x, i) => `<button type="button" class="drow" data-pick="${i}"><b>${esc(x.full || x.name)}</b><span>${esc(x.edu || '')} · ${esc(x.addr)}</span></button>`).join('') : '찾지 못했습니다';
        $$('[data-pick]', box).forEach(b => b.onclick = async () => {
          const x = r[+b.dataset.pick], d = await load();
          const sc = Object.assign({}, d.schools[x.code] || { events: [], syncedAt: '' }, x, { managed: true });
          d.schools[x.code] = sc;
          await ctx.saveNeis({ schools: { [x.code]: sc } });
          sh.hidden = true; sh.innerHTML = '';
          toast(`${x.name}을(를) 추가했습니다. 학사일정을 가져옵니다`);
          try { const news = []; Object.assign(sc, await syncOne(sc, news)); await ctx.saveNeis({ schools: { [x.code]: { events: sc.events, syncedAt: sc.syncedAt, err: '' } } }); } catch (e) { toast('학사일정을 가져오지 못했습니다: ' + e.message); }
          render();
        });
      } catch (e) { box.textContent = e.code === 'nokey' ? '나이스 인증키를 Worker에 넣은 뒤 찾을 수 있습니다' : '찾지 못했습니다: ' + e.message; }
    };
    $('#naGo').onclick = go; $('#naQ').onkeydown = ev => { if (ev.key === 'Enter') go(); };
    $('#naQ').focus();
  }
  // 앱을 열면 하루 한 번 저절로 확인 (원장·원장 공동)
  if (canSync) setTimeout(() => sync(false).catch(() => {}), 4000);
  return { render, sync, parseAlimi, periods, kindOf };
};
