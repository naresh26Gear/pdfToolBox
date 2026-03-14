/* to-png.js — PDF to PNG conversion */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'pngUpload',
    inputId: 'pngFile',
    infoId:  'pngFileInfo',
    onFile: (file) => {
      currentFile = file;
      document.getElementById('pngOptions').classList.toggle('hidden', !file);
      document.getElementById('pngResult').classList.add('hidden');
    }
  });

  const btn = document.getElementById('pngBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    const dpi = document.querySelector('input[name="pngDpi"]:checked')?.value || '150';

    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show(`Converting to PNG at ${dpi} DPI…`);

    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('dpi', dpi);

      const data = await postFormData('/api/to-png', fd);

      const isZip = data.type === 'zip';
      showResult('pngResult', {
        title: 'Conversion Complete',
        stats: [
          { label: 'Pages',     val: data.page_count },
          { label: 'DPI',       val: dpi },
          { label: 'Output',    val: isZip ? 'ZIP of PNGs' : 'Single PNG' },
          { label: 'File size', val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: isZip ? 'pages_png.zip' : 'page.png',
        warning: data.warning,
      });

      Toast.show('Converted to PNG!', 'success');
    } catch (err) {
      showResultError('pngResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });
});
