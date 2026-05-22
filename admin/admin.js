/* ============================================================
   admin.js — GitHub API editor + live preview
   ============================================================
   Edits commit to GitHub via the Contents API.
   Form changes are debounced and posted to the preview iframe
   for instant feedback (no GitHub round-trip required).
   ============================================================ */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function showToast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', type === 'error');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// UTF-8 safe base64
function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64decode(str) { return decodeURIComponent(escape(atob(str.replace(/\s/g, '')))); }

// ---- Config storage ----
const CFG_KEY = 'admin_config_v1';
function loadConfig() { try { return JSON.parse(localStorage.getItem(CFG_KEY)); } catch (e) { return null; } }
function saveConfig(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
function clearConfig() { try { localStorage.removeItem(CFG_KEY); } catch (e) {} }

// ---- GitHub API ----
const API = 'https://api.github.com';

async function ghRequest(path, opts) {
  opts = opts || {};
  const cfg = STATE.config;
  if (!cfg) throw new Error('Not authenticated');
  const headers = Object.assign({
    'Authorization': 'token ' + cfg.token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }, opts.headers || {});
  const res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch (e) {}
    throw new Error('GitHub API ' + res.status + ': ' + msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function verifyToken(token, repo) {
  const res = await fetch(API + '/repos/' + repo, {
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid token (401). PAT may be expired.');
    if (res.status === 404) throw new Error('Repository not found or token lacks access.');
    throw new Error('GitHub returned ' + res.status);
  }
  const data = await res.json();
  if (!data.permissions || !data.permissions.push) {
    throw new Error('Token lacks write access. PAT needs "repo" scope (Classic) or "Contents: Read and write" (Fine-grained).');
  }
  return data;
}

async function fetchFile(path) {
  const cfg = STATE.config;
  const url = '/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(cfg.branch);
  const data = await ghRequest(url);
  return { sha: data.sha, content: b64decode(data.content) };
}

async function putFile(path, content, sha, message) {
  const cfg = STATE.config;
  const url = '/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path);
  const body = { message: message, content: b64encode(content), branch: cfg.branch };
  if (sha) body.sha = sha;
  return ghRequest(url, { method: 'PUT', body: JSON.stringify(body) });
}

/* Binary upload: takes an ArrayBuffer and base64-encodes it for the contents API.
   Looks up the existing sha if the path already exists, so it overwrites cleanly. */
async function putBinary(path, arrayBuffer, message) {
  const cfg = STATE.config;
  // Base64-encode the binary
  const bytes = new Uint8Array(arrayBuffer);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(bin);

  // If the path already exists, GitHub requires the existing sha to overwrite
  let sha;
  try {
    const url = '/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(cfg.branch);
    const existing = await ghRequest(url);
    sha = existing.sha;
  } catch (e) { /* file doesn't exist — that's fine */ }

  const url = '/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path);
  const body = { message: message, content: b64, branch: cfg.branch };
  if (sha) body.sha = sha;
  return ghRequest(url, { method: 'PUT', body: JSON.stringify(body) });
}

async function deleteFile(path, message) {
  const cfg = STATE.config;
  // Need the current sha to delete
  let sha;
  try {
    const url = '/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(cfg.branch);
    const existing = await ghRequest(url);
    sha = existing.sha;
  } catch (e) {
    // File doesn't exist; nothing to delete
    return null;
  }
  const url = '/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path);
  const body = { message: message, sha: sha, branch: cfg.branch };
  return ghRequest(url, { method: 'DELETE', body: JSON.stringify(body) });
}

// ---- State ----
const STATE = {
  config: null,
  data: null,
  sha: null,
  dirty: false,
  previewReady: false
};

// ---- Path bindings ----
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let cur = obj;
  for (const k of keys) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[last] = value;
}

function fillBindings() {
  $$('[data-bind]').forEach(el => {
    const path = el.getAttribute('data-bind');
    const v = getByPath(STATE.data, path);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : v;
  });
  // Design tokens — fill the design controls too
  fillDesignControls();
}

function collectBindings() {
  $$('[data-bind]').forEach(el => {
    const path = el.getAttribute('data-bind');
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
    else v = el.value;
    setByPath(STATE.data, path, v);
  });
}

/* ---- Design controls ---- */
function fillDesignControls() {
  const d = STATE.data.design || {};
  $$('[data-design]').forEach(el => {
    const key = el.getAttribute('data-design');
    if (d[key] != null) el.value = d[key];
  });
  $$('[data-design-text]').forEach(el => {
    const key = el.getAttribute('data-design-text');
    if (d[key] != null) el.value = d[key];
  });
  // Update slider displays with proper suffix
  $$('[data-show]').forEach(el => {
    const key = el.getAttribute('data-show');
    if (d[key] != null) {
      const suffix = el.getAttribute('data-suffix') || (/size$/.test(key) ? 'px' : '');
      el.textContent = d[key] + suffix;
    }
  });
  // Highlight active preset swatch
  $$('[data-preset-target]').forEach(group => {
    const key = group.getAttribute('data-preset-target');
    const v = d[key];
    const cur = (typeof v === 'string' ? v : '').toLowerCase();
    $$('.preset-swatch', group).forEach(sw => {
      sw.classList.toggle('active', (sw.getAttribute('data-color') || '').toLowerCase() === cur);
    });
  });
}

function collectDesign() {
  if (!STATE.data.design) STATE.data.design = {};
  $$('[data-design]').forEach(el => {
    const key = el.getAttribute('data-design');
    let v = el.value;
    // Coerce numeric sliders
    if (el.type === 'range' || el.type === 'number') v = Number(v);
    STATE.data.design[key] = v;
  });
}

/* ---- Lists ---- */
const LIST_SCHEMAS = {
  links: {
    container: '#links-list',
    label: 'Link',
    fields: [
      { key: 'icon', label: 'Icon', type: 'select',
        options: ['external-link', 'mail', 'graduation-cap', 'linkedin', 'github', 'file-text', 'globe', 'twitter'] },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'url', label: 'URL', type: 'text', full: true }
    ]
  },
  nav_links: {
    container: '#nav-list-edit',
    label: 'Nav link',
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' }
    ]
  },
  news: {
    container: '#news-list-edit',
    label: 'News item',
    fields: [
      { key: 'date', label: 'Date', type: 'text' },
      { key: 'highlight', label: 'Bold/highlight', type: 'checkbox' },
      { key: 'text', label: 'Text (supports [link](url))', type: 'textarea', full: true }
    ]
  },
  publications: {
    container: '#pubs-list-edit',
    label: 'Publication',
    fields: [
      { key: 'title', label: 'Title', type: 'text', full: true },
      { key: 'authors', label: 'Authors (your name auto-bolded)', type: 'text', full: true },
      { key: 'venue_tag', label: 'Venue tag', type: 'text' },
      { key: 'type_tag', label: 'Type tag', type: 'text' },
      { key: 'highlight', label: 'Highlight tag (optional)', type: 'text', full: true },
      { key: 'image', label: 'Image path', type: 'text', upload: 'pub' },
      { key: 'pdf_url', label: 'PDF URL', type: 'text' }
    ]
  },
  projects: {
    container: '#projects-list-edit',
    label: 'Project',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'authors', label: 'Authors', type: 'text' },
      { key: 'image', label: 'Image path', type: 'text', upload: 'proj' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', full: true },
      { key: 'tags', label: 'Tags (comma-separated)', type: 'tags', full: true }
    ]
  }
};

function buildListItem(schema, index, item) {
  const wrap = document.createElement('div');
  wrap.className = 'list-item';
  wrap.setAttribute('data-index', index);

  const header = document.createElement('div');
  header.className = 'list-item-header';
  header.innerHTML =
    '<span class="list-item-title">' + schema.label + ' #' + (index + 1) + '</span>' +
    '<div class="list-item-controls">' +
      '<button class="icon-btn" data-act="up" title="Move up">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>' +
      '</button>' +
      '<button class="icon-btn" data-act="down" title="Move down">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
      '</button>' +
      '<button class="icon-btn" data-act="remove" title="Remove">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button>' +
    '</div>';
  wrap.appendChild(header);

  let row = null;
  schema.fields.forEach(f => {
    if (f.full && row) { wrap.appendChild(row); row = null; }
    const field = document.createElement('div');
    field.className = 'field';
    let input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.value = item[f.key] || '';
    } else if (f.type === 'select') {
      input = document.createElement('select');
      f.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });
      input.value = item[f.key] || f.options[0];
    } else if (f.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!item[f.key];
      input.style.width = 'auto';
    } else if (f.type === 'tags') {
      input = document.createElement('input');
      input.type = 'text';
      input.value = Array.isArray(item[f.key]) ? item[f.key].join(', ') : (item[f.key] || '');
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = item[f.key] == null ? '' : item[f.key];
    }
    input.setAttribute('data-field', f.key);
    input.setAttribute('data-type', f.type);
    field.innerHTML = '<label>' + f.label + '</label>';

    if (f.upload) {
      // Wrap input with an upload button on the right.
      // Slot name: <type>-<index>  e.g., "pub-0", "proj-2"
      const wrapInput = document.createElement('div');
      wrapInput.className = 'input-with-action';
      wrapInput.appendChild(input);
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn btn-sm';
      upBtn.setAttribute('data-upload', f.upload + '-' + index);
      upBtn.textContent = 'Upload';
      wrapInput.appendChild(upBtn);
      field.appendChild(wrapInput);
    } else {
      field.appendChild(input);
    }

    if (f.full) {
      wrap.appendChild(field);
    } else {
      if (!row) { row = document.createElement('div'); row.className = 'field-row'; }
      row.appendChild(field);
      if (row.children.length === 2) { wrap.appendChild(row); row = null; }
    }
  });
  if (row) wrap.appendChild(row);

  return wrap;
}

function renderList(key) {
  const schema = LIST_SCHEMAS[key];
  const container = $(schema.container);
  container.innerHTML = '';
  const items = STATE.data[key] || [];
  items.forEach((item, i) => container.appendChild(buildListItem(schema, i, item)));
}

function renderAllLists() { Object.keys(LIST_SCHEMAS).forEach(renderList); }

function collectLists() {
  Object.keys(LIST_SCHEMAS).forEach(key => {
    const schema = LIST_SCHEMAS[key];
    const container = $(schema.container);
    const arr = [];
    $$('.list-item', container).forEach(itemEl => {
      const obj = {};
      $$('[data-field]', itemEl).forEach(inp => {
        const field = inp.getAttribute('data-field');
        const type = inp.getAttribute('data-type');
        if (type === 'checkbox') obj[field] = inp.checked;
        else if (type === 'tags') obj[field] = inp.value.split(',').map(s => s.trim()).filter(Boolean);
        else obj[field] = inp.value;
      });
      arr.push(obj);
    });
    STATE.data[key] = arr;
  });
}

/* Live preview sync — pushes current state to the iframe over postMessage.
   Debounced so rapid input doesn't cause render thrashing. */
let previewTimer = null;
function syncPreview(immediate) {
  clearTimeout(previewTimer);
  const status = $('#preview-status');
  const send = () => {
    collectLists();
    collectBindings();
    collectDesign();
    const iframe = $('#preview-frame');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage({ type: 'data', payload: STATE.data }, '*');
        if (status) {
          status.classList.remove('pending');
          status.title = 'Preview is up to date';
        }
      } catch (e) {}
    }
    markDirty();
  };
  if (immediate) send();
  else {
    if (status) {
      status.classList.add('pending');
      status.title = 'Updating preview...';
    }
    previewTimer = setTimeout(send, 80);
  }
}

function markDirty() {
  STATE.dirty = true;
  const btn = $('#save-btn');
  if (btn) btn.classList.add('dirty');
}
function clearDirty() {
  STATE.dirty = false;
  const btn = $('#save-btn');
  if (btn) btn.classList.remove('dirty');
}

/* ---- Event wiring ---- */
function wireEvents() {
  // Add buttons.
  // News, publications, and projects prepend (newest at top, which matches
  // how academic homepages typically display them). Links/nav append.
  const PREPEND_LISTS = { news: true, publications: true, projects: true };

  $$('[data-add]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-add');
      collectLists();
      collectBindings();
      collectDesign();
      const blank = {};
      LIST_SCHEMAS[key].fields.forEach(f => {
        if (f.type === 'checkbox') blank[f.key] = false;
        else if (f.type === 'tags') blank[f.key] = [];
        else blank[f.key] = '';
      });
      if (!Array.isArray(STATE.data[key])) STATE.data[key] = [];
      if (PREPEND_LISTS[key]) {
        STATE.data[key].unshift(blank);
      } else {
        STATE.data[key].push(blank);
      }
      renderList(key);
      syncPreview(true);
      // Scroll to & focus the newly added item so it's obvious where it went
      const container = $(LIST_SCHEMAS[key].container);
      const targetIndex = PREPEND_LISTS[key] ? 0 : (STATE.data[key].length - 1);
      const newItem = container.querySelector('.list-item[data-index="' + targetIndex + '"]');
      if (newItem) {
        newItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const firstInput = newItem.querySelector('input[type="text"], textarea');
        if (firstInput) firstInput.focus({ preventScroll: true });
      }
    });
  });

  // List item actions
  Object.keys(LIST_SCHEMAS).forEach(key => {
    const container = $(LIST_SCHEMAS[key].container);
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.preventDefault();
      const itemEl = btn.closest('.list-item');
      const idx = Number(itemEl.getAttribute('data-index'));
      const act = btn.getAttribute('data-act');
      collectLists();
      const arr = STATE.data[key];
      if (act === 'remove') {
        if (!confirm('Remove this ' + LIST_SCHEMAS[key].label.toLowerCase() + '?')) return;
        arr.splice(idx, 1);
      } else if (act === 'up' && idx > 0) {
        const tmp = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = tmp;
      } else if (act === 'down' && idx < arr.length - 1) {
        const tmp = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = tmp;
      }
      renderList(key);
      syncPreview(true);
    });
    // Live sync on any input change inside lists
    container.addEventListener('input', () => syncPreview());
  });

  // Input bindings
  $$('[data-bind]').forEach(el => {
    el.addEventListener('input', () => syncPreview());
  });

  // Design controls
  $$('[data-design]').forEach(el => {
    el.addEventListener('input', () => {
      // If color picker, sync its text twin
      const key = el.getAttribute('data-design');
      const text = document.querySelector('[data-design-text="' + key + '"]');
      if (text && el.type === 'color') text.value = el.value;
      // Update displays — append px for size keys
      const isSize = /size$/.test(key);
      $$('[data-show="' + key + '"]').forEach(s => {
        const suffix = s.getAttribute('data-suffix') || (isSize ? 'px' : '');
        s.textContent = el.value + suffix;
      });
      // Update preset highlight
      const group = document.querySelector('[data-preset-target="' + key + '"]');
      if (group) {
        $$('.preset-swatch', group).forEach(sw => {
          sw.classList.toggle('active', (sw.getAttribute('data-color') || '').toLowerCase() === el.value.toLowerCase());
        });
      }
      syncPreview();
    });
  });
  // Hex text inputs that mirror color pickers
  $$('[data-design-text]').forEach(el => {
    el.addEventListener('input', () => {
      const key = el.getAttribute('data-design-text');
      const v = el.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        const picker = document.querySelector('[data-design="' + key + '"]');
        if (picker) picker.value = v;
        syncPreview();
      }
    });
  });
  // Preset swatches
  $$('.preset-swatch').forEach(sw => {
    sw.addEventListener('click', (e) => {
      e.preventDefault();
      const group = sw.closest('[data-preset-target]');
      if (!group) return;
      const key = group.getAttribute('data-preset-target');
      const color = sw.getAttribute('data-color');
      const picker = document.querySelector('[data-design="' + key + '"]');
      const text = document.querySelector('[data-design-text="' + key + '"]');
      if (picker) picker.value = color;
      if (text) text.value = color;
      // Mark active
      $$('.preset-swatch', group).forEach(s => s.classList.toggle('active', s === sw));
      syncPreview(true);
    });
  });

  // Action buttons
  $('#save-btn').addEventListener('click', save);
  $('#reload-btn').addEventListener('click', async () => {
    if (STATE.dirty && !confirm('Discard local changes and re-fetch from GitHub?')) return;
    await loadData();
  });
  $('#logout-btn').addEventListener('click', () => {
    if (!confirm('Sign out? Stored token will be removed from this device.')) return;
    clearConfig();
    location.reload();
  });

  // Image upload — delegated, works for both static photo field and dynamic list items.
  // Each upload trigger has data-upload-target pointing at an input[data-bind=...]
  // or sibling input. Clicking opens a file picker, uploads to GitHub, and writes
  // the resulting path into the target input.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-upload]');
    if (!btn) return;
    e.preventDefault();
    triggerUpload(btn);
  });

  $('#login-btn').addEventListener('click', login);
  $('#pat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('#repo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

  // Listen for preview iframe handshake
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'ready') {
      STATE.previewReady = true;
      // Send initial data when iframe announces it's ready
      if (STATE.data) syncPreview(true);
    }
  });

  // Warn before unload if dirty
  window.addEventListener('beforeunload', (e) => {
    if (STATE.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---- Splitter: drag to resize panes ----
  setupSplitter();
  // ---- Mobile preview toggle ----
  setupPreviewToggle();
}

/* Resizer: drag the divider to change pane widths.
   Width is persisted in localStorage so it's remembered next time. */
const SPLIT_KEY = 'admin_split_v1';

/* ---- Image upload ----
   Opens a file picker, uploads the chosen image to GitHub at assets/<slot>.<ext>,
   deletes the prior file at that path (if any), and writes the new path into
   the linked input. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;   // 5 MB; GitHub Contents API limit is 25 MB but we want fast pages
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];

function findUploadTarget(btn) {
  // Strategy: the button lives next to an input that holds the current image path.
  // Look in the nearest .field / .field-row / .list-item scope.
  // Important: our text inputs often omit the `type` attribute (HTML defaults to
  // "text" but `[type="text"]` only matches when the attribute is present), so we
  // accept any <input> that isn't an explicitly non-text type.
  const field = btn.closest('.field, .input-with-action, .field-row, .list-item') || document;
  const all = Array.from(field.querySelectorAll('input'));
  const candidates = all.filter(inp => {
    const t = (inp.getAttribute('type') || 'text').toLowerCase();
    return t === 'text' || t === '';
  });

  // Prefer explicit data-upload-target
  const explicit = btn.getAttribute('data-upload-target');
  if (explicit) {
    const el = field.querySelector(explicit) || document.querySelector(explicit);
    if (el) return el;
  }

  // Look for the input whose data-bind or data-field key contains "image" or "photo"
  for (const c of candidates) {
    const bind = (c.getAttribute('data-bind') || '') + ' ' + (c.getAttribute('data-field') || '');
    if (/photo|image/i.test(bind)) return c;
  }

  // Otherwise pick an input whose current value looks like an image path
  for (const c of candidates) {
    if (c.value && /\.(jpg|jpeg|png|webp|gif|svg)/i.test(c.value)) return c;
  }

  // Last resort: first text-like input in the scope
  return candidates[0] || null;
}

async function triggerUpload(btn) {
  if (!STATE.config) {
    showToast('Sign in first.', 'error');
    return;
  }
  const targetInput = findUploadTarget(btn);
  if (!targetInput) { showToast('No target field found.', 'error'); return; }

  // Build a hidden file input on the fly
  const file = await pickFile();
  if (!file) return;

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    showToast('Only images allowed (jpg, png, webp, gif, svg).', 'error');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast('File too large (max 5 MB).', 'error');
    return;
  }

  // Determine the upload slot.
  // For built-in single-image fields (profile photo, publication image, project image),
  // we keep ONE filename per slot — so re-uploading overwrites the old one and there's
  // no accumulation. The slot name comes from data-upload="..." on the button.
  const slot = btn.getAttribute('data-upload') || 'image';
  const newPath = 'assets/' + slot + '.' + ext;
  const oldPath = (targetInput.value || '').trim();

  btn.disabled = true;
  const origLabel = btn.textContent;
  btn.textContent = 'Uploading...';

  try {
    // Delete the old file FIRST if:
    //   - it's a real asset path (starts with "assets/")
    //   - it's not a placeholder shipped with the template
    //   - it differs from the new path (we'd overwrite via putBinary otherwise)
    const isPlaceholder = /placeholder\.svg$/i.test(oldPath);
    const isExternal = /^https?:\/\//i.test(oldPath);
    if (oldPath && oldPath !== newPath && oldPath.startsWith('assets/') && !isPlaceholder && !isExternal) {
      try {
        await deleteFile(oldPath, 'Remove old image (replaced via admin)');
      } catch (e) { /* ignore — file might already be gone */ }
    }

    // Read file as ArrayBuffer
    const buf = await file.arrayBuffer();
    await putBinary(newPath, buf, 'Upload image via admin: ' + newPath);

    // Append a cache-busting query so the preview iframe shows the new image immediately
    targetInput.value = newPath + '?t=' + Date.now();
    showToast('Image uploaded.');
    syncPreview(true);

    // Strip the cache-buster from the persisted value after a short delay
    // (so the saved data.json stays clean — the browser will fetch fresh next page load anyway).
    setTimeout(() => {
      targetInput.value = newPath;
      syncPreview(true);
    }, 1500);
  } catch (e) {
    showToast('Upload failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
}

function pickFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml';
    input.style.display = 'none';
    let resolved = false;
    function cleanup() {
      if (input.parentNode) input.parentNode.removeChild(input);
    }
    input.addEventListener('change', () => {
      if (resolved) return;
      resolved = true;
      const f = input.files && input.files[0];
      cleanup();
      resolve(f || null);
    });
    // Detect cancellation: when the dialog closes without picking anything,
    // window gets focus back. We give the change event a moment to fire first.
    function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(null);
      }, 300);
    }
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}

function setupSplitter() {
  const resizer = document.getElementById('admin-resizer');
  const leftPane = document.querySelector('.admin-pane');
  const shell = document.getElementById('admin-root');
  if (!resizer || !leftPane || !shell) return;

  // Restore saved width
  try {
    const saved = parseFloat(localStorage.getItem(SPLIT_KEY));
    if (saved && saved > 15 && saved < 85) {
      leftPane.style.width = saved + '%';
    }
  } catch (e) {}

  let dragging = false;

  function onDown(e) {
    // Only desktop layout
    if (window.matchMedia('(max-width: 767px)').matches) return;
    dragging = true;
    document.body.classList.add('is-resizing');
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const rect = shell.getBoundingClientRect();
    let pct = ((x - rect.left) / rect.width) * 100;
    // Clamp so neither pane disappears
    pct = Math.max(20, Math.min(80, pct));
    leftPane.style.width = pct + '%';
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-resizing');
    // Persist current width
    try {
      const pct = parseFloat(leftPane.style.width);
      if (pct) localStorage.setItem(SPLIT_KEY, String(pct));
    } catch (e) {}
  }

  resizer.addEventListener('mousedown', onDown);
  resizer.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  // Double-click resets to 50/50
  resizer.addEventListener('dblclick', () => {
    leftPane.style.width = '50%';
    try { localStorage.setItem(SPLIT_KEY, '50'); } catch (e) {}
  });
}

function setupPreviewToggle() {
  const hideBtn = document.getElementById('preview-toggle');
  const showBtn = document.getElementById('floating-show-preview');
  const shell = document.getElementById('admin-root');
  if (!shell) return;

  function setHidden(hidden) {
    shell.classList.toggle('preview-hidden', hidden);
    // Show the floating button when preview is hidden, hide it otherwise.
    // We use inline display because the CSS rule that exposes it depends on
    // the .preview-hidden class being applied to a sibling — explicit toggle
    // here is more reliable across browsers.
    if (showBtn) showBtn.style.display = hidden ? 'inline-flex' : 'none';
    try { localStorage.setItem('admin_preview_hidden', hidden ? '1' : '0'); } catch (e) {}
  }

  if (hideBtn) hideBtn.addEventListener('click', () => setHidden(true));
  if (showBtn) showBtn.addEventListener('click', () => setHidden(false));

  // Restore last state
  try {
    if (localStorage.getItem('admin_preview_hidden') === '1') setHidden(true);
  } catch (e) {}
}

async function login() {
  const token = $('#pat-input').value.trim();
  const repo = $('#repo-input').value.trim();
  const branch = $('#branch-input').value.trim() || 'main';
  const remember = $('#remember-pat').checked;
  const errEl = $('#login-error');
  errEl.style.display = 'none';

  if (!token || !repo) {
    errEl.textContent = 'Token and repository are required.';
    errEl.style.display = '';
    return;
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    errEl.textContent = 'Repository should be in "owner/repo" form.';
    errEl.style.display = '';
    return;
  }

  const btn = $('#login-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  try {
    await verifyToken(token, repo);
    STATE.config = { token: token, repo: repo, branch: branch };
    if (remember) saveConfig(STATE.config);
    $('#login-overlay').style.display = 'none';
    $('#admin-root').style.display = '';
    await loadData();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

function ensureDataDefaults() {
  if (!STATE.data.profile) STATE.data.profile = {};
  if (!STATE.data.footer) STATE.data.footer = {};
  ['links', 'nav_links', 'news', 'publications', 'projects'].forEach(k => {
    if (!Array.isArray(STATE.data[k])) STATE.data[k] = [];
  });
  if (typeof STATE.data.about !== 'string') STATE.data.about = '';
  // Default design
  const defaults = {
    primary: '#dc2626',
    primary_dark: '#f87171',
    font_sans: 'pretendard',
    font_mono: 'roboto_mono',
    base_font_size: 16,
    name_font_size: 36,
    heading_weight: 500,
    bold_weight: 700,
    tag_weight: 500
  };
  if (!STATE.data.design) STATE.data.design = {};
  Object.keys(defaults).forEach(k => {
    if (STATE.data.design[k] == null) STATE.data.design[k] = defaults[k];
  });
}

async function loadData() {
  setStatus('Loading data.json from ' + STATE.config.repo + '@' + STATE.config.branch + '...');
  try {
    const file = await fetchFile('data.json');
    STATE.sha = file.sha;
    STATE.data = JSON.parse(file.content);

    // Capture which design keys were missing from the saved file BEFORE
    // ensureDataDefaults() backfills them. This makes it obvious in the console
    // if any design value was supplied by defaults rather than the user's save.
    const savedDesign = STATE.data.design || {};
    const beforeKeys = Object.keys(savedDesign);

    ensureDataDefaults();

    const afterKeys = Object.keys(STATE.data.design);
    const filledByDefaults = afterKeys.filter(k => !beforeKeys.includes(k));
    if (filledByDefaults.length) {
      console.warn('[admin] data.json was missing design keys; defaults applied:', filledByDefaults);
    }
    console.log('[admin] Loaded design:', JSON.parse(JSON.stringify(STATE.data.design)));

    fillBindings();
    renderAllLists();
    clearDirty();
    setStatus('Loaded. Connected to ' + STATE.config.repo + '@' + STATE.config.branch + '.');
    // Push to preview
    if (STATE.previewReady) syncPreview(true);
  } catch (e) {
    setStatus('Error: ' + e.message);
    showToast('Failed to load data.json. Does it exist?', 'error');
  }
}

async function save() {
  collectLists();
  collectBindings();
  collectDesign();
  const btn = $('#save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const content = JSON.stringify(STATE.data, null, 2) + '\n';
    const result = await putFile(
      'data.json', content, STATE.sha,
      'Update site content via admin (' + new Date().toISOString() + ')'
    );
    STATE.sha = result.content.sha;
    clearDirty();
    showToast('Saved. GitHub Pages will rebuild in 30-60s.');
    setStatus('Last saved ' + new Date().toLocaleTimeString() + '. GitHub Pages rebuilds in 30-60s.');
  } catch (e) {
    showToast(e.message, 'error');
    setStatus('Save failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

function setStatus(msg) { $('#status-line').textContent = msg; }

function init() {
  wireEvents();
  const cfg = loadConfig();
  if (cfg && cfg.token && cfg.repo) {
    $('#pat-input').value = cfg.token;
    $('#repo-input').value = cfg.repo;
    $('#branch-input').value = cfg.branch || 'main';
    STATE.config = cfg;
    $('#login-overlay').style.display = 'none';
    $('#admin-root').style.display = '';
    loadData().catch(() => {
      $('#login-overlay').style.display = '';
      $('#admin-root').style.display = 'none';
      $('#login-error').textContent = 'Stored token may be invalid. Please sign in again.';
      $('#login-error').style.display = '';
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
