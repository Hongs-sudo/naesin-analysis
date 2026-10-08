// 수도 내신분석 — 유사문항 찾기
// 후보: 같은 유형 코드(없으면 같은 중단원)의 기출 문항 + 자료실 문항. AI가 핵심 내용(글자)만 보고 비슷한 순서를 매긴다.
// 고르는 순서: 충분히 비슷한(60점 이상) 것 중 기출 실력·심화 → 학원 자료 → 학교 프린트 → 나머지.
window.SudoSimilar = function (H) {
  const { D, ctx } = H;
  const DIFF = ['', '기본', '응용', '실력', '심화'];
  const DI = { 기본: 1, 응용: 2, 실력: 3, 심화: 4 };
  const strip = s => String(s || '').replace(/^[^.]*\./, '').trim();
  const KIND = { exam: '기출', academy: '학원 자료', school: '학교 프린트', custom: '개별 자료' };
  let POOL = null, POOLMAP = null;
  const tier = c => c.kind === 'exam' ? (c.diff >= 3 ? 0 : 3) : c.kind === 'academy' ? 1 : c.kind === 'school' ? 2 : 4;
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
      e.an.items.forEach(i => out.push({ id: `x|${e.id}|${i[0]}`, kind: 'exam', examId: e.id, course: i[4], code: i[8] >= 0 ? D.catalog[i[8]][0] : '',
        mid: i[6], diff: i[2], q: i[12] || '', ik: i[13] || '', type: strip(i[7]) || strip(i[6]), label: `${e.y} ${e.s} ${e.g}-${e.t} ${e.x} ${i[0]}번`, img: true, ai: e.an.status === 'ai' }));
    });
    Object.values(D.materials || {}).forEach(m => {
      (m.problems || []).forEach((p, k) => {
        if (p.skip) return;
        out.push({ id: `m|${m.id}|${k}`, kind: m.src || 'custom', matId: m.id, course: m.course || '', code: p.code || '', mid: p.mid || m.unit || '', diff: DI[p.diff] || 0,
          q: p.q || '', ik: p.ik || '', type: strip(p.type) || strip(p.mid), label: matLabel(m, p), img: !m.commercial && m.src !== 'custom' });
      });
    });
    POOL = out; POOLMAP = Object.fromEntries(out.map(c => [c.id, c]));
    return out;
  }
  const reset = () => { POOL = null; POOLMAP = null; };

  // 문항 배열 → 기준 문항
  const target = i => ({ no: i[0], course: i[4], code: i[8] >= 0 ? D.catalog[i[8]][0] : '', mid: i[6], diff: i[2], q: i[12] || '', type: strip(i[7]) || strip(i[6]), pts: i[1] });
  function distinct(list, n) {
    const seen = new Set(), out = [];
    list.forEach(i => { const k = (i[8] >= 0 ? 'c' + i[8] : 'm' + i[6]); if (out.length < n && !seen.has(k)) { seen.add(k); out.push(i); } });
    list.forEach(i => { if (out.length < n && !out.includes(i)) out.push(i); });
    return out;
  }
  // 기본 분석지: 이번 시험 고난도 문항
  function examTargets(e) {
    const it = e.an.items.slice().sort((a, b) => b[2] - a[2] || b[1] - a[1] || b[0] - a[0]);
    return distinct(it.filter(i => i[2] >= 2), 3).map(target);
  }
  // 학생 분석지: 틀린 문항 (어려운 것·많이 잃은 것 먼저)
  function studentTargets(e, lost) {
    const it = e.an.items.filter(i => lost[i[0]] > 0).sort((a, b) => b[2] - a[2] || lost[b[0]] - lost[a[0]] || a[0] - b[0]);
    return distinct(it, 3).map(target);
  }

  function heur(t, c) { return (t.code && c.code === t.code ? 70 : 48) + (c.diff === t.diff ? 8 : 0) - Math.abs((c.diff || t.diff) - t.diff) * 4; }
  async function scored(t, exclude, force) {
    const P = pool();
    const same = P.filter(c => c.course === t.course && !(c.kind === 'exam' && c.examId === exclude));
    const byCode = t.code ? same.filter(c => c.code === t.code) : [];
    const byMid = same.filter(c => c.mid && c.mid === t.mid && !byCode.includes(c));
    const cands = byCode.concat(byMid).sort((a, b) => ((b.code === t.code) - (a.code === t.code)) || tier(a) - tier(b) || Math.abs(a.diff - t.diff) - Math.abs(b.diff - t.diff)).slice(0, 24);
    if (!cands.length) return [];
    const key = `t_${exclude}_${t.no}`.replace(/\//g, '_');
    const sig = (() => { let h = 5381; const t2 = cands.map(c => c.id + (c.q ? 'q' : '')).sort().join(','); for (let k = 0; k < t2.length; k++) h = (h * 33 + t2.charCodeAt(k)) >>> 0; return h.toString(36) + ':' + cands.length; })();
    if (!force && ctx && ctx.getSimilar) {
      const hit = await ctx.getSimilar(key);
      if (hit && hit.sig === sig && (hit.list || []).every(x => POOLMAP[x.id])) return hit.list.map(x => Object.assign({ c: POOLMAP[x.id] }, x));
    }
    const sc = {}; cands.forEach(c => { sc[c.id] = { score: heur(t, c), why: c.code && c.code === t.code ? '같은 유형' : '같은 중단원' }; });
    const ai = H.aiSettings && H.aiSettings();
    const withQ = cands.filter(c => c.q);
    let usedAI = false;
    if (t.q && withQ.length && ai && ai.url && ctx && ctx.getToken) {
      try {
        const { result } = await window.SudoAI.rankSimilar({ settings: ai, getToken: ctx.getToken, target: { q: t.q, type: t.type, diff: DIFF[t.diff] },
          cands: withQ.map(c => ({ id: c.id, type: c.type, diff: DIFF[c.diff] || '', q: c.q })), n: 6 });
        const picks = (result.picks || []).filter(p => sc[p.id]);
        withQ.forEach(c => { sc[c.id].score = Math.min(sc[c.id].score, 40); });
        picks.forEach(p => { sc[p.id] = { score: Math.max(0, Math.min(100, +p.score || 0)), why: (sc[p.id].why === '같은 유형' ? '같은 유형 · ' : '') + String(p.why || '').slice(0, 30) }; });
        usedAI = true;
      } catch (_) { /* 글자 비교 없이 유형만으로 */ }
    }
    const list = cands.map(c => ({ id: c.id, score: sc[c.id].score, why: sc[c.id].why })).sort((a, b) => b.score - a.score).slice(0, 8);
    if (ctx && ctx.saveSimilar) ctx.saveSimilar(key, { sig, list, ai: usedAI, at: new Date().toISOString() });
    return list.map(x => Object.assign({ c: POOLMAP[x.id] }, x));
  }
  const choose = list => list.slice().sort((a, b) => ((b.score >= 60) - (a.score >= 60)) || (a.score >= 60 ? tier(a.c) - tier(b.c) : 0) || b.score - a.score);

  // targets → 유사문항 3개 [{forNo, d, src, why, img, kind, score}]
  async function find(targets, opt) {
    opt = opt || {};
    const lists = [];
    for (const t of targets) lists.push(choose(await scored(t, opt.exclude, opt.force)));
    const used = new Set(), out = [];
    for (let round = 0; round < 3 && out.length < 3; round++) {
      targets.forEach((t, k) => {
        if (out.length >= 3) return;
        const p = lists[k].find(x => !used.has(x.id)); if (!p) return;
        if (round > 0 && out.some(o => o.forNo === t.no) && lists.some((l, j) => j !== k && l.some(x => !used.has(x.id)))) return;
        used.add(p.id); out.push({ forNo: t.no, c: p.c, score: p.score, why: p.why });
      });
    }
    const keys = out.filter(o => o.c.img && o.c.ik).map(o => o.c.ik);
    const imgs = keys.length && ctx && ctx.getImgs ? await ctx.getImgs(keys).catch(() => ({})) : (H.imgCache || {});
    return out.map(o => ({ forNo: o.forNo, d: o.c.diff, src: o.c.label, kind: KIND[o.c.kind] || '', why: o.why, score: o.score,
      img: o.c.img && o.c.ik ? (imgs[o.c.ik] || '') : '', noImg: !o.c.img, ai: o.c.ai }));
  }
  return { find, examTargets, studentTargets, reset, pool };
};
