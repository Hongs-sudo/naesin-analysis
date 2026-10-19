// 수도 내신분석 — PDF·사진을 쪽 그림으로 바꾸고, 문항 영역을 잘라 작은 그림으로 만든다
window.SudoPages = (function () {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let libP = null;
  function lib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = (window.SUDO_PDFJS || PDFJS) + 'pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = (window.SUDO_PDFJS || PDFJS) + 'pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error('PDF 읽기 도구를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
    return libP;
  }
  const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const isImg = f => /\.(jpe?g|png)$/i.test(f.name) || /^image\/(jpeg|png)$/.test(f.type);

  function toB64(canvas, q) { return canvas.toDataURL('image/jpeg', q || 0.82).split(',')[1]; }

  // files → [{canvas, b64, w, h, file, page}] (가로 1400px 안팎)
  async function load(files, opt) {
    const W = (opt && opt.width) || 1400, max = (opt && opt.maxPages) || 16, start = (opt && opt.start) || 1;
    const out = [];
    for (const f of files) {
      if (out.length >= max) break;
      if (isPdf(f)) {
        const pdfjs = await lib();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        for (let i = start; i <= doc.numPages && out.length < max; i++) {
          const pg = await doc.getPage(i);
          const v1 = pg.getViewport({ scale: 1 });
          const vp = pg.getViewport({ scale: W / v1.width });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await pg.render({ canvasContext: ctx, viewport: vp }).promise;
          let layout = null;
          try { layout = await textLayout(pg, vp); } catch (_) { layout = null; }
          out.push({ canvas: c, w: c.width, h: c.height, file: f.name, page: i, b64: (opt && opt.noB64) ? '' : toB64(c), layout });
        }
      } else if (isImg(f)) {
        const url = URL.createObjectURL(f);
        const im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => rej(new Error(f.name + ' 그림을 열지 못했습니다')); x.src = url; });
        const sc = Math.min(1, 1600 / im.naturalWidth);
        const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        out.push({ canvas: c, w: c.width, h: c.height, file: f.name, page: 1, b64: toB64(c) });
      } else throw new Error(f.name + ': PDF·JPG·PNG만 읽을 수 있습니다 (한글 파일은 PDF로 저장해서 넣어 주세요)');
    }
    return out;
  }
  // ---------- 문항 번호 기준으로 문항 영역 잡기 ----------
  // 1) 쪽 그림에서 단(왼쪽/오른쪽)과 글줄을 찾는다 (스캔·사진·PDF 모두)
  // 2) 번호 후보 = 단의 왼쪽 끝에서 시작하는 줄 (PDF 글자 정보가 있으면 번호 숫자까지 읽음)
  // 3) AI가 짐작한 위치(쪽·상자 왼쪽 위)를 실마리로, 번호 순서를 지키며 후보와 짝을 지음
  // 4) 상자 = 번호 왼쪽 위 ~ 같은 단 다음 번호 바로 위 (아래 빈 공간은 잘라 냄)
  function geom(pg) {
    if (pg.geom) return pg.geom;
    const W = pg.w, H = pg.h;
    const d = pg.canvas.getContext('2d').getImageData(0, 0, W, H).data;
    // 밝기 기준: 종이 바탕과 글자 사이 (Otsu), 빨간·파란 펜 자국은 빼고
    const hist = new Array(256).fill(0), lum = new Uint8Array(W * H);
    for (let i = 0, p = 0; p < W * H; i += 4, p++) { const r = d[i], g = d[i + 1], b = d[i + 2]; const v = (r * 77 + g * 151 + b * 28) >> 8; lum[p] = v; if ((p & 3) === 0) hist[v]++; }
    let tot = 0, sum = 0; hist.forEach((c, v) => { tot += c; sum += v * c; });
    let wB = 0, sB = 0, best = 0, T = 128;
    for (let v = 0; v < 256; v++) { wB += hist[v]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += v * hist[v]; const mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF); if (bt > best) { best = bt; T = v; } }
    T = Math.max(70, Math.min(170, Math.round(T * 0.92)));
    const ink = new Uint8Array(W * H);
    for (let i = 0, p = 0; p < W * H; i += 4, p++) {
      if (lum[p] >= T) continue; const r = d[i], g = d[i + 1], b = d[i + 2];
      if ((r - g > 45 && r - b > 45) || (b - r > 40 && b - g > 15)) continue; // 빨간 채점·파란 펜
      ink[p] = 1;
    }
    // 긴 세로선(단 나눔선·테두리)과 긴 가로선(표·머리말 경계)은 글줄 찾기에서 빼고, 위치만 기억
    const VR = Math.max(80, Math.round(H * 0.05)), HR = Math.round(W * 0.16);
    const vRun = new Int32Array(W), hTop = [];
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (!ink[y * W + x]) { y++; continue; }
        let y1 = y, gap = 0;
        while (y1 + 1 < H && (ink[(y1 + 1) * W + x] || (gap < 2 && (gap++, true)))) { y1++; if (ink[y1 * W + x]) gap = 0; }
        if (y1 - y >= VR) { vRun[x] += y1 - y; for (let k = y; k <= y1; k++) ink[k * W + x] = 0; }
        y = y1 + 1;
      }
    }
    for (let y = 0; y < H; y++) {
      const o = y * W; let x = 0, longest = 0;
      while (x < W) {
        if (!ink[o + x]) { x++; continue; }
        let x1 = x, gap = 0;
        while (x1 + 1 < W && (ink[o + x1 + 1] || (gap < 4 && (gap++, true)))) { x1++; if (ink[o + x1]) gap = 0; }
        if (x1 - x >= HR) { longest = Math.max(longest, x1 - x); for (let k = x; k <= x1; k++) ink[o + k] = 0; }
        x = x1 + 1;
      }
      if (longest > W * 0.4) hTop.push(y);
    }
    let top = Math.round(H * 0.02), bot = Math.round(H * 0.975);
    hTop.forEach(y => { if (y < H * 0.22) top = Math.max(top, y + 3); if (y > H * 0.82) bot = Math.min(bot, y - 3); });
    // 단 나누기: 가운데 근처 세로선 → 없으면 가장 넓은 빈 띠
    const colInk = new Int32Array(W); for (let y = top; y < bot; y++) { const o = y * W; for (let x = 0; x < W; x++) colInk[x] += ink[o + x]; }
    const span = bot - top; let div = -1, dv = 0;
    for (let x = Math.round(W * 0.36); x < Math.round(W * 0.64); x++) { let v = 0; for (let k = -4; k <= 4; k++) v += vRun[x + k]; if (v > dv) { dv = v; div = x; } }
    let dl = div, dr = div;
    if (dv >= span * 0.3) { while (dl > W * 0.3 && vRun.slice(dl - 6, dl).some(v => v > 0)) dl--; while (dr < W * 0.7 && vRun.slice(dr, dr + 6).some(v => v > 0)) dr++; }
    else {
      div = -1; let bestW = 0, run = 0;
      const thr = Math.max(2, span * 0.004);
      for (let x = Math.round(W * 0.35); x < Math.round(W * 0.65); x++) {
        if (colInk[x] <= thr) { run++; if (run > bestW) { bestW = run; div = x - Math.floor(run / 2); } } else run = 0;
      }
      if (bestW < W * 0.012) div = -1; dl = div - Math.floor(bestW / 2); dr = div + Math.floor(bestW / 2);
    }
    const m = Math.round(W * 0.01), g = Math.round(W * 0.004);
    const cols = div > 0 ? [[m, dl - g], [dr + g, W - m]] : [[m, W - m]];
    const out = { W, H, top, bot, div, cols: [] };
    cols.forEach(([cx0, cx1]) => {
      const rows = new Int32Array(H), RT = Math.max(3, Math.round((cx1 - cx0) * 0.012));
      for (let y = top; y < bot; y++) { let s = 0; const o = y * W; for (let x = cx0; x < cx1; x++) s += ink[o + x]; rows[y] = s; }
      // 글줄: 잉크가 어느 정도 있는 행이 이어진 곳 (연필 동그라미처럼 가는 자국은 행 기준을 못 넘음)
      const lines = []; let y = top;
      while (y < bot) {
        if (rows[y] < RT) { y++; continue; }
        let y1 = y; while (y1 + 1 < bot && (rows[y1 + 1] >= RT || (y1 + 3 < bot && (rows[y1 + 2] >= RT || rows[y1 + 3] >= RT)))) y1++;
        if (y1 - y >= 4) lines.push({ t: y, b: y1 + 1 });
        y = y1 + 1;
      }
      lines.forEach(l => {
        const h = l.b - l.t, cnt = new Int16Array(cx1 - cx0);
        for (let yy = l.t; yy < l.b; yy++) { const o = yy * W; for (let x = cx0; x < cx1; x++) cnt[x - cx0] += ink[o + x]; }
        const w = Math.max(6, Math.round(h * 0.6)), need = 0.1 * w * h;
        let x0 = -1, s = 0;
        for (let x = 0; x < cnt.length; x++) { s += cnt[x]; if (x >= w) s -= cnt[x - w]; if (x >= w - 1 && s >= need) { x0 = x - w + 1; while (x0 < x && !cnt[x0]) x0++; break; } }
        let x1 = cnt.length - 1; while (x1 > 0 && cnt[x1] < 2) x1--;
        l.x = x0 < 0 ? -1 : cx0 + x0; l.r = cx0 + x1; l.h = h; l.cnt = cnt;
      });
      const txt = lines.filter(l => l.x >= 0 && l.h >= H * 0.006 && l.h <= H * 0.03);
      const hs = txt.map(l => l.h).sort((a, b) => a - b), lh = hs.length ? hs[Math.floor(hs.length / 2)] : H * 0.012;
      // 단의 왼쪽 글자 끝: 두 줄 이상 같은 곳에서 시작하는 가장 왼쪽 자리
      // (꼬리말·머리말 줄은 빼고, 가장 많은 줄이 시작하는 자리보다 너무 왼쪽인 것도 빼고)
      const xs = txt.filter(l => l.t > top + H * 0.01 && l.b < bot - H * 0.05).map(l => l.x).sort((a, b) => a - b);
      const tol = Math.max(6, lh * 0.3), near = v => xs.filter(u => Math.abs(u - v) <= tol).length;
      const mode = xs.reduce((m, v) => near(v) > near(m) ? v : m, xs[0] || cx0);
      let L = mode;
      for (let i = 0; i < xs.length; i++) { if (xs[i] >= mode - lh * 2.5 && near(xs[i]) >= 2) { L = xs[i]; break; } }
      out.cols.push({ x0: cx0, x1: cx1, L, lh, lines: lines.filter(l => l.x >= 0) });
    });
    pg.geom = out;
    return out;
  }
  // 번호 후보 (그림에서): 단 왼쪽 끝에서 시작하는 줄의 왼쪽 위
  function imageAnchors(pg) {
    const G = geom(pg), out = [];
    G.cols.forEach((c, ci) => c.lines.forEach((l, k) => {
      if (l.h < c.lh * 0.6 || l.h > c.lh * 3.2) return;
      // 단 왼쪽 끝(L) 자리에 글자가 있는 줄 = 번호 줄 후보 (들여 쓴 본문·보기 줄은 빠짐)
      const a0 = Math.max(0, Math.round(c.L - c.lh * 0.35 - c.x0)), a1 = Math.min(l.cnt.length, Math.round(c.L + c.lh * 0.75 - c.x0));
      let s = 0, mx = 0; for (let x = a0; x < a1; x++) { s += l.cnt[x]; mx = Math.max(mx, l.cnt[x]); }
      const hh = Math.min(l.h, c.lh * 1.3);
      if (s < 0.06 * (a1 - a0) * hh && mx < 0.33 * hh) return;
      // 왼쪽 여백에 빽빽한 글자가 있으면 번호 줄이 아님 (연필 동그라미처럼 성긴 자국은 괜찮음)
      let ls = 0; const lw = Math.max(1, a0); for (let x = 0; x < a0; x++) ls += l.cnt[x];
      if (a0 > 4 && ls > 0.08 * lw * l.h) return;
      const prev = c.lines[k - 1];
      out.push({ c: ci, x: Math.max(l.x, c.L - c.lh * 0.3), top: l.t, h: l.h, gap: prev ? l.t - prev.b : 999 });
    }));
    return out;
  }
  // PDF 글자 정보로 번호 찾기 (한 글자씩 나뉜 PDF도 낱말로 붙여서 봄)
  async function textLayout(pdfPage, vp) {
    const tc = await pdfPage.getTextContent();
    const W = vp.width, H = vp.height;
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const fh = Math.max(4, Math.hypot(it.transform[2], it.transform[3]) * vp.scale);
      return { s: it.str, x, top: y - fh, b: y, r: x + (it.width || 0) * vp.scale, h: fh };
    });
    if (items.length < 8) return null;
    // 같은 줄끼리 묶고, 가까운 글자는 한 낱말로
    items.sort((a, b) => a.b - b.b || a.x - b.x);
    const lines = [];
    items.forEach(it => { const ln = lines.find(l => Math.abs(l.b - it.b) < it.h * 0.45); if (ln) ln.items.push(it); else lines.push({ b: it.b, items: [it] }); });
    const words = [];
    lines.forEach(ln => {
      ln.items.sort((a, b) => a.x - b.x);
      let w = null;
      ln.items.forEach(it => {
        const s = it.s.replace(/^\s+/, '');
        if (w && it.x - w.r < it.h * 0.3 && !/^\s/.test(it.s) && !/\s$/.test(w.s)) { w.s += s; w.r = Math.max(w.r, it.r); w.h = Math.max(w.h, it.h); w.top = Math.min(w.top, it.top); }
        else { if (w) words.push(w); w = { s, x: it.x, r: it.r, top: it.top, b: it.b, h: it.h, ln }; }
      });
      if (w) words.push(w);
    });
    const firstOf = new Map(); words.forEach(w => { const near = words.filter(o => o.ln === w.ln && o.x < w.x - 2 && Math.abs(o.x - w.x) < W * 0.45 && (o.x < W / 2) === (w.x < W / 2)); if (!near.length) firstOf.set(w, true); });
    const out = [];
    words.forEach(w => {
      if (!firstOf.get(w) || w.top < H * 0.03 || w.top > H * 0.96) return;
      const s = w.s.trim();
      let m = s.match(/^(\d{1,4})\s*[.)](?!\d)/);
      if (m) { out.push({ n: +m[1], x: w.x, top: w.top, h: w.h }); return; }
      m = s.match(/^\[?\s*(서\s*술\s*형|서\s*답\s*형|서\s*논\s*술\s*형|논\s*술\s*형)\s*\[?(\d{1,2})/);
      if (m) out.push({ e: +m[2], x: w.x, top: w.top, h: w.h });
    });
    return out.length ? out : null;
  }
  // 한 쪽의 번호 위치들 → 상자 [x0,y0,x1,y1] (0~1000). stops: 상자가 넘지 말아야 할 다른 문항의 시작 [{c, top}]
  function boxesFor(pg, anchors, stops) {
    const G = geom(pg), W = G.W, H = G.H, res = [];
    const colOf = a => G.cols.length > 1 && a.x >= (G.div > 0 ? G.div : W / 2) ? 1 : 0;
    anchors.forEach(a => { a.c = a.c === undefined ? colOf(a) : a.c; });
    const walls = anchors.concat(stops || []);
    anchors.forEach(a => {
      const c = G.cols[a.c] || G.cols[0];
      const pad = Math.max(4, c.lh * 0.35);
      const nx = walls.filter(o => o !== a && o.c === a.c && o.top > a.top + c.lh * 0.5).sort((p, q) => p.top - q.top)[0];
      const limit = nx ? nx.top - pad * 0.6 : G.bot;
      const inside = c.lines.filter(l => l.t >= a.top - 2 && l.b <= limit + 2);
      const last = inside.length ? Math.max(...inside.map(l => l.b)) : a.top + c.lh;
      const x0 = Math.max(0, Math.min(a.x, c.L) - pad * 1.4), x1 = Math.min(W, c.x1 + (G.cols.length > 1 ? 0 : pad));
      const y0 = Math.max(0, a.top - pad), y1 = Math.min(H, Math.min(limit, last + pad * 1.4));
      res.push(y1 - y0 < H * 0.015 ? null : [x0 / W * 1000, y0 / H * 1000, x1 / W * 1000, y1 / H * 1000].map(v => Math.round(Math.max(0, Math.min(1000, v)))));
    });
    return res;
  }
  const numOf = it => +String(it.no).replace(/[^0-9]/g, '');
  // AI가 짐작한 상자 → (단, 위치). 단은 상자 가운데로 판단 (왼쪽 끝이 나눔선에 걸쳐도 맞게)
  function hintCol(it, p) {
    const G = p.geom, hx = (it.box[0] + Math.min(it.box[2], it.box[0] + 200)) / 2000 * p.w;
    return G && G.cols.length > 1 && hx >= (G.div > 0 ? G.div : p.w / 2) ? 1 : 0;
  }
  // AI가 읽은 문항(no, pg, box)을 번호 위치에 맞춤. pages = load() 결과 (pgBase: 이 묶음의 첫 쪽 번호 - 1)
  // ① PDF 글자로 읽은 번호가 있으면 번호끼리 바로 짝 ② 없으면 그림 후보와 AI 위치를 순서대로 짝
  // 결과: 맞춘 문항 수. 맞춘 문항은 boxSrc 'text'(PDF 글자) 또는 'num'(그림의 번호 줄), 못 맞춘 문항은 AI 상자 그대로(boxSrc 없음)
  function snap(list, pages, pgBase) {
    pgBase = pgBase || 0;
    const rows = list.filter(it => it && numOf(it) && it.boxSrc !== 'manual' && it.boxSrc !== 'pin');
    if (!rows.length || !pages.length) return 0;
    const pageOf = n => pages[n - pgBase - 1];
    const textC = [], imgC = [];
    pages.forEach((p, i) => {
      const pgNo = pgBase + i + 1;
      let G = null; try { G = geom(p); } catch (_) { G = null; }
      const colOf = x => G && G.cols.length > 1 && x >= (G.div > 0 ? G.div : p.w / 2) ? 1 : 0;
      const tl = Array.isArray(p.layout) ? p.layout : [];
      if (tl.length >= 2) tl.forEach(a => textC.push(Object.assign({}, a, { src: 'text', pg: pgNo, page: p, c: colOf(a.x) })));
      if (G) { try { imageAnchors(p).forEach(a => imgC.push(Object.assign(a, { src: 'num', pg: pgNo, page: p, ord: pgNo * 10 + a.c, fy: a.top / p.h }))); } catch (_) { /* 그림 분석 실패 → AI 위치 그대로 */ } }
    });
    let essayK = 0; rows.slice().sort((a, b) => numOf(a) - numOf(b)).forEach(it => { it._e = it.essay ? ++essayK : 0; });
    const pair = new Map(), used = new Set();
    // ① 번호끼리
    rows.forEach(it => {
      const no = numOf(it);
      const m = textC.filter(c => !used.has(c) && (it._e ? (c.e === it._e || c.n === no) : c.n === no));
      if (!m.length) return;
      m.sort((a, b) => Math.abs((a.pg) - (it.pg || a.pg)) - Math.abs((b.pg) - (it.pg || b.pg)) || a.top - b.top);
      pair.set(it, m[0]); used.add(m[0]);
    });
    // ② 그림 후보: AI가 짐작한 자리 순서(쪽 → 단 → 위에서 아래)를 지키며 가장 가까운 짝 (쪽 순서가 뒤섞인 스캔본도 따라감)
    const rest = rows.filter(it => !pair.has(it));
    const taken = [...pair.values()];
    const free = imgC.filter(c => !taken.some(t => t.pg === c.pg && t.c === c.c && Math.abs(t.top - c.top) < Math.max(c.h, t.h || 0) * 1.5));
    imgC.length = 0; free.forEach(c => imgC.push(c));
    if (rest.length && imgC.length) {
      imgC.sort((a, b) => a.ord - b.ord || a.top - b.top);
      const hintOrd = it => { if (!it.pg || !Array.isArray(it.box)) return null; const p = pageOf(it.pg); return p ? it.pg * 10 + hintCol(it, p) + it.box[1] / 1000 * 0.9 : null; };
      const items = rest.slice().sort((a, b) => { const x = hintOrd(a), y = hintOrd(b); return x !== null && y !== null && x !== y ? x - y : numOf(a) - numOf(b); });
      const cost = (it, c) => {
        let v = 0;
        if (it.pg) v += Math.abs(it.pg - c.pg) * 0.6;
        if (Array.isArray(it.box) && it.box.length === 4) {
          v += hintCol(it, c.page) !== c.c ? 0.35 : 0;
          v += Math.abs(it.box[1] / 1000 - c.fy) * 3;
        } else v += 0.3;
        if (c.gap < c.h * 0.9) v += 0.2; // 바로 윗줄과 붙어 있으면 번호 줄일 가능성이 낮음
        return v;
      };
      const I = items.length, C = imgC.length, SKIP = 1.0;
      const dp = Array.from({ length: I + 1 }, () => new Float64Array(C + 1).fill(Infinity)), bk = Array.from({ length: I + 1 }, () => new Int8Array(C + 1));
      for (let j = 0; j <= C; j++) dp[0][j] = 0;
      for (let i = 1; i <= I; i++) {
        dp[i][0] = dp[i - 1][0] + SKIP; bk[i][0] = 1;
        for (let j = 1; j <= C; j++) {
          const a = dp[i][j - 1], b = dp[i - 1][j] + SKIP, m = dp[i - 1][j - 1] + cost(items[i - 1], imgC[j - 1]);
          if (m <= a && m <= b) { dp[i][j] = m; bk[i][j] = 3; } else if (a <= b) { dp[i][j] = a; bk[i][j] = 2; } else { dp[i][j] = b; bk[i][j] = 1; }
        }
      }
      let i = I, j = C;
      while (i > 0 && j >= 0) { const k = bk[i][j]; if (k === 3) { if (cost(items[i - 1], imgC[j - 1]) < 0.9) pair.set(items[i - 1], imgC[j - 1]); i--; j--; } else if (k === 2) j--; else i--; }
    }
    // 쪽마다 상자 계산. 짝을 못 찾은 문항·직접 고친 문항의 시작 자리도 '벽'으로 넣어 상자가 넘어가지 않게
    let hit = 0;
    const byPage = new Map(); pair.forEach((c, it) => { if (!byPage.has(c.page)) byPage.set(c.page, []); byPage.get(c.page).push([it, c]); });
    byPage.forEach((arr, page) => {
      const pgNo = arr[0][1].pg;
      const stops = list.filter(it => it && !pair.has(it) && it.pg === pgNo && Array.isArray(it.box) && it.box.length === 4)
        .map(it => ({ c: hintCol(it, page), top: it.box[1] / 1000 * page.h + (it.boxSrc === 'manual' ? 0 : page.h * 0.01) }));
      const anchors = arr.map(([, c]) => ({ x: c.x, top: c.top, c: c.c }));
      const boxes = boxesFor(page, anchors, stops);
      arr.forEach(([it, c], k) => { if (!boxes[k]) return; it.pg = c.pg; it.box = boxes[k]; it.boxSrc = c.src; it.an = [Math.round(c.x / page.w * 1000), Math.round(c.top / page.h * 1000)]; hit++; });
    });
    rows.forEach(it => { delete it._e; });
    return hit;
  }
  // 직접 찍은 번호 위치(it.an, 0~1000)로 그 쪽의 상자를 다시 계산. 같은 쪽의 번호로 잡은 문항도 경계가 바뀌므로 함께 다시 계산
  function pinBoxes(list, pages, pgBase, pgNos) {
    pgBase = pgBase || 0; let n = 0;
    (pgNos || [...new Set(list.filter(it => it && it.boxSrc === 'pin').map(it => it.pg))]).forEach(pgNo => {
      const page = pages[pgNo - pgBase - 1]; if (!page) return;
      const rows = list.filter(it => it && it.pg === pgNo && ['text', 'num', 'pin'].includes(it.boxSrc) && Array.isArray(it.an || it.box));
      const anchors = rows.map(it => { const a = it.an || [it.box[0] + 8, it.box[1] + 6]; return { x: a[0] / 1000 * page.w, top: a[1] / 1000 * page.h }; });
      const stops = list.filter(it => it && it.pg === pgNo && it.boxSrc === 'manual' && Array.isArray(it.box)).map(it => ({ c: hintCol(it, page), top: it.box[1] / 1000 * page.h }));
      try { geom(page); } catch (_) { return; }
      const boxes = boxesFor(page, anchors, stops);
      rows.forEach((it, k) => { if (boxes[k]) { it.box = boxes[k]; n++; } });
    });
    return n;
  }
  // 번호 찍기: 빠진 번호를 차례로 보여 주고, 쪽 그림에서 그 번호를 누르면 위치를 기록
  // queue: [{label, pg}], marks: [{pg, an:[x,y], label}] (이미 찾은 번호). 결과: Promise<[{k, pg, an:[x,y]}]> (취소하면 null)
  function pickNumbers(pages, queue, marks) {
    return new Promise(resolve => {
      let k = 0, cur = Math.min(Math.max(1, (queue[0] && queue[0].pg) || 1), pages.length);
      const got = [], all = (marks || []).slice();
      const wrap = document.createElement('div');
      wrap.className = 'boxpick';
      wrap.innerHTML = `<div class="bp-in" role="dialog" aria-modal="true" aria-label="번호 찍기"><div class="bp-head"><b data-msg></b>
        <span class="bp-nav">${pages.length > 1 ? '<button type="button" class="btn ghost sm" data-prev aria-label="이전 쪽">‹</button><span data-pgl></span><button type="button" class="btn ghost sm" data-next aria-label="다음 쪽">›</button>' : ''}</span>
        <span><button type="button" class="btn ghost sm" data-skip>이 번호 건너뛰기</button> <button type="button" class="btn ghost sm" data-x>취소</button> <button type="button" class="btn sm" data-ok>끝내기</button></span></div>
        <div class="bp-stage pin"><img alt="쪽 그림"><div class="bp-marks"></div></div></div>`;
      document.body.appendChild(wrap);
      const img = wrap.querySelector('img'), mk = wrap.querySelector('.bp-marks'), stage = wrap.querySelector('.bp-stage');
      const msg = () => { const m = wrap.querySelector('[data-msg]'); m.innerHTML = k < queue.length ? `<span class="pinno">${String(queue[k].label).replace(/</g, '')}번</span> 문항 번호 숫자의 왼쪽 위를 누르세요 <small>${k + 1} / ${queue.length}</small>` : '모두 찍었습니다. ‘끝내기’를 누르세요'; };
      const show = () => {
        img.src = pages[cur - 1].canvas.toDataURL('image/jpeg', 0.75);
        const l = wrap.querySelector('[data-pgl]'); if (l) l.textContent = `${cur} / ${pages.length}쪽`;
        mk.innerHTML = all.filter(o => o.pg === cur).map(o => `<i class="${o.mine ? 'mine' : ''}" style="left:${o.an[0] / 10}%;top:${o.an[1] / 10}%"><span>${String(o.label).replace(/</g, '')}</span></i>`).join('');
        msg();
      };
      const next = () => { k++; if (k < queue.length && queue[k].pg && queue[k].pg !== cur && queue[k].pg <= pages.length) cur = queue[k].pg; show(); };
      stage.addEventListener('click', ev => {
        if (k >= queue.length) return;
        const r = img.getBoundingClientRect();
        const an = [Math.round(Math.max(0, Math.min(1000, (ev.clientX - r.left) / r.width * 1000))), Math.round(Math.max(0, Math.min(1000, (ev.clientY - r.top) / r.height * 1000)))];
        got.push({ k, pg: cur, an }); all.push({ pg: cur, an, label: queue[k].label, mine: 1 });
        next();
      });
      const close = v => { wrap.remove(); resolve(v); };
      const pv = wrap.querySelector('[data-prev]'), nx = wrap.querySelector('[data-next]');
      if (pv) pv.onclick = () => { if (cur > 1) { cur--; show(); } };
      if (nx) nx.onclick = () => { if (cur < pages.length) { cur++; show(); } };
      wrap.querySelector('[data-skip]').onclick = () => { if (k < queue.length) next(); };
      wrap.querySelector('[data-x]').onclick = () => close(null);
      wrap.querySelector('[data-ok]').onclick = () => close(got);
      wrap.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(null); });
      show(); wrap.querySelector('[data-ok]').focus();
    });
  }
  // 쪽 작은 그림 (검수 화면용)
  function thumb(pg, w) {
    const sc = (w || 560) / pg.w, c = document.createElement('canvas');
    c.width = Math.round(pg.w * sc); c.height = Math.round(pg.h * sc);
    c.getContext('2d').drawImage(pg.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  }
  async function count(f) {
    if (!isPdf(f)) return 1;
    const pdfjs = await lib();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    return doc.numPages;
  }

  // box = [x0, y0, x1, y1] (0~1000) → 작은 JPEG data URL
  function crop(pg, box, opt) {
    if (!pg || !box || box.length !== 4) return '';
    const pad = (opt && opt.pad) || 12, maxW = (opt && opt.maxW) || 720;
    let [x0, y0, x1, y1] = box.map(Number);
    if (!(x1 > x0 && y1 > y0)) return '';
    const X0 = Math.max(0, x0 / 1000 * pg.w - pad), Y0 = Math.max(0, y0 / 1000 * pg.h - pad);
    const X1 = Math.min(pg.w, x1 / 1000 * pg.w + pad), Y1 = Math.min(pg.h, y1 / 1000 * pg.h + pad);
    const w = X1 - X0, h = Y1 - Y0; if (w < 20 || h < 20) return '';
    const sc = Math.min(1, maxW / w);
    const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(pg.canvas, X0, Y0, w, h, 0, 0, c.width, c.height);
    let q = 0.78, d = c.toDataURL('image/jpeg', q);
    while (d.length > 140000 && q > 0.4) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
    return d;
  }

  // 쪽 위에서 영역을 고치는 창: 상자 안을 끌면 옮기기, 모서리를 끌면 크기 조절, 바깥을 끌면 새로 그리기, 쪽 넘기기
  // others: [{pg, box, label}] 같은 쪽의 다른 문항 (흐리게 표시). 결과: Promise<{pg, box}|null>
  function pickBox(pages, pgNo, current, others) {
    return new Promise(resolve => {
      let cur = Math.min(Math.max(1, pgNo || 1), pages.length);
      const wrap = document.createElement('div');
      wrap.className = 'boxpick';
      wrap.innerHTML = `<div class="bp-in" role="dialog" aria-modal="true" aria-label="문항 영역 고치기"><div class="bp-head"><b>상자 안을 끌면 옮겨지고, 모서리를 끌면 크기가 바뀝니다 <small>바깥을 끌면 새로 그립니다</small></b>
        <span class="bp-nav">${pages.length > 1 ? '<button type="button" class="btn ghost sm" data-prev aria-label="이전 쪽">‹</button><span data-pgl></span><button type="button" class="btn ghost sm" data-next aria-label="다음 쪽">›</button>' : ''}</span>
        <span><button type="button" class="btn ghost sm" data-x>취소</button> <button type="button" class="btn sm" data-ok>이 영역으로</button></span></div>
        <div class="bp-stage"><img alt="쪽 그림"><div class="bp-others"></div><i class="bp-rect"><i data-h="0"></i><i data-h="1"></i><i data-h="2"></i><i data-h="3"></i></i></div></div>`;
      document.body.appendChild(wrap);
      const img = wrap.querySelector('img'), rect = wrap.querySelector('.bp-rect'), stage = wrap.querySelector('.bp-stage'), oth = wrap.querySelector('.bp-others');
      let box = current ? current.slice() : null, drag = null;
      const show = () => {
        img.src = pages[cur - 1].canvas.toDataURL('image/jpeg', 0.75);
        const l = wrap.querySelector('[data-pgl]'); if (l) l.textContent = `${cur} / ${pages.length}쪽`;
        oth.innerHTML = (others || []).filter(o => o.pg === cur && o.box).map(o => `<i style="left:${o.box[0] / 10}%;top:${o.box[1] / 10}%;width:${(o.box[2] - o.box[0]) / 10}%;height:${(o.box[3] - o.box[1]) / 10}%"><span>${String(o.label || '').replace(/</g, '')}</span></i>`).join('');
        draw();
      };
      const draw = () => { if (!box) { rect.style.display = 'none'; return; } rect.style.display = 'block'; rect.style.left = box[0] / 10 + '%'; rect.style.top = box[1] / 10 + '%'; rect.style.width = (box[2] - box[0]) / 10 + '%'; rect.style.height = (box[3] - box[1]) / 10 + '%'; };
      const pos = ev => { const r = img.getBoundingClientRect(); const p = ev.touches ? ev.touches[0] : ev; return [Math.max(0, Math.min(1000, (p.clientX - r.left) / r.width * 1000)), Math.max(0, Math.min(1000, (p.clientY - r.top) / r.height * 1000))]; };
      const down = ev => {
        ev.preventDefault();
        const p = pos(ev), h = ev.target.dataset && ev.target.dataset.h;
        if (h !== undefined && box) drag = { mode: 'h', h: +h, b0: box.slice(), p0: p };
        else if (box && p[0] > box[0] && p[0] < box[2] && p[1] > box[1] && p[1] < box[3]) drag = { mode: 'm', b0: box.slice(), p0: p };
        else { drag = { mode: 'n', p0: p }; box = [p[0], p[1], p[0], p[1]]; }
        draw();
      };
      const move = ev => {
        if (!drag) return; ev.preventDefault();
        const p = pos(ev), dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1], b = drag.b0;
        if (drag.mode === 'n') box = [Math.min(drag.p0[0], p[0]), Math.min(drag.p0[1], p[1]), Math.max(drag.p0[0], p[0]), Math.max(drag.p0[1], p[1])];
        else if (drag.mode === 'm') { const w = b[2] - b[0], hh = b[3] - b[1]; const x0 = Math.max(0, Math.min(1000 - w, b[0] + dx)), y0 = Math.max(0, Math.min(1000 - hh, b[1] + dy)); box = [x0, y0, x0 + w, y0 + hh]; }
        else { const nb = b.slice(); if (drag.h === 0 || drag.h === 2) nb[0] = b[0] + dx; else nb[2] = b[2] + dx; if (drag.h < 2) nb[1] = b[1] + dy; else nb[3] = b[3] + dy;
          box = [Math.min(nb[0], nb[2]), Math.min(nb[1], nb[3]), Math.max(nb[0], nb[2]), Math.max(nb[1], nb[3])].map(v => Math.max(0, Math.min(1000, v))); }
        draw();
      };
      const up = () => { drag = null; };
      stage.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      stage.addEventListener('touchstart', down, { passive: false }); stage.addEventListener('touchmove', move, { passive: false }); stage.addEventListener('touchend', up);
      const close = v => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); wrap.remove(); resolve(v); };
      const pv = wrap.querySelector('[data-prev]'), nx = wrap.querySelector('[data-next]');
      if (pv) pv.onclick = () => { if (cur > 1) { cur--; box = null; show(); } };
      if (nx) nx.onclick = () => { if (cur < pages.length) { cur++; box = null; show(); } };
      wrap.querySelector('[data-x]').onclick = () => close(null);
      wrap.querySelector('[data-ok]').onclick = () => close(box && box[2] - box[0] > 10 && box[3] - box[1] > 10 ? { pg: cur, box: box.map(Math.round) } : null);
      wrap.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(null); });
      show(); wrap.querySelector('[data-ok]').focus();
    });
  }
  // 그림 크게 보기
  function zoom(src, title) {
    if (!src) return;
    const w = document.createElement('div'); w.className = 'boxpick';
    w.innerHTML = `<div class="bp-in" role="dialog" aria-modal="true" aria-label="${(title || '문항 그림').replace(/"/g, '')}"><div class="bp-head"><b></b><button type="button" class="btn ghost sm" data-x>닫기</button></div><div class="bp-stage zoom"><img alt=""></div></div>`;
    w.querySelector('b').textContent = title || '문항 그림'; w.querySelector('img').src = src;
    document.body.appendChild(w);
    const close = () => w.remove();
    w.querySelector('[data-x]').onclick = close; w.onclick = ev => { if (ev.target === w) close(); };
    w.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); });
    w.querySelector('[data-x]').focus();
  }
  return { load, count, crop, thumb, pickBox, pickNumbers, pinBoxes, zoom, snap, textLayout, geom, imageAnchors, boxesFor, isPdf, isImg };
})();
