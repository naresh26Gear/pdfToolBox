/* unlock.js — PDF Unlock tool logic */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;

  setupUploadZone({
    zoneId:  'unlockUpload',
    inputId: 'unlockFile',
    infoId:  'unlockFileInfo',
    onFile: (file) => {
      currentFile = file;
      const ctrl = document.getElementById('unlockControls');
      document.getElementById('unlockResult').classList.add('hidden');
      if (file) {
        ctrl.classList.remove('hidden');
        document.getElementById('unlockPassword').focus();
      } else {
        ctrl.classList.add('hidden');
      }
    }
  });

  // Show / hide password
  const pwInput = document.getElementById('unlockPassword');
  document.getElementById('togglePw').addEventListener('click', () => {
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  });

  // Allow Enter key to submit
  pwInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('unlockBtn').click();
  });

  const unlockBtn = document.getElementById('unlockBtn');
  attachRipple(unlockBtn);

  unlockBtn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    const password = pwInput.value;
    // Allow empty password — some PDFs have empty password protection

    unlockBtn.classList.add('loading');
    unlockBtn.disabled = true;
    Progress.show('Unlocking PDF…');

    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('password', password);

      const data = await postFormData('/api/unlock', fd);

      showResult('unlockResult', {
        title: 'PDF Unlocked',
        stats: [
          { label: 'Pages',       val: data.page_count },
          { label: 'Output size', val: formatBytes(data.output_size) },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'unlocked.pdf',
        warning: data.warning,
      });

      Toast.show('PDF unlocked successfully!', 'success');
      pwInput.value = '';
    } catch (err) {
      const isWrongPw = err.message.toLowerCase().includes('wrong password') ||
                        err.message.toLowerCase().includes('password');
      showResultError('unlockResult', err.message);
      Toast.show(err.message, isWrongPw ? 'warn' : 'error');
      if (isWrongPw) {
        pwInput.focus();
        pwInput.select();
      }
    } finally {
      unlockBtn.classList.remove('loading');
      unlockBtn.disabled = false;
      Progress.hide();
    }
  });
});
