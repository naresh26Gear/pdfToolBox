/* to-word.js — PDF to Word (.docx) conversion */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'wordUpload',
    inputId: 'wordFile',
    infoId:  'wordFileInfo',
    onFile: (file) => {
      currentFile = file;
      document.getElementById('wordOptions').classList.toggle('hidden', !file);
      document.getElementById('wordResult').classList.add('hidden');
      document.getElementById('wordImageWarning').style.display = 'none';
    }
  });

  const btn = document.getElementById('wordBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show('Converting PDF to Word… (this may take a moment)');

    try {
      const fd = new FormData();
      fd.append('file', currentFile);

      const data = await postFormData('/api/to-word', fd);

      // Show image-based warning in the options area too
      if (data.image_based) {
        document.getElementById('wordImageWarning').style.display = 'block';
      }

      showResult('wordResult', {
        title: 'Word Document Ready',
        stats: [
          { label: 'Format',    val: '.docx' },
          { label: 'File size', val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'converted.docx',
        warning: data.warning,
      });

      Toast.show('PDF converted to Word!', 'success');
    } catch (err) {
      showResultError('wordResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });
});
