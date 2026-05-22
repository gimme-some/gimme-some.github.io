/* ============================================================
   admin.js — GitHub API based editor
   ============================================================
   Authenticates with a GitHub Personal Access Token,
   loads /data.json from the repo, lets the user edit through a
   form, and commits changes back via the contents API.
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
    if (res.status === 401) throw new Error('Invalid token (401). Make sure the PAT has not expired.');
    if (res.status === 404) throw new Error('Repository not found, or token lacks access. Check the repo name and PAT scopes.');
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

// ---- State ----
const STATE = { config: null, data: null, sha: null };

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

// ---- Lists ----
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
      { key: 'date', label: 'Date (e.g., Nov 2025)', type: 'text' },
      { key: 'highlight', label: 'Highlight (bold)', type: 'checkbox' },
      { key: 'text', label: 'Text (supports [text](url) markdown links)', type: 'textarea', full: true }
    ]
  },
  publications: {
    container: '#pubs-list-edit',
    label: 'Publication',
    fields: [
      { key: 'title', label: 'Title', type: 'text', full: true },
      { key: 'authors', label: 'Authors (your name auto-bolded)', type: 'text', full: true },
      { key: 'venue_tag', label: 'Venue tag (e.g., WSDM 2026)', type: 'text' },
      { key: 'type_tag', label: 'Type tag (e.g., Full Paper)', type: 'text' },
      { key: 'highlight', label: 'Highlight tag (e.g., Honorable Mention)', type: 'text', full: true },
      { key: 'image', label: 'Image path', type: 'text' },
      { key: 'pdf_url', label: 'PDF URL', type: 'text' }
    ]
  },
  projects: {
    container: '#projects-list-edit',
    label: 'Project',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'authors', label: 'Authors (your name auto-bolded)', type: 'text' },
      { key: 'image', label: 'Image path', type: 'text' },
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
    field.appendChild(input);

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

// ---- Event wiring ----
function wireEvents() {
  $$('[data-add]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-add');
      collectLists();
      collectBindings();
      const blank = {};
      LIST_SCHEMAS[key].fields.forEach(f => {
        if (f.type === 'checkbox') blank[f.key] = false;
        else if (f.type === 'tags') blank[f.key] = [];
        else blank[f.key] = '';
      });
      if (!Array.isArray(STATE.data[key])) STATE.data[key] = [];
      STATE.data[key].push(blank);
      renderList(key);
    });
  });

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
    });
  });

  $('#save-btn').addEventListener('click', save);
  $('#reload-btn').addEventListener('click', async () => {
    if (!confirm('Discard local changes and re-fetch from GitHub?')) return;
    await loadData();
  });
  $('#logout-btn').addEventListener('click', () => {
    if (!confirm('Sign out? Stored token will be removed from this device.')) return;
    clearConfig();
    location.reload();
  });

  $('#login-btn').addEventListener('click', login);
  $('#pat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('#repo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
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
    errEl.textContent = 'Repository should be in the form "owner/repo".';
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

async function loadData() {
  setStatus('Loading data.json from ' + STATE.config.repo + '@' + STATE.config.branch + '...');
  try {
    const file = await fetchFile('data.json');
    STATE.sha = file.sha;
    STATE.data = JSON.parse(file.content);
    if (!STATE.data.profile) STATE.data.profile = {};
    if (!STATE.data.footer) STATE.data.footer = {};
    ['links', 'nav_links', 'news', 'publications', 'projects'].forEach(k => {
      if (!Array.isArray(STATE.data[k])) STATE.data[k] = [];
    });
    if (typeof STATE.data.about !== 'string') STATE.data.about = '';

    fillBindings();
    renderAllLists();
    setStatus('Loaded. Connected to ' + STATE.config.repo + '@' + STATE.config.branch + '.');
  } catch (e) {
    setStatus('Error: ' + e.message);
    showToast('Failed to load data.json. Does it exist in the repo?', 'error');
  }
}

async function save() {
  collectLists();
  collectBindings();
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
    showToast('Saved. GitHub Pages will rebuild in 30-60s.');
    setStatus('Last saved ' + new Date().toLocaleTimeString() + '. GitHub Pages typically rebuilds in 30-60s.');
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
