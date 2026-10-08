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
          out.push({ canvas: c, w: c.width, h: c.height, file: f.name, page: i, b64: toB64(c) });
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

  // 쪽 위에서 영역을 다시 잡는 창 (드래그, 쪽 넘기기). 결과: Promise<{pg, box}|null>  (pg는 1부터)
  function pickBox(pages, pgNo, current) {
    return new Promise(resolve => {
      let cur = Math.min(Math.max(1, pgNo || 1), pages.length);
      const wrap = document.createElement('div');
      wrap.className = 'boxpick';
      wrap.innerHTML = `<div class="bp-in" role="dialog" aria-modal="true" aria-label="문항 영역 잡기"><div class="bp-head"><b>문항 영역을 끌어서 잡으세요</b>
        <span class="bp-nav">${pages.length > 1 ? '<button type="button" class="btn ghost sm" data-prev aria-label="이전 쪽">‹</button><span data-pgl></span><button type="button" class="btn ghost sm" data-next aria-label="다음 쪽">›</button>' : ''}</span>
        <span><button type="button" class="btn ghost sm" data-x>취소</button> <button type="button" class="btn sm" data-ok>이 영역으로</button></span></div>
        <div class="bp-stage"><img alt="시험지 쪽"><i class="bp-rect"></i></div></div>`;
      document.body.appendChild(wrap);
      const img = wrap.querySelector('img'), rect = wrap.querySelector('.bp-rect'), stage = wrap.querySelector('.bp-stage');
      let box = current ? current.slice() : null, start = null;
      const show = () => { img.src = pages[cur - 1].canvas.toDataURL('image/jpeg', 0.7); const l = wrap.querySelector('[data-pgl]'); if (l) l.textContent = `${cur} / ${pages.length}쪽`; draw(); };
      const draw = () => { if (!box) { rect.style.display = 'none'; return; } rect.style.display = 'block'; rect.style.left = box[0] / 10 + '%'; rect.style.top = box[1] / 10 + '%'; rect.style.width = (box[2] - box[0]) / 10 + '%'; rect.style.height = (box[3] - box[1]) / 10 + '%'; };
      const pos = ev => { const r = img.getBoundingClientRect(); const p = ev.touches ? ev.touches[0] : ev; return [Math.max(0, Math.min(1000, (p.clientX - r.left) / r.width * 1000)), Math.max(0, Math.min(1000, (p.clientY - r.top) / r.height * 1000))]; };
      const down = ev => { ev.preventDefault(); start = pos(ev); box = [start[0], start[1], start[0], start[1]]; draw(); };
      const move = ev => { if (!start) return; ev.preventDefault(); const p = pos(ev); box = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])]; draw(); };
      const up = () => { start = null; };
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
  return { load, count, crop, thumb, pickBox, zoom, isPdf, isImg };
})();
