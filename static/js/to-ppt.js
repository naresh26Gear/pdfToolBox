/* to-ppt.js — PDF to PowerPoint (.pptx) conversion */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'pptUpload',
    inputId: 'pptFile',
    infoId:  'pptFileInfo',
    onFile: (file) => {
      currentFile = file;
      document.getElementById('pptOptions').classList.toggle('hidden', !file);
      document.getElementById('pptResult').classList.add('hidden');
    }
  });

  const btn = document.getElementById('pptBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show('Rendering PDF pages as slides… (may take a while for large PDFs)');

    try {
      const fd = new FormData();
      fd.append('file', currentFile);

      const data = await postFormData('/api/to-ppt', fd);

      showResult('pptResult', {
        title: 'PowerPoint Ready',
        stats: [
          { label: 'Slides',    val: data.slide_count },
          { label: 'Format',    val: '.pptx' },
          { label: 'File size', val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'presentation.pptx',
        warning: data.warning,
      });

      Toast.show(`${data.slide_count} slides created!`, 'success');
    } catch (err) {
      showResultError('pptResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });
});
