/* ═══════════════════════════════════════════════════════════════════════════
   app.js  —  Core application: navigation, theme, shared upload helpers,
              toast notifications, progress overlay, ripple effects.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

// ─────────────────────────── THEME ──────────────────────────────────────────
const ThemeManager = (() => {
  const KEY  = 'pdf-suite-theme';
  const HTML = document.documentElement;

  function apply(theme) {
    HTML.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
  }

  function init() {
    const saved = localStorage.getItem(KEY) || 'dark';
    apply(saved);
    document.getElementById('themeToggle').addEventListener('click', () => {
      apply(HTML.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  return { init };
})();

// ─────────────────────────── NAVIGATION ─────────────────────────────────────
const Nav = (() => {
  let current = 'home';

  function show(toolId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
    });

    const target = document.getElementById(`page-${toolId}`);
    if (!target) return;

    target.classList.add('active');
    current = toolId;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-link, .nav-link').forEach(el => {
      el.classList.toggle('active', el.dataset.tool === toolId);
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Close sidebar on mobile
    if (window.innerWidth < 1024) closeSidebar();
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
    const ham = document.getElementById('hamburger');
    ham.classList.remove('open');
    ham.setAttribute('aria-expanded', 'false');
  }

  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('visible');
    const ham = document.getElementById('hamburger');
    ham.classList.add('open');
    ham.setAttribute('aria-expanded', 'true');
  }

  function init() {
    // Delegate all data-tool clicks
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-tool]');
      if (!el) {
        // Close dropdown if clicking elsewhere
        document.querySelectorAll('.nav-dropdown-wrapper.open').forEach(d => d.classList.remove('open'));
        return;
      }
      const tool = el.dataset.tool;
      if (tool) { e.preventDefault(); show(tool); }
    });

    // Keyboard: Enter/Space on tool cards
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const el = e.target.closest('[data-tool]');
        if (el) { e.preventDefault(); show(el.dataset.tool); }
      }
    });

    // Hamburger
    document.getElementById('hamburger').addEventListener('click', () => {
      if (document.getElementById('sidebar').classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    // Overlay click closes sidebar
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);

    // Nav dropdown
    document.querySelectorAll('.nav-dropdown-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        btn.closest('.nav-dropdown-wrapper').classList.toggle('open');
      });
    });

    // Intersection Observer for tool card stagger
    const io = new IntersectionObserver(entries => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), i * 60);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.tool-card').forEach(card => io.observe(card));
  }

  return { init, show };
})();

// ─────────────────────────── TOAST ──────────────────────────────────────────
const Toast = (() => {
  const container = () => document.getElementById('toastContainer');

  const ICONS = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };

  function show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${ICONS[type] || 'ℹ️'}</span>
      <span class="toast__msg">${message}</span>
      <button class="toast__close" aria-label="Dismiss">✕</button>
    `;
    container().appendChild(toast);

    const remove = () => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 380);
    };

    toast.querySelector('.toast__close').addEventListener('click', remove);
    if (duration > 0) setTimeout(remove, duration);
    return toast;
  }

  return { show };
})();

// ─────────────────────────── PROGRESS OVERLAY ───────────────────────────────
const Progress = (() => {
  const overlay  = () => document.getElementById('progressOverlay');
  const msgEl    = () => document.getElementById('progressMsg');
  const barEl    = () => document.getElementById('progressBar');
  let fakeTimer  = null;

  function show(msg = 'Processing…') {
    overlay().classList.remove('hidden');
    msgEl().textContent = msg;
    barEl().style.width = '0%';

    let pct = 0;
    fakeTimer = setInterval(() => {
      pct = Math.min(pct + Math.random() * 8, 88);
      barEl().style.width = pct + '%';
    }, 300);
  }

  function hide() {
    clearInterval(fakeTimer);
    barEl().style.width = '100%';
    setTimeout(() => { overlay().classList.add('hidden'); barEl().style.width = '0%'; }, 300);
  }

  return { show, hide };
})();

// ─────────────────────────── RIPPLE ─────────────────────────────────────────
function attachRipple(btn) {
  btn.addEventListener('click', function(e) {
    const r = document.createElement('span');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    r.className = 'ripple';
    r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px`;
    this.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}
document.querySelectorAll('.btn--primary').forEach(attachRipple);

// ─────────────────────── SHARED UPLOAD HELPERS ──────────────────────────────
/**
 * Wire up a single-file upload zone.
 * @param {object} opts
 *   zoneId       - id of the .upload-zone element
 *   inputId      - id of the hidden <input type="file">
 *   infoId       - id of the .file-info element
 *   onFile(file) - callback when a valid file is chosen
 */
function setupUploadZone({ zoneId, inputId, infoId, onFile }) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const info  = document.getElementById(infoId);

  if (!zone || !input) return;

  // Drag events on the zone (not the input, which covers it)
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      Toast.show('Only PDF files are accepted.', 'error');
      return;
    }

    if (info) {
      const warnSize = file.size > 100 * 1024 * 1024;
      info.innerHTML = `
        <span class="file-info__icon">📄</span>
        <div class="file-info__details">
          <div class="file-info__name">${escHtml(file.name)}</div>
          <div class="file-info__meta">${formatBytes(file.size)} <span class="file-type-badge">PDF</span>
            ${warnSize ? '<span class="file-type-badge" style="background:var(--warn-bg);color:#f59e0b">Large file</span>' : ''}
          </div>
        </div>
        <button class="file-info__remove" aria-label="Remove file" title="Remove">✕</button>
      `;
      info.classList.remove('hidden');
      info.querySelector('.file-info__remove').addEventListener('click', () => {
        info.classList.add('hidden');
        input.value = '';
        onFile(null);
      });
    }

    onFile(file);
  }
}

// ─────────────────────────── FORMAT HELPERS ─────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ─────────────────────── POST FORM DATA ─────────────────────────────────────
/**
 * Upload FormData to a Flask endpoint and return parsed JSON.
 * Handles network errors and non-OK HTTP responses.
 */
async function postFormData(url, formData) {
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', body: formData });
  } catch (networkErr) {
    throw new Error('Cannot reach server. Is Flask running on localhost:5000?');
  }

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await resp.text();
    const match = text.match(/Error: ([^\n<]+)/i) ||
                  text.match(/<pre[^>]*>([\s\S]{0,400})<\/pre>/i);
    const detail = match
      ? match[1].replace(/<[^>]+>/g, '').trim().slice(0, 300)
      : `Server returned HTTP ${resp.status} (not JSON). Check the Flask terminal for the full traceback.`;
    throw new Error(detail);
  }

  let json;
  try {
    json = await resp.json();
  } catch (_) {
    throw new Error(`Server response could not be parsed (HTTP ${resp.status})`);
  }

  if (!resp.ok || json.status === 'error') {
    throw new Error(json.message || `HTTP ${resp.status}`);
  }
  return json;
}

// ─────────────────────── DOWNLOAD TRIGGER ───────────────────────────────────
function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ─────────────────────── RESULT PANEL ───────────────────────────────────────
/**
 * Render a success result panel with stats and a download button.
 * @param {string} panelId
 * @param {object} opts  { title, stats:[{label,val,cls}], downloadUrl, downloadName, warning }
 */
function showResult(panelId, opts) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const statsHtml = (opts.stats || []).map(s => `
    <div class="result-stat">
      <div class="result-stat__label">${escHtml(s.label)}</div>
      <div class="result-stat__val ${s.cls || ''}">${escHtml(String(s.val))}</div>
    </div>
  `).join('');

  const warnHtml = opts.warning
    ? `<div class="info-box info-box--warn" style="margin-bottom:.75rem">⚠️ ${escHtml(opts.warning)}</div>` : '';

  panel.className = 'result-panel';
  panel.innerHTML = `
    <div class="result-panel__title">✅ ${escHtml(opts.title || 'Done!')}</div>
    ${warnHtml}
    <div class="result-panel__stats">${statsHtml}</div>
    <button class="btn btn--primary" id="${panelId}DlBtn">⬇ Download</button>
  `;
  panel.classList.remove('hidden');

  const dlBtn = document.getElementById(`${panelId}DlBtn`);
  attachRipple(dlBtn);
  dlBtn.addEventListener('click', () => triggerDownload(opts.downloadUrl, opts.downloadName));
}

function showResultError(panelId, message) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.className = 'result-panel error';
  panel.innerHTML = `<div class="result-panel__title" style="color:#ef4444">❌ Error</div><p style="color:var(--text-secondary);font-size:var(--fs-sm)">${escHtml(message)}</p>`;
  panel.classList.remove('hidden');
}

// ─────────────────────── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  Nav.init();
});

// Expose globals for feature modules
window.PDFSuite = {
  Toast, Progress, Nav,
  setupUploadZone, postFormData, formatBytes, escHtml,
  showResult, showResultError, triggerDownload, attachRipple
};
