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
  // PDF 글자 위치로 문항 영역 계산 (한글에서 만든 PDF처럼 글자 정보가 있을 때)
  // 결과: [{no:'1', box:[x0,y0,x1,y1] (0~1000)}] 또는 null(사진·스캔본)
  async function textLayout(pdfPage, vp) {
    const tc = await pdfPage.getTextContent();
    const W = vp.width, H = vp.height;
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const fh = Math.max(4, Math.hypot(it.transform[2], it.transform[3]) * vp.scale);
      return { s: it.str.trim(), x, top: y - fh, b: y, r: x + (it.width || 0) * vp.scale, h: fh };
    });
    if (items.length < 8) return null;
    const hs = items.map(i => i.h).sort((a, b) => a - b), medH = hs[Math.floor(hs.length / 2)];
    // 문항 번호 후보: "1." "1)" "01." 또는 굵은 숫자 하나
    let mk = items.map(i => {
      let m = i.s.match(/^(\d{1,2})\s*[.)](?!\d)/);
      if (!m && /^\d{1,2}$/.test(i.s) && i.h >= medH * 1.05) m = [0, i.s];
      return m ? { n: +m[1], x: i.x, top: i.top, h: i.h } : null;
    }).filter(m => m && m.n >= 1 && m.n <= 60 && m.top > H * 0.03 && m.top < H * 0.95);
    // 줄의 맨 앞에 있는 번호만 (문장 중간의 "7)" 같은 것은 제외)
    const first = (m, lo, hi) => !items.some(i => i.x < m.x - 2 && i.x >= lo && i.x < hi && Math.abs(i.b - (m.top + m.h)) < m.h * 0.6);
    const mid = W / 2;
    const left0 = Math.min(...items.filter(i => i.top > H * 0.03 && i.top < H * 0.95).map(i => i.x));
    const c0 = mk.filter(m => m.x <= left0 + W * 0.05 && first(m, 0, mid));
    const rightItems = items.filter(i => i.x >= mid - W * 0.03 && i.top > H * 0.03 && i.top < H * 0.95);
    const left1 = rightItems.length ? Math.min(...rightItems.map(i => i.x)) : W;
    const c1 = mk.filter(m => m.x >= mid - W * 0.03 && m.x <= left1 + W * 0.05 && first(m, mid - W * 0.03, W));
    const two = c1.length >= 2;
    const colOf = x => two && x >= mid - W * 0.03 ? 1 : 0;
    const cols = [c0.sort((a, b) => a.top - b.top), two ? c1.sort((a, b) => a.top - b.top) : []];
    // 읽는 순서(왼쪽 단 → 오른쪽 단)로 번호가 커지는 가장 긴 줄만 남김
    const seq = cols[0].map(m => Object.assign({ c: 0 }, m)).concat(cols[1].map(m => Object.assign({ c: 1 }, m)));
    const L = seq.map(() => 1), P = seq.map(() => -1);
    for (let i = 0; i < seq.length; i++) for (let j = 0; j < i; j++) if (seq[j].n < seq[i].n && L[j] + 1 > L[i]) { L[i] = L[j] + 1; P[i] = j; }
    let k = L.indexOf(Math.max(...L)); const keep = [];
    while (k >= 0) { keep.unshift(seq[k]); k = P[k]; }
    if (keep.length < 2) return null;
    const pad = H * 0.006;
    const body = items.filter(i => i.top < H * 0.94);
    const out = [];
    keep.forEach((m, idx) => {
      const inCol = body.filter(i => colOf(i.x) === m.c);
      const left = Math.max(0, m.x - W * 0.012);
      const right = two ? (m.c === 0 ? mid - W * 0.008 : Math.min(W, Math.max(...inCol.map(i => i.r)) + W * 0.01)) : Math.min(W, Math.max(...body.map(i => i.r)) + W * 0.01);
      const nx = keep.slice(idx + 1).find(o => o.c === m.c);
      const bottom = nx ? nx.top - pad : Math.min(H, Math.max(...inCol.filter(i => i.top >= m.top).map(i => i.b)) + pad * 2);
      const top = Math.max(0, m.top - pad);
      if (bottom - top < H * 0.02) return;
      out.push({ no: String(m.n), box: [left / W * 1000, top / H * 1000, right / W * 1000, bottom / H * 1000].map(v => Math.round(Math.max(0, Math.min(1000, v)))) });
    });
    return out.length >= 2 ? out : null;
  }
  // AI가 읽은 문항(no, pg, box)에 글자 위치 영역을 덮어씀. pages = load() 결과 (pgBase: 이 묶음의 첫 쪽 번호 - 1)
  function snap(list, pages, pgBase) {
    const lay = []; pages.forEach((p, i) => (p.layout || []).forEach(l => lay.push({ no: l.no, box: l.box, pg: (pgBase || 0) + i + 1 })));
    if (!lay.length) return 0;
    let hit = 0;
    list.forEach(it => {
      const no = String(it.no).replace(/[^0-9]/g, ''); if (!no) return;
      const c = lay.filter(l => l.no === String(+no)); if (!c.length) return;
      const best = c.find(l => l.pg === it.pg) || (c.length === 1 ? c[0] : null); if (!best) return;
      it.pg = best.pg; it.box = best.box.slice(); it.boxSrc = 'text'; hit++;
    });
    return hit;
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
  return { load, count, crop, thumb, pickBox, zoom, snap, textLayout, isPdf, isImg };
})();
