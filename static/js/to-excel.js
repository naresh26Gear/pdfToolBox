/* to-excel.js — PDF to Excel conversion with table preview */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, escHtml, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'excelUpload',
    inputId: 'excelFile',
    infoId:  'excelFileInfo',
    onFile: (file) => {
      currentFile = file;
      document.getElementById('excelOptions').classList.toggle('hidden', !file);
      document.getElementById('excelResult').classList.add('hidden');
      document.getElementById('excelPreview').classList.add('hidden');
    }
  });

  const btn = document.getElementById('excelBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show('Extracting tables from PDF…');

    try {
      const fd = new FormData();
      fd.append('file', currentFile);

      const data = await postFormData('/api/to-excel', fd);

      showResult('excelResult', {
        title: 'Excel Export Ready',
        stats: [
          { label: 'Tables found', val: data.table_count },
          { label: 'File size',    val: formatBytes(data.output_size) },
          { label: 'Format',       val: '.xlsx' },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'tables.xlsx',
        warning: data.warning,
      });

      // Render table preview
      if (data.preview && data.preview.length > 0) {
        renderPreview(data.preview);
      }

      Toast.show(`Extracted ${data.table_count} table(s) to Excel!`, 'success');
    } catch (err) {
      showResultError('excelResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });

  function renderPreview(tables) {
    const container = document.getElementById('excelPreview');
    container.innerHTML = '<h3 style="font-size:var(--fs-md);font-weight:600;margin-bottom:.75rem">Table Preview (first 5 rows)</h3>';

    tables.forEach(t => {
      if (!t.rows || t.rows.length === 0) return;

      const label = document.createElement('div');
      label.className = 'preview-sheet-label';
      label.textContent = `Sheet: ${t.sheet}`;
      container.appendChild(label);

      const wrapper = document.createElement('div');
      wrapper.style.overflowX = 'auto';
      wrapper.style.marginBottom = '1.5rem';

      const table = document.createElement('table');
      table.className = 'preview-table';

      t.rows.forEach((row, rowIdx) => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const el = document.createElement(rowIdx === 0 ? 'th' : 'td');
          el.textContent = cell;
          tr.appendChild(el);
        });
        table.appendChild(tr);
      });

      wrapper.appendChild(table);
      container.appendChild(wrapper);
    });

    container.classList.remove('hidden');
  }
});
