/* split.js — PDF Split tool logic */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile  = null;
  let pageCount    = 0;
  let selectedPages = new Set();  // 0-based

  // ── Upload zone ─────────────────────────────────────────────────────────
  setupUploadZone({
    zoneId:  'splitUpload',
    inputId: 'splitFile',
    infoId:  'splitFileInfo',
    onFile: async (file) => {
      currentFile = file;
      document.getElementById('splitResult').classList.add('hidden');
      document.getElementById('splitControls').classList.add('hidden');

      if (!file) return;

      Progress.show('Loading PDF pages…');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const data = await postFormData('/api/split/info', fd);

        pageCount = data.page_count;
        document.getElementById('splitInfoBar').innerHTML =
          `<strong>${pageCount}</strong> pages — ${formatBytes(file.size)}`;

        renderThumbnails(data.thumbnails, pageCount);
        document.getElementById('splitControls').classList.remove('hidden');

        if (data.warning) Toast.show(data.warning, 'warn');
      } catch (err) {
        Toast.show('Could not load PDF: ' + err.message, 'error');
      } finally {
        Progress.hide();
      }
    }
  });

  // ── Mode tabs ────────────────────────────────────────────────────────────
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const mode = tab.dataset.mode;
      document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`mode-${mode}`).classList.add('active');
    });
  });

  // ── Thumbnail rendering ──────────────────────────────────────────────────
  function renderThumbnails(thumbs, total) {
    selectedPages.clear();
    const grid = document.getElementById('splitThumbGrid');
    grid.innerHTML = '';

    for (let i = 0; i < total; i++) {
      const div = document.createElement('div');
      div.className = 'thumb-item';
      div.setAttribute('role', 'listitem');
      div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', `Page ${i + 1}`);
      div.style.animationDelay = (i * 30) + 'ms';

      if (thumbs[i]) {
        div.innerHTML = `<img src="${thumbs[i]}" alt="Page ${i+1}" loading="lazy" /><div class="thumb-item__num">${i + 1}</div>`;
      } else {
        div.innerHTML = `<div style="aspect-ratio:0.7;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--text-muted)">${i+1}</div><div class="thumb-item__num">${i + 1}</div>`;
      }

      div.addEventListener('click', () => togglePage(div, i));
      div.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePage(div, i); } });
      grid.appendChild(div);
    }
    updateSelectedDisplay();
  }

  function togglePage(el, idx) {
    if (selectedPages.has(idx)) {
      selectedPages.delete(idx);
      el.classList.remove('selected');
    } else {
      selectedPages.add(idx);
      el.classList.add('selected');
    }
    updateSelectedDisplay();
  }

  function updateSelectedDisplay() {
    const display = document.getElementById('selectedPagesDisplay');
    if (selectedPages.size === 0) {
      display.textContent = 'No pages selected';
    } else {
      const sorted = [...selectedPages].sort((a,b) => a - b).map(n => n + 1);
      display.textContent = `Selected: pages ${sorted.join(', ')}`;
    }
  }

  // ── Split button ─────────────────────────────────────────────────────────
  const splitBtn = document.getElementById('splitBtn');
  attachRipple(splitBtn);

  splitBtn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    const activeTab = document.querySelector('.mode-tab.active');
    const mode = activeTab?.dataset.mode || 'range';
    let value = '';

    if (mode === 'range') {
      value = document.getElementById('rangeInput').value.trim();
      if (!value) { Toast.show('Enter page ranges, e.g. 1-3, 5, 7-10', 'warn'); return; }
    } else if (mode === 'every') {
      value = document.getElementById('everyInput').value.trim();
      if (!value || parseInt(value) < 1) { Toast.show('Enter a valid page interval.', 'warn'); return; }
    } else if (mode === 'extract') {
      if (selectedPages.size === 0) { Toast.show('Select at least one page to extract.', 'warn'); return; }
      value = [...selectedPages].sort((a,b)=>a-b).map(n=>n+1).join(',');
    }

    splitBtn.classList.add('loading');
    splitBtn.disabled = true;
    Progress.show('Splitting PDF…');

    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('mode', mode);
      fd.append('value', value);

      const data = await postFormData('/api/split', fd);

      const isPDF = data.type === 'pdf';
      showResult('splitResult', {
        title: 'Split Complete',
        stats: [
          { label: isPDF ? 'Pages extracted' : 'Parts created', val: isPDF ? data.page_count : data.part_count },
          { label: 'Output',  val: isPDF ? 'Single PDF' : 'ZIP archive' },
        ],
        downloadUrl:  data.download_url,
        downloadName: isPDF ? 'extracted.pdf' : 'split_pages.zip',
      });

      Toast.show('PDF split successfully!', 'success');
    } catch (err) {
      showResultError('splitResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      splitBtn.classList.remove('loading');
      splitBtn.disabled = false;
      Progress.hide();
    }
  });
});
