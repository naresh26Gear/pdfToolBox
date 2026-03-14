/* to-webp.js — PDF to WebP conversion */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'webpUpload',
    inputId: 'webpFile',
    infoId:  'webpFileInfo',
    onFile: (file) => {
      currentFile = file;
      document.getElementById('webpOptions').classList.toggle('hidden', !file);
      document.getElementById('webpResult').classList.add('hidden');
    }
  });

  // Quality slider
  const slider   = document.getElementById('webpQuality');
  const valLabel = document.getElementById('webpQualVal');

  slider.addEventListener('input', () => {
    valLabel.textContent = slider.value + '%';
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--slider-pct', pct + '%');
  });
  // Set initial fill
  const initPct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty('--slider-pct', initPct + '%');

  const btn = document.getElementById('webpBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    const quality = slider.value;
    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show(`Converting to WebP at quality ${quality}…`);

    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('quality', quality);

      const data = await postFormData('/api/to-webp', fd);

      const isZip = data.type === 'zip';
      showResult('webpResult', {
        title: 'Conversion Complete',
        stats: [
          { label: 'Pages',     val: data.page_count },
          { label: 'Quality',   val: quality + '%' },
          { label: 'Output',    val: isZip ? 'ZIP of WebPs' : 'Single WebP' },
          { label: 'File size', val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: isZip ? 'pages_webp.zip' : 'page.webp',
        warning: data.warning,
      });

      Toast.show('Converted to WebP!', 'success');
    } catch (err) {
      showResultError('webpResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });
});
