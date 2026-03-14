/* to-jpg.js — PDF to JPG conversion */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'jpgUpload',
    inputId: 'jpgFile',
    infoId:  'jpgFileInfo',
    onFile: (file) => {
      currentFile = file;
      const opts = document.getElementById('jpgOptions');
      document.getElementById('jpgResult').classList.add('hidden');
      opts.classList.toggle('hidden', !file);
    }
  });

  const btn = document.getElementById('jpgBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    const dpi = document.querySelector('input[name="jpgDpi"]:checked')?.value || '150';

    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show(`Converting to JPG at ${dpi} DPI…`);

    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('dpi', dpi);

      const data = await postFormData('/api/to-jpg', fd);

      const isZip = data.type === 'zip';
      showResult('jpgResult', {
        title: 'Conversion Complete',
        stats: [
          { label: 'Pages',      val: data.page_count },
          { label: 'DPI',        val: dpi },
          { label: 'Output',     val: isZip ? 'ZIP of JPGs' : 'Single JPG' },
          { label: 'File size',  val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: isZip ? 'pages_jpg.zip' : 'page.jpg',
        warning: data.warning,
      });

      Toast.show('Converted to JPG!', 'success');
    } catch (err) {
      showResultError('jpgResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });
});
