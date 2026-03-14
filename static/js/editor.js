/* editor.js — PDF Editor: canvas annotations, page reorder, save */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    escHtml, showResult, showResultError, attachRipple, formatBytes
  } = window.PDFSuite;

  // ── State ──────────────────────────────────────────────────────────────
  let fileId     = null;
  let pageCount  = 0;
  let pagesInfo  = [];      // [{width, height}]
  let currentPage = 0;
  let pageOrder  = [];      // current 0-based page indices
  let activeTool = 'select';
  let annotations = {};     // { pageIdx: [{type,x,y,w,h,text,color,font_size}] }
  let isDrawing  = false;
  let drawStart  = null;
  let pendingAnnot = null;  // for text/note popup
  let scale      = 1.5;     // render scale

  // ── DOM refs ──────────────────────────────────────────────────────────
  const workspace    = document.getElementById('editorWorkspace');
  const pageList     = document.getElementById('editorPageList');
  const pageCountEl  = document.getElementById('editorPageCount');
  const pageImg      = document.getElementById('editorPageImg');
  const overlay      = document.getElementById('editorOverlay');
  const ctx          = overlay.getContext('2d');
  const textPopup    = document.getElementById('editorTextPopup');
  const textInput    = document.getElementById('editorTextInput');
  const textOkBtn    = document.getElementById('editorTextOk');
  const textCancelBtn= document.getElementById('editorTextCancel');
  const colorPicker  = document.getElementById('editorColor');
  const fontSizeInput= document.getElementById('editorFontSize');
  const saveBtn      = document.getElementById('editorSaveBtn');
  const reorderBtn   = document.getElementById('editorReorderBtn');

  attachRipple(saveBtn);
  attachRipple(reorderBtn);

  // ── Upload ────────────────────────────────────────────────────────────
  setupUploadZone({
    zoneId:  'editorUpload',
    inputId: 'editorFile',
    infoId:  null,
    onFile: async (file) => {
      if (!file) return;
      Progress.show('Loading PDF for editing…');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const data = await postFormData('/api/editor/upload', fd);
        fileId    = data.file_id;
        pageCount = data.page_count;
        pagesInfo = data.pages;
        pageOrder = Array.from({ length: pageCount }, (_, i) => i);
        annotations = {};
        currentPage = 0;

        pageCountEl.textContent = `(${pageCount})`;
        workspace.classList.remove('hidden');
        document.getElementById('editorResult').classList.add('hidden');

        renderPageList();
        await loadPageImage(0);

        if (data.warning) Toast.show(data.warning, 'warn');
      } catch (err) {
        Toast.show('Upload failed: ' + err.message, 'error');
      } finally {
        Progress.hide();
      }
    }
  });

  // ── Tool selection ────────────────────────────────────────────────────
  document.querySelectorAll('.editor-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.editor-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTool = btn.dataset.tool;
      overlay.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
    });
  });

  // ── Page list render ──────────────────────────────────────────────────
  function renderPageList() {
    pageList.innerHTML = '';
    let listDragSrc = null;

    pageOrder.forEach((origIdx, listPos) => {
      const li = document.createElement('li');
      li.className = 'editor-page-thumb' + (listPos === currentPage ? ' active' : '');
      li.setAttribute('draggable', 'true');
      li.setAttribute('data-listpos', listPos);
      li.setAttribute('aria-label', `Page ${listPos + 1}`);
      li.innerHTML = `
        <img src="" alt="Page ${listPos + 1}" data-listpos="${listPos}" />
        <div class="editor-page-thumb__num">${listPos + 1}</div>
        <button class="editor-page-thumb__del" aria-label="Delete page ${listPos + 1}" data-listpos="${listPos}">✕</button>
      `;

      // Fetch thumb
      fetchPageThumb(origIdx, li.querySelector('img'));

      // Click to navigate
      li.addEventListener('click', async e => {
        if (e.target.classList.contains('editor-page-thumb__del')) return;
        currentPage = parseInt(li.dataset.listpos || listPos);
        document.querySelectorAll('.editor-page-thumb').forEach(t => t.classList.remove('active'));
        li.classList.add('active');
        await loadPageImage(origIdx);
      });

      // Delete page
      li.querySelector('.editor-page-thumb__del').addEventListener('click', e => {
        e.stopPropagation();
        const pos = parseInt(li.dataset.listpos);
        pageOrder.splice(pos, 1);
        pageCount = pageOrder.length;
        if (currentPage >= pageCount) currentPage = Math.max(0, pageCount - 1);
        annotations[origIdx] = undefined;
        renderPageList();
        if (pageCount > 0) loadPageImage(pageOrder[currentPage]);
      });

      // Drag reorder
      li.addEventListener('dragstart', e => {
        listDragSrc = li;
        e.dataTransfer.effectAllowed = 'move';
        li.style.opacity = '0.4';
      });
      li.addEventListener('dragend', () => { li.style.opacity = ''; });
      li.addEventListener('dragover', e => { e.preventDefault(); li.style.background = 'var(--mode-tab-active-bg)'; });
      li.addEventListener('dragleave', () => { li.style.background = ''; });
      li.addEventListener('drop', e => {
        e.preventDefault();
        li.style.background = '';
        if (!listDragSrc || listDragSrc === li) return;
        const srcPos  = parseInt(listDragSrc.dataset.listpos);
        const destPos = parseInt(li.dataset.listpos);
        const moved = pageOrder.splice(srcPos, 1)[0];
        pageOrder.splice(destPos, 0, moved);
        currentPage = destPos;
        renderPageList();
        loadPageImage(pageOrder[currentPage]);
      });

      li.dataset.listpos = listPos;
      pageList.appendChild(li);
    });
  }

  async function fetchPageThumb(origIdx, imgEl) {
    try {
      const resp = await fetch(`/api/preview?file_id=${fileId}&page=${origIdx}&scale=0.3`);
      const data = await resp.json();
      if (data.status === 'ok') imgEl.src = data.image;
    } catch (_) {}
  }

  async function loadPageImage(origIdx) {
    if (fileId === null) return;
    try {
      const resp = await fetch(`/api/preview?file_id=${fileId}&page=${origIdx}&scale=${scale}`);
      const data = await resp.json();
      if (data.status === 'ok') {
        pageImg.src = data.image;
        pageImg.onload = () => {
          overlay.width  = pageImg.naturalWidth;
          overlay.height = pageImg.naturalHeight;
          overlay.style.width  = pageImg.offsetWidth  + 'px';
          overlay.style.height = pageImg.offsetHeight + 'px';
          redrawAnnotations(origIdx);
        };
      }
    } catch (err) {
      Toast.show('Page load failed: ' + err.message, 'error');
    }
  }

  // Resize observer to keep overlay in sync
  const resizeObs = new ResizeObserver(() => {
    if (pageImg.naturalWidth) {
      overlay.style.width  = pageImg.offsetWidth  + 'px';
      overlay.style.height = pageImg.offsetHeight + 'px';
    }
  });
  resizeObs.observe(pageImg);

  // ── Canvas annotation drawing ─────────────────────────────────────────
  overlay.addEventListener('mousedown', e => {
    if (activeTool === 'select') return;
    isDrawing = true;
    const pos = getCanvasPos(e);
    drawStart = pos;

    if (activeTool === 'text' || activeTool === 'note') {
      isDrawing = false;
      pendingAnnot = pos;
      showTextPopup(e.clientX, e.clientY);
    }
  });

  overlay.addEventListener('mousemove', e => {
    if (!isDrawing || activeTool === 'select') return;
    const pos = getCanvasPos(e);
    redrawAnnotations(pageOrder[currentPage]);
    // Draw in-progress shape preview
    const col = hexToRgb(colorPicker.value);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    if (activeTool === 'rect') {
      ctx.strokeRect(drawStart.x, drawStart.y, pos.x - drawStart.x, pos.y - drawStart.y);
    } else if (activeTool === 'highlight') {
      ctx.fillStyle = col.replace('rgb', 'rgba').replace(')', ', 0.35)');
      ctx.fillRect(drawStart.x, drawStart.y, pos.x - drawStart.x, pos.y - drawStart.y);
    }
  });

  overlay.addEventListener('mouseup', e => {
    if (!isDrawing) return;
    isDrawing = false;
    const pos = getCanvasPos(e);
    const origIdx = pageOrder[currentPage];

    const w = pos.x - drawStart.x;
    const h = pos.y - drawStart.y;

    if (Math.abs(w) < 5 && Math.abs(h) < 5) return; // ignore tiny drags

    // Convert canvas coords back to PDF user-space points
    const pdfW = pagesInfo[origIdx]?.width  || 595;
    const pdfH = pagesInfo[origIdx]?.height || 842;
    const scaleX = pdfW / overlay.width;
    const scaleY = pdfH / overlay.height;

    const annot = {
      type:      activeTool,
      page:      origIdx,
      x:         drawStart.x * scaleX,
      y:         drawStart.y * scaleY,
      width:     w * scaleX,
      height:    h * scaleY,
      text:      '',
      color:     hexToRgbArr(colorPicker.value),
      font_size: parseFloat(fontSizeInput.value) || 12,
    };

    if (!annotations[origIdx]) annotations[origIdx] = [];
    annotations[origIdx].push(annot);
    redrawAnnotations(origIdx);
  });

  function showTextPopup(clientX, clientY) {
    textInput.value = '';
    textPopup.style.left = Math.min(clientX - overlay.getBoundingClientRect().left, overlay.offsetWidth - 260) + 'px';
    textPopup.style.top  = Math.min(clientY - overlay.getBoundingClientRect().top,  overlay.offsetHeight - 120) + 'px';
    textPopup.classList.remove('hidden');
    textInput.focus();
  }

  textOkBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (!text || !pendingAnnot) { textPopup.classList.add('hidden'); return; }

    const origIdx = pageOrder[currentPage];
    const pdfW = pagesInfo[origIdx]?.width  || 595;
    const pdfH = pagesInfo[origIdx]?.height || 842;
    const scaleX = pdfW / overlay.width;
    const scaleY = pdfH / overlay.height;

    const annot = {
      type:      activeTool,
      page:      origIdx,
      x:         pendingAnnot.x * scaleX,
      y:         pendingAnnot.y * scaleY,
      width:     200,
      height:    50,
      text,
      color:     hexToRgbArr(colorPicker.value),
      font_size: parseFloat(fontSizeInput.value) || 12,
    };

    if (!annotations[origIdx]) annotations[origIdx] = [];
    annotations[origIdx].push(annot);
    redrawAnnotations(origIdx);
    textPopup.classList.add('hidden');
    pendingAnnot = null;
  });

  textCancelBtn.addEventListener('click', () => {
    textPopup.classList.add('hidden');
    pendingAnnot = null;
  });

  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textOkBtn.click(); }
    if (e.key === 'Escape') textCancelBtn.click();
  });

  function redrawAnnotations(origIdx) {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const annots = annotations[origIdx] || [];
    const pdfW = pagesInfo[origIdx]?.width  || 595;
    const pdfH = pagesInfo[origIdx]?.height || 842;
    const scaleX = overlay.width  / pdfW;
    const scaleY = overlay.height / pdfH;

    annots.forEach(a => {
      const cx = a.x * scaleX;
      const cy = a.y * scaleY;
      const cw = a.width  * scaleX;
      const ch = a.height * scaleY;
      const colStr = Array.isArray(a.color)
        ? `rgb(${a.color.map(v => Math.round(v * 255)).join(',')})`
        : (a.color || '#6366f1');

      ctx.save();
      if (a.type === 'rect') {
        ctx.strokeStyle = colStr;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cw, ch);
      } else if (a.type === 'highlight') {
        ctx.fillStyle = colStr.replace('rgb', 'rgba').replace(')', ', 0.35)');
        ctx.fillRect(cx, cy, cw, ch);
      } else if (a.type === 'text') {
        ctx.fillStyle = colStr;
        ctx.font = `${(a.font_size * scaleX) | 0}px Inter, sans-serif`;
        ctx.fillText(a.text, cx, cy + a.font_size * scaleY);
      } else if (a.type === 'note') {
        // Sticky note icon
        ctx.fillStyle = 'rgba(250,204,21,0.9)';
        ctx.fillRect(cx, cy, 24, 24);
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, 24, 24);
        ctx.fillStyle = '#78350f';
        ctx.font = `${12 * scaleX | 0}px Inter, sans-serif`;
        ctx.fillText('📝', cx + 2, cy + 17);
      }
      ctx.restore();
    });
  }

  function getCanvasPos(e) {
    const rect = overlay.getBoundingClientRect();
    const scaleX = overlay.width  / rect.width;
    const scaleY = overlay.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  // ── Save PDF ──────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    if (!fileId) { Toast.show('No PDF loaded.', 'warn'); return; }

    Progress.show('Applying annotations and saving…');
    try {
      // Flatten all annotations
      const allAnnots = Object.values(annotations).flat().filter(Boolean);

      const fd = new FormData();
      fd.append('file_id', fileId);
      fd.append('edits', JSON.stringify(allAnnots));

      const data = await postFormData('/api/edit/save', fd);

      showResult('editorResult', {
        title: 'PDF Saved with Annotations',
        stats: [
          { label: 'Annotations', val: allAnnots.length },
          { label: 'File size',   val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'edited.pdf',
      });

      Toast.show('PDF saved successfully!', 'success');
    } catch (err) {
      showResultError('editorResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      Progress.hide();
    }
  });

  // ── Apply reorder ─────────────────────────────────────────────────────
  reorderBtn.addEventListener('click', async () => {
    if (!fileId) { Toast.show('No PDF loaded.', 'warn'); return; }
    if (pageOrder.length === pagesInfo.length &&
        pageOrder.every((v, i) => v === i)) {
      Toast.show('Page order has not changed.', 'info'); return;
    }

    Progress.show('Reordering pages…');
    try {
      const fd = new FormData();
      fd.append('file_id', fileId);
      fd.append('page_order', JSON.stringify(pageOrder));

      const data = await postFormData('/api/editor/reorder', fd);

      fileId    = data.file_id;
      pageCount = data.page_count;
      pagesInfo = data.pages;
      pageOrder = Array.from({ length: pageCount }, (_, i) => i);
      annotations = {};
      currentPage = 0;

      renderPageList();
      await loadPageImage(0);
      Toast.show('Page order applied.', 'success');
    } catch (err) {
      Toast.show('Reorder failed: ' + err.message, 'error');
    } finally {
      Progress.hide();
    }
  });

  // ── Colour helpers ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${r},${g},${b})`;
  }

  function hexToRgbArr(hex) {
    return [
      parseInt(hex.slice(1,3),16) / 255,
      parseInt(hex.slice(3,5),16) / 255,
      parseInt(hex.slice(5,7),16) / 255,
    ];
  }
});
