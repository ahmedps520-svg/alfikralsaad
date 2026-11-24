/* الفكر السعد — tiny PDF builder.
 * Turns photographed pages (JPEG) into one PDF on the phone: one page per photo, A4 width,
 * page height following the photo's shape. No external library needed.
 */
(function () {
  const enc = new TextEncoder();
  const A4_W = 595.28; // points

  // pages: [{ jpeg: Uint8Array, width: px, height: px }]  ->  Blob (application/pdf)
  function build(pages) {
    const chunks = [];
    const offsets = [];
    let pos = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
    const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = pages.length;
    // objects: 1 catalog, 2 pages, then per page: page, image, content
    const pageId = (i) => 3 + i * 3;
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
    pages.forEach((p, i) => {
      const W = A4_W, H = +(A4_W * (p.height / p.width)).toFixed(2);
      const pid = pageId(i), iid = pid + 1, cid = pid + 2;
      obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
      obj(iid, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
        push(p.jpeg);
        push('\nendstream');
      });
      const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    });
    const total = 3 + n * 3;
    const xref = pos;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let k = 1; k < total; k++) x += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  // Draws an image/video frame onto a canvas (max side `max` px), lightly boosts contrast so
  // paper text reads better, and returns { jpeg, width, height, dataUrl }.
  function pageFromSource(source, sw, sh, max) {
    const scale = Math.min(1, (max || 1600) / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    try { x.filter = 'contrast(1.18) brightness(1.04) saturate(.9)'; } catch (e) {}
    x.drawImage(source, 0, 0, sw, sh, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/jpeg', 0.72);
    const bin = atob(dataUrl.split(',')[1]);
    const jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    return { jpeg, width: w, height: h, dataUrl };
  }

  const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

  window.FikrPdf = { build, pageFromSource, toDataUrl };
})();
