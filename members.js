// 수도 내신분석 — 선생님 관리 (원장 · 원장(공동)만)
window.SudoMembers = function (H) {
  const { D, ctx, esc, toast, $, $$ } = H;
  const ROLE = { co: '원장(공동)', admin: '관리자', teacher: '선생님' };
  const DESC = { co: '모든 기능 · 선생님 관리', admin: '학교 분석지 · 시험 등록 · 자료실 · 학생 전체', teacher: '담당 학생 등록 · 학생 분석지만' };
  const M = { list: null, usage: {}, form: null, loading: false };
  const now = () => new Date().toISOString();
  const appUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  async function refresh() {
    M.loading = true;
    try { const [l, u] = await Promise.all([ctx.listMembers(), ctx.usageAll()]); M.list = l.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')); M.usage = u; }
    catch (e) { toast('선생님 목록을 불러오지 못했습니다: ' + e.message); M.list = M.list || []; }
    M.loading = false; render();
  }
  function render() {
    if (!M.list && !M.loading) { refresh(); }
    const L = M.list || [];
    $('#main').innerHTML = `
      <div class="head"><div><div class="kicker">함께 쓰는 선생님과 권한을 정합니다</div><h1>선생님 관리</h1></div><button type="button" class="btn" id="mbNew">＋ 선생님 초대</button></div>
      <div class="mbgrid">
        <section class="card">${!M.list ? '<p class="dl">불러오는 중…</p>' : L.length ? `<div class="tablewrap flat"><table class="mbtbl"><thead><tr><th>이름</th><th>Google 계정</th><th>권한</th><th>담당</th><th>상태</th><th>이번 달 AI</th><th></th></tr></thead><tbody>
          ${L.map(m => `<tr><td><b>${esc(m.name || '')}</b></td><td class="em">${esc(m.email)}</td><td><span class="pill ${m.role === 'teacher' ? 'raw' : 'ok'}">${ROLE[m.role] || m.role}</span></td>
            <td class="sm">${esc([(m.schools || []).map(s => s.replace(/중$/, '')).join('·'), (m.grades || []).map(g => g + '학년').join('·')].filter(Boolean).join(' ') || '전체')}</td>
            <td>${!m.active ? '<span class="pill warn">멈춤</span>' : m.lastAt ? '<span class="pill ok">사용 중</span>' : '<span class="pill gold">초대됨 · 첫 로그인 전</span>'}</td>
            <td class="sm">${m.role === 'teacher' ? '—' : `${M.usage[m.email] || 0} / ${typeof m.aiLimit === 'number' ? m.aiLimit : 30}건`}</td>
            <td><button type="button" class="linkbtn" data-mb="${esc(m.email)}">고치기</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">아직 초대한 선생님이 없습니다. 오른쪽 위 ‘선생님 초대’를 눌러 주세요.</div>'}
          <p class="dl">AI 사용량은 시험지 한 건 읽기 · 자료 한 개 색인을 1건으로 셉니다. 원장님은 제한이 없고, 원장님을 뺀 관리자는 기본 한 달 30건입니다.</p></section>
        <section class="card">${M.form ? formHtml() : `<h2>권한 안내</h2>
          <div class="rolelist">${['co', 'admin', 'teacher'].map(r => `<div><span class="pill ${r === 'teacher' ? 'raw' : 'ok'}">${ROLE[r]}</span><span>${DESC[r]}</span></div>`).join('')}</div>
          <p class="dl">선생님은 자기 Google 계정으로 같은 앱 주소에 로그인합니다. 등록을 지우거나 ‘멈춤’으로 바꾸면 바로 들어올 수 없고, 그동안 만든 자료는 그대로 남습니다. ‘원장(공동)’ 권한은 원장님만 줄 수 있습니다.</p>`}</section>
      </div>`;
    bind();
  }
  function formHtml() {
    const f = M.form, isNew = !f.orig;
    const roles = ['admin', 'teacher'].concat(ctx.can.grantCo || f.role === 'co' ? ['co'] : []);
    return `<div class="head"><h2>${isNew ? '선생님 초대' : '선생님 정보 고치기'}</h2><button type="button" class="linkbtn" id="mbX">닫기</button></div>
      <div class="addform">
        <label class="sel"><span>이름</span><input id="mbName" value="${esc(f.name || '')}" placeholder="예: 홍재화"></label>
        <label class="sel"><span>Google 계정 (Gmail)</span><input id="mbEmail" type="email" value="${esc(f.email || '')}" ${isNew ? '' : 'disabled'} placeholder="선생님이 로그인할 Gmail 주소"></label>
        <div class="sel"><span>권한</span><div class="segx sm" role="radiogroup">${roles.map(r => `<button type="button" role="radio" data-role="${r}" aria-checked="${f.role === r}" ${r === 'co' && !ctx.can.grantCo ? 'disabled' : ''}>${ROLE[r]}</button>`).join('')}</div><small class="dl">${DESC[f.role]}</small></div>
        <div class="sel"><span>담당 학교 · 학년 <small>학생 등록 기본값 · 목록에 쓰임</small></span>
          <div class="chips">${H.schools.slice(0, 12).map(s => `<button type="button" class="chip" data-sc="${esc(s)}" aria-pressed="${(f.schools || []).includes(s)}">${esc(s)}</button>`).join('')}</div>
          <div class="chips">${[1, 2, 3].map(g => `<button type="button" class="chip" data-gr="${g}" aria-pressed="${(f.grades || []).includes(g)}">${g}학년</button>`).join('')}</div></div>
        ${f.role !== 'teacher' ? `<label class="sel"><span>AI 사용 한도 (한 달)</span><select id="mbLimit">${[10, 30, 50, 100, 300].map(n => `<option value="${n}" ${+f.aiLimit === n ? 'selected' : ''}>${n}건</option>`).join('')}</select></label>` : '<p class="dl">선생님 권한은 시험지·자료 AI 읽기를 쓰지 않습니다 (학생 분석지의 유사문항 비교만).</p>'}
        ${isNew ? '' : `<label class="chk"><input type="checkbox" id="mbActive" ${f.active ? 'checked' : ''}> 사용 중 <small>끄면 바로 로그인이 막힙니다</small></label>`}
        <div class="row2">${isNew ? '' : `<button type="button" class="btn ghost danger" id="mbDel" ${f.role === 'co' && !ctx.can.grantCo ? 'disabled' : ''}>등록 지우기</button>`}<button type="button" class="btn" id="mbSave">${isNew ? '초대하고 안내 문구 복사' : '저장'}</button></div>
      </div>`;
  }
  function invite(f) {
    return `[수학도서관 내신분석 초대]\n${f.name} 선생님, 수도 내신분석에 ${ROLE[f.role]} 권한으로 등록했습니다.\n\n1. 아래 주소를 크롬(또는 사파리)으로 엽니다.\n${appUrl()}\n2. 'Google로 로그인'을 누르고 ${f.email} 계정으로 로그인합니다.\n3. 휴대폰·아이패드는 공유 버튼 → '홈 화면에 추가'로 앱처럼 쓸 수 있습니다.`;
  }
  function bind() {
    $('#mbNew').onclick = () => { M.form = { role: 'teacher', aiLimit: 30, schools: [], grades: [], active: true }; render(); };
    $$('[data-mb]').forEach(b => b.onclick = () => { const m = M.list.find(x => x.email === b.dataset.mb); M.form = Object.assign({ orig: m.email }, JSON.parse(JSON.stringify(m))); render(); });
    if (!M.form) return;
    const f = M.form;
    const read = () => { f.name = $('#mbName').value.trim(); if (!f.orig) f.email = $('#mbEmail').value.trim().toLowerCase(); const l = $('#mbLimit'); if (l) f.aiLimit = +l.value; const a = $('#mbActive'); if (a) f.active = a.checked; };
    $('#mbX').onclick = () => { M.form = null; render(); };
    $$('[data-role]').forEach(b => b.onclick = () => { read(); f.role = b.dataset.role; render(); });
    $$('[data-sc]').forEach(b => b.onclick = () => { read(); const v = b.dataset.sc; f.schools = (f.schools || []).includes(v) ? f.schools.filter(x => x !== v) : (f.schools || []).concat(v); render(); });
    $$('[data-gr]').forEach(b => b.onclick = () => { read(); const v = +b.dataset.gr; f.grades = (f.grades || []).includes(v) ? f.grades.filter(x => x !== v) : (f.grades || []).concat(v).sort(); render(); });
    $('#mbSave').onclick = async ev => {
      read();
      if (!f.name) { toast('이름을 넣어 주세요'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) { toast('Google 계정 주소를 확인해 주세요'); return; }
      if (f.email === 'ilmvm66@gmail.com') { toast('원장님 계정은 등록하지 않아도 됩니다'); return; }
      if (!f.orig && M.list.some(m => m.email === f.email)) { toast('이미 등록된 계정입니다'); return; }
      const doc = { name: f.name, role: f.role, schools: f.schools || [], grades: f.grades || [], aiLimit: f.role === 'teacher' ? 0 : (f.aiLimit || 30), active: f.orig ? !!f.active : true,
        invitedAt: f.invitedAt || now(), invitedBy: f.invitedBy || ctx.me.email, editedAt: now() };
      ev.currentTarget.disabled = true;
      try {
        await ctx.saveMember(f.email, doc);
        if (!f.orig) {
          const t = invite(Object.assign({ email: f.email }, doc));
          try { await navigator.clipboard.writeText(t); toast('초대했습니다. 안내 문구를 복사했으니 카톡에 붙여넣기 하세요'); } catch (_) { toast('초대했습니다'); prompt('아래 안내 문구를 복사해 보내 주세요', t); }
        } else toast('저장했습니다');
        M.form = null; refresh();
      } catch (e) { toast('저장하지 못했습니다: ' + e.message); ev.currentTarget.disabled = false; }
    };
    const dl = $('#mbDel'); if (dl) dl.onclick = async () => {
      if (!confirm(`${f.name} 선생님 등록을 지울까요? 바로 로그인이 막히고, 만든 학생·자료는 그대로 남습니다.`)) return;
      try { await ctx.deleteMember(f.orig); toast('지웠습니다'); M.form = null; refresh(); } catch (e) { toast('지우지 못했습니다: ' + e.message); }
    };
  }
  return { render };
};
