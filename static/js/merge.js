/* merge.js — PDF Merge tool logic */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, postFormData, formatBytes,
    escHtml, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  const uploadZone = document.getElementById('mergeUpload');
  const fileInput  = document.getElementById('mergeFiles');
  const fileList   = document.getElementById('mergeFileList');
  const sortable   = document.getElementById('mergeSortable');
  const countLabel = document.getElementById('mergeCount');
  const clearBtn   = document.getElementById('mergeClearBtn');
  const mergeBtn   = document.getElementById('mergeBtn');

  let files = [];       // { file: File, thumbUrl: string, id: string }
  let dragSrc = null;   // item being dragged

  attachRipple(mergeBtn);

  // ── Upload zone ─────────────────────────────────────────────────────────
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    addFiles([...e.dataTransfer.files]);
  });
  fileInput.addEventListener('change', () => {
    addFiles([...fileInput.files]);
    fileInput.value = '';
  });

  clearBtn.addEventListener('click', () => {
    files = [];
    renderList();
    document.getElementById('mergeResult').classList.add('hidden');
  });

  async function addFiles(newFiles) {
    const pdfs = newFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { Toast.show('Only PDF files accepted.', 'warn'); return; }
    if (files.length + pdfs.length > 50) { Toast.show('Maximum 50 files allowed.', 'warn'); pdfs.splice(50 - files.length); }

    for (const f of pdfs) {
      const id = Math.random().toString(36).slice(2);
      const entry = { file: f, id, thumbUrl: null };
      files.push(entry);
      renderList();   // show immediately with placeholder

      // Fetch thumbnail in background
      try {
        const fd = new FormData();
        fd.append('file', f);
        const data = await postFormData('/api/merge/thumbnail', fd);
        entry.thumbUrl = data.thumbnail;
        entry.pages    = data.pages;
        updateItemThumb(id, data.thumbnail);
      } catch (_) {}
    }
  }

  function renderList() {
    sortable.innerHTML = '';
    files.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = 'sortable-item';
      li.dataset.id = entry.id;
      li.setAttribute('draggable', 'true');
      li.setAttribute('role', 'listitem');
      li.style.animationDelay = (idx * 40) + 'ms';
      li.innerHTML = `
        <span class="sortable-item__handle" aria-hidden="true">⠿</span>
        <div class="sortable-item__thumb">
          ${entry.thumbUrl ? `<img src="${entry.thumbUrl}" alt="Page 1" />` : '<div style="width:100%;height:100%;background:var(--border)"></div>'}
        </div>
        <div class="sortable-item__info">
          <div class="sortable-item__name" title="${escHtml(entry.file.name)}">${escHtml(entry.file.name)}</div>
          <div class="sortable-item__meta">${formatBytes(entry.file.size)}${entry.pages ? ` · ${entry.pages} pages` : ''}</div>
        </div>
        <button class="sortable-item__remove" aria-label="Remove ${escHtml(entry.file.name)}" data-id="${entry.id}">✕</button>
      `;
      attachDragEvents(li);
      li.querySelector('.sortable-item__remove').addEventListener('click', () => removeFile(entry.id));
      sortable.appendChild(li);
    });

    countLabel.textContent = `${files.length} file${files.length !== 1 ? 's' : ''} selected`;
    fileList.classList.toggle('hidden', files.length === 0);
  }

  function updateItemThumb(id, thumbUrl) {
    const li = sortable.querySelector(`[data-id="${id}"]`);
    if (li) {
      const thumbDiv = li.querySelector('.sortable-item__thumb');
      thumbDiv.innerHTML = `<img src="${thumbUrl}" alt="Page 1" />`;
    }
  }

  function removeFile(id) {
    files = files.filter(f => f.id !== id);
    renderList();
  }

  // ── Drag-to-reorder ─────────────────────────────────────────────────────
  function attachDragEvents(li) {
    li.addEventListener('dragstart', e => {
      dragSrc = li;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      sortable.querySelectorAll('.sortable-item').forEach(i => i.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', e => {
      e.preventDefault();
      if (dragSrc === li) return;
      sortable.querySelectorAll('.sortable-item').forEach(i => i.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });
    li.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc === li) return;
      const items = [...sortable.querySelectorAll('.sortable-item')];
      const srcIdx  = items.indexOf(dragSrc);
      const destIdx = items.indexOf(li);
      if (srcIdx === -1 || destIdx === -1) return;
      const moved = files.splice(srcIdx, 1)[0];
      files.splice(destIdx, 0, moved);
      renderList();
    });
  }

  // ── Merge ────────────────────────────────────────────────────────────────
  mergeBtn.addEventListener('click', async () => {
    if (files.length < 2) { Toast.show('Add at least 2 PDF files.', 'warn'); return; }

    mergeBtn.classList.add('loading');
    mergeBtn.disabled = true;
    Progress.show(`Merging ${files.length} PDFs…`);

    try {
      const fd = new FormData();
      files.forEach(entry => fd.append('files[]', entry.file));
      // Send order as well (indices are already correct since we build from `files`)

      const data = await postFormData('/api/merge', fd);

      showResult('mergeResult', {
        title: 'Merge Complete',
        stats: [
          { label: 'Files merged', val: data.file_count },
          { label: 'Total pages',  val: data.page_count },
          { label: 'Output size',  val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'merged.pdf',
      });

      Toast.show('PDFs merged successfully!', 'success');
    } catch (err) {
      showResultError('mergeResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      mergeBtn.classList.remove('loading');
      mergeBtn.disabled = false;
      Progress.hide();
    }
  });
});
