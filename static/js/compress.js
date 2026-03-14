/* compress.js — PDF Compressor tool logic */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const {
    Toast, Progress, setupUploadZone, postFormData,
    formatBytes, showResult, showResultError, attachRipple
  } = window.PDFSuite;

  let currentFile = null;
  let estimateTimer = null;

  // ── Wire upload zone ────────────────────────────────────────────────────
  setupUploadZone({
    zoneId:  'compressUpload',
    inputId: 'compressFile',
    infoId:  'compressFileInfo',
    onFile: (file) => {
      currentFile = file;
      const controls = document.getElementById('compressControls');
      const result   = document.getElementById('compressResult');
      result.classList.add('hidden');

      if (file) {
        controls.classList.remove('hidden');
        updateSliderFill();
        triggerEstimate(file);
      } else {
        controls.classList.add('hidden');
        document.getElementById('estOriginal').textContent   = '—';
        document.getElementById('estCompressed').textContent = '—';
      }
    }
  });

  // ── Slider ──────────────────────────────────────────────────────────────
  const slider   = document.getElementById('compressQuality');
  const valLabel = document.getElementById('compressQualityVal');

  slider.addEventListener('input', () => {
    valLabel.textContent = slider.value + '%';
    updateSliderFill();
    if (currentFile) {
      clearTimeout(estimateTimer);
      estimateTimer = setTimeout(() => triggerEstimate(currentFile), 200);
    }
  });

  function updateSliderFill() {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--slider-pct', pct + '%');
  }

  async function triggerEstimate(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('quality', slider.value);
    try {
      const data = await postFormData('/api/compress/estimate', fd);
      document.getElementById('estOriginal').textContent   = formatBytes(data.original_size);
      document.getElementById('estCompressed').textContent = formatBytes(data.estimated_size);
    } catch (_) {
      document.getElementById('estOriginal').textContent = formatBytes(file.size);
      document.getElementById('estCompressed').textContent = '—';
    }
  }

  // ── Compress button ─────────────────────────────────────────────────────
  const btn = document.getElementById('compressBtn');
  attachRipple(btn);

  btn.addEventListener('click', async () => {
    if (!currentFile) { Toast.show('Upload a PDF first.', 'warn'); return; }

    btn.classList.add('loading');
    btn.disabled = true;
    Progress.show('Compressing with Ghostscript…');

    try {
      const fd = new FormData();
      fd.append('file', currentFile);
      fd.append('quality', slider.value);

      const data = await postFormData('/api/compress', fd);

      const savedLabel = data.saved_percent > 0
        ? `−${data.saved_percent}% smaller`
        : 'No reduction (already optimal)';

      showResult('compressResult', {
        title: 'Compression Complete',
        stats: [
          { label: 'Original',   val: formatBytes(data.original_size) },
          { label: 'Compressed', val: formatBytes(data.compressed_size), cls: 'saved' },
          { label: 'Saved',      val: savedLabel, cls: 'saved' },
          { label: 'Setting',    val: data.setting_used },
        ],
        downloadUrl:  data.download_url,
        downloadName: 'compressed.pdf',
        warning: data.warning,
      });

      Toast.show('PDF compressed successfully!', 'success');
    } catch (err) {
      showResultError('compressResult', err.message);
      Toast.show(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      Progress.hide();
    }
  });
});
