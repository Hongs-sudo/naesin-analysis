// 수도 내신분석 — 유사문항 찾기
// 목적: 이번 시험 문항과 비슷한 문제가 '우리가 내신대비 때 쓴 자료' 어디에 있었는지 알려 주기.
// 후보(같은 과정만): 학원 내신대비 교재 · 선생님 보조자료(개별 추가) · 학교 프린트(같은 학교 또는 공통) · 같은 학교의 지난 기출(이번 시험보다 앞선 것).
// 다른 학교 기출은 쓰지 않는다. 같은 유형 코드(없으면 같은 중단원) 후보를 AI가 핵심 내용(글자)으로 비교한다.
// 고르는 순서: 충분히 비슷한(60점 이상) 것 중 학원 교재·보조자료 → 학교 프린트 → 같은 학교 기출.
window.SudoSimilar = function (H) {
  const { D, ctx } = H;
  const DIFF = ['', '기본', '응용', '실력', '심화'];
  const DI = { 기본: 1, 응용: 2, 실력: 3, 심화: 4 };
  const strip = s => String(s || '').replace(/^[^.]*\./, '').trim();
  const KIND = { exam: '같은 학교 기출', academy: '학원 교재', school: '학교 프린트', custom: '선생님 보조자료' };
  const VER = 'v2';
  let POOL = null, POOLMAP = null;
  const tier = c => c.kind === 'academy' || c.kind === 'custom' ? 0 : c.kind === 'school' ? 1 : 2;
  const when = e => e.y * 10 + e.t * 2 + (e.x === '기말' ? 1 : 0);
  function matLabel(m, p) {
    const at = `${p.pg ? p.pg + '쪽 ' : ''}${p.no ? p.no + '번' : ''}`.trim();
    if (m.src === 'school') return `[학교 프린트] ${at}`;
    return `${m.name}${at ? ' ' + at : ''}`;
  }
  function pool() {
    if (POOL) return POOL;
    const out = [];
    D.exams.forEach(e => {
      if (!e.an) return;
      e.an.items.forEach(i => out.push({ id: `x|${e.id}|${i[0]}`, kind: 'exam', exam: e, course: i[4], code: i[8] >= 0 ? D.catalog[i[8]][0] : '',
        mid: i[6], diff: i[2], q: i[12] || '', ik: i[13] || '', type: strip(i[7]) || strip(i[6]), label: `${e.y} ${e.s} ${e.g}-${e.t} ${e.x} ${i[0]}번`, img: true }));
    });
    Object.values(D.materials || {}).forEach(m => {
      if (m.status === 'indexing' || m.status === 'fail') return;
      (m.problems || []).forEach((p, k) => {
        if (p.skip) return;
        out.push({ id: `m|${m.id}|${k}`, kind: m.src || 'custom', school: m.school || '', course: m.course || '', code: p.code || '', mid: p.mid || m.unit || '', diff: DI[p.diff] || 0,
          q: p.q || '', ik: p.ik || '', type: strip(p.type) || strip(p.mid), label: matLabel(m, p), img: !m.commercial });
      });
    });
    POOL = out; POOLMAP = Object.fromEntries(out.map(c => [c.id, c]));
    return out;
  }
  const reset = () => { POOL = null; POOLMAP = null; };
  // 이 시험에 쓸 수 있는 후보인가
  function allowed(c, e) {
    if (c.kind === 'exam') return c.exam.s === e.s && c.exam !== e && when(c.exam) < when(e);
    if (c.kind === 'school') return !c.school || c.school === e.s;
    return true;   // 학원 교재 · 선생님 보조자료
  }

  const target = i => ({ no: i[0], course: i[4], code: i[8] >= 0 ? D.catalog[i[8]][0] : '', mid: i[6], diff: i[2], q: i[12] || '', type: strip(i[7]) || strip(i[6]), pts: i[1] });
  // 기본 분석지: 이번 시험 전 문항 (어려운 것 먼저 — 비슷한 정도가 같으면 어려운 문항을 고른다)
  const examTargets = e => e.an.items.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1] || a[0] - b[0]).map(target);
  // 학생 분석지: 틀린 문항
  const studentTargets = (e, lost) => e.an.items.filter(i => lost[i[0]] > 0).sort((a, b) => b[2] - a[2] || lost[b[0]] - lost[a[0]] || a[0] - b[0]).map(target);

  function heur(t, c) { return (t.code && c.code === t.code ? 66 : 46) + (c.diff === t.diff ? 6 : 0) - Math.abs((c.diff || t.diff) - t.diff) * 4; }
  async function scored(t, e, force) {
    const same = pool().filter(c => c.course === t.course && allowed(c, e));
    const byCode = t.code ? same.filter(c => c.code === t.code) : [];
    const byMid = same.filter(c => c.mid && c.mid === t.mid && !byCode.includes(c));
    const cands = byCode.concat(byMid).sort((a, b) => ((b.code === t.code) - (a.code === t.code)) || tier(a) - tier(b) || Math.abs(a.diff - t.diff) - Math.abs(b.diff - t.diff)).slice(0, 20);
    if (!cands.length) return [];
    const key = `${VER}_${e.id}_${t.no}`.replace(/\//g, '_');
    const sig = (() => { let h = 5381; const t2 = cands.map(c => c.id + (c.q ? 'q' : '')).sort().join(','); for (let k = 0; k < t2.length; k++) h = (h * 33 + t2.charCodeAt(k)) >>> 0; return h.toString(36) + ':' + cands.length; })();
    if (!force && ctx && ctx.getSimilar) {
      const hit = await ctx.getSimilar(key);
      if (hit && hit.sig === sig && (hit.list || []).every(x => POOLMAP[x.id])) return hit.list.map(x => Object.assign({ c: POOLMAP[x.id] }, x));
    }
    const sc = {}; cands.forEach(c => { sc[c.id] = { score: heur(t, c), why: c.code && c.code === t.code ? `같은 유형(${c.type})` : '같은 중단원', concept: c.type || strip(t.mid) }; });
    const ai = H.aiSettings && H.aiSettings();
    const withQ = cands.filter(c => c.q);
    let usedAI = false;
    if (t.q && withQ.length && ai && ai.url && ctx && ctx.getToken) {
      try {
        const { result } = await window.SudoAI.rankSimilar({ settings: ai, getToken: ctx.getToken, target: { q: t.q, type: t.type, diff: DIFF[t.diff] },
          cands: withQ.map(c => ({ id: c.id, type: c.type, diff: DIFF[c.diff] || '', q: c.q })), n: 4 });
        withQ.forEach(c => { sc[c.id].score = Math.min(sc[c.id].score, 40); });
        (result.picks || []).filter(p => sc[p.id]).forEach(p => {
          sc[p.id] = { score: Math.max(0, Math.min(100, +p.score || 0)), why: String(p.why || sc[p.id].why).slice(0, 40), concept: String(p.concept || sc[p.id].concept).slice(0, 40) };
        });
        usedAI = true;
      } catch (_) { /* 글자 비교 없이 유형만으로 */ }
    }
    const list = cands.map(c => Object.assign({ id: c.id }, sc[c.id])).sort((a, b) => b.score - a.score).slice(0, 6);
    if (ctx && ctx.saveSimilar) ctx.saveSimilar(key, { sig, list, ai: usedAI, at: new Date().toISOString() });
    return list.map(x => Object.assign({ c: POOLMAP[x.id] }, x));
  }
  // 한 문항 안에서: 충분히 비슷한 것 중 자료 종류 순서, 아니면 점수 순
  const best = list => list.slice().sort((a, b) => ((b.score >= 60) - (a.score >= 60)) || (a.score >= 60 ? tier(a.c) - tier(b.c) : 0) || b.score - a.score)[0];

  // targets → 비슷한 문제 3쌍 [{forNo, d, src, kind, why, concept, img}]
  async function find(targets, opt) {
    opt = opt || {};
    const e = opt.exam;
    const res = new Array(targets.length);
    let next = 0;
    const worker = async () => { while (next < targets.length) { const k = next++; res[k] = await scored(targets[k], e, opt.force).catch(() => []); } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // 문항마다 가장 알맞은 자료 하나 → 비슷한 정도 높은 순(같으면 어려운 문항 먼저 = targets 순서)으로 3쌍, 같은 자료 문제는 한 번만
    const pairs = targets.map((t, k) => ({ t, k, list: res[k] || [] })).filter(x => x.list.length);
    const used = new Set(), out = [];
    const rank = pairs.map(x => ({ x, b: best(x.list) })).sort((a, b) => ((b.b.score >= 60) - (a.b.score >= 60)) || (b.b.score - a.b.score) || a.x.k - b.x.k);
    for (const { x } of rank) {
      if (out.length >= 3) break;
      const p = [best(x.list.filter(y => !used.has(y.id)))][0]; if (!p || p.score < 45) continue;
      used.add(p.id); out.push({ forNo: x.t.no, c: p.c, score: p.score, why: p.why, concept: p.concept });
    }
    const keys = out.filter(o => o.c.img && o.c.ik).map(o => o.c.ik);
    const imgs = keys.length && ctx && ctx.getImgs ? await ctx.getImgs(keys).catch(() => ({})) : (H.imgCache || {});
    return out.map(o => ({ forNo: o.forNo, d: o.c.diff, src: o.c.label, kind: KIND[o.c.kind] || '', why: o.why, concept: o.concept, score: o.score,
      img: o.c.img && o.c.ik ? (imgs[o.c.ik] || '') : '', noImg: !o.c.img }));
  }
  return { find, examTargets, studentTargets, reset, pool };
};
