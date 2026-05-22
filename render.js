/* ============================================================
   render.js — fetches data.json, renders the page,
   listens for live-preview messages from admin.
   ============================================================ */

const ICONS = {
  'external-link': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  'mail': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  'graduation-cap': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
  'linkedin': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
  'github': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
  'file-text': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  'globe': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  'twitter': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>'
};

// Font stacks selectable in admin.
// All fonts here are loaded from Google Fonts (or Pretendard CDN) in index.html,
// so they are guaranteed to render.
const FONT_STACKS = {
  pretendard: '"Pretendard", -apple-system, "Apple SD Gothic Neo", sans-serif',
  inter: '"Inter", "Pretendard", sans-serif',
  ibm_plex: '"IBM Plex Sans", "Pretendard", sans-serif',
  manrope: '"Manrope", "Pretendard", sans-serif',
  space_grotesk: '"Space Grotesk", "Pretendard", sans-serif'
};
const MONO_STACKS = {
  roboto_mono: '"Roboto Mono", ui-monospace, SFMono-Regular, monospace',
  jetbrains: '"JetBrains Mono", ui-monospace, monospace',
  ibm_plex_mono: '"IBM Plex Mono", ui-monospace, monospace'
};

let DATA = null;

// Default placeholders used when a path is empty or fails to load.
const PLACEHOLDERS = {
  profile: 'assets/placeholder-profile.svg',
  paper:   'assets/placeholder-paper.svg',
  project: 'assets/placeholder-project.svg'
};

/* Return a usable image path: trims whitespace, and falls back to the named
   placeholder when the source is empty/missing. */
function imageOrPlaceholder(src, kind) {
  const s = (src || '').trim();
  return s || PLACEHOLDERS[kind] || '';
}

/* HTML for an <img> tag with an onerror fallback to the placeholder.
   The "data-fallback" attribute is read by the onerror handler. */
function imgTag(src, kind, alt) {
  const finalSrc = imageOrPlaceholder(src, kind);
  const fallback = PLACEHOLDERS[kind] || '';
  return '<img src="' + escapeHtml(finalSrc) + '"' +
         ' alt="' + escapeHtml(alt || '') + '"' +
         ' data-fallback="' + escapeHtml(fallback) + '"' +
         ' onerror="if(this.src.indexOf(this.dataset.fallback)<0){this.src=this.dataset.fallback;}else{this.onerror=null;}">';
}

function setupTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  let transitionTimer = null;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    // Turn on the global "fade colors between themes" transition for a short
    // window, then turn it off again so other transitions (hover, focus) run
    // at their own usual speeds.
    root.classList.add('is-theme-transitioning');
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      root.classList.remove('is-theme-transitioning');
    }, 300);

    const current = root.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    root.classList.remove('light', 'dark');
    root.classList.add(next);
    root.style.colorScheme = next;
    try { localStorage.setItem('theme', next); } catch(e) {}
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mdLinks(s) {
  return escapeHtml(s).replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function highlightSelf(authors, selfName) {
  if (!authors || !selfName) return escapeHtml(authors);
  const safe = selfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(' + safe + ')', 'g');
  return escapeHtml(authors).replace(re, '<span class="self">$1</span>');
}

/* Apply design tokens from data.design to :root CSS variables. */
function applyDesign(design) {
  if (!design) design = {};
  const root = document.documentElement.style;
  // Primary color (light + dark variants)
  if (design.primary) root.setProperty('--primary', design.primary);
  if (design.primary_dark) {
    // We can't set per-class scoped vars from JS easily;
    // override in dark via the style element below.
    let darkStyle = document.getElementById('dark-overrides');
    if (!darkStyle) {
      darkStyle = document.createElement('style');
      darkStyle.id = 'dark-overrides';
      document.head.appendChild(darkStyle);
    }
    darkStyle.textContent = 'html.dark { --primary: ' + design.primary_dark + '; }';
  }
  // Fonts
  if (design.font_sans && FONT_STACKS[design.font_sans]) {
    root.setProperty('--font-sans', FONT_STACKS[design.font_sans]);
  }
  if (design.font_mono && MONO_STACKS[design.font_mono]) {
    root.setProperty('--font-mono', MONO_STACKS[design.font_mono]);
  }
  // Sizes
  if (design.base_font_size) root.setProperty('--base-size', design.base_font_size + 'px');
  if (design.name_font_size) root.setProperty('--name-size', design.name_font_size + 'px');
  // Weights
  if (design.heading_weight) root.setProperty('--heading-weight', design.heading_weight);
  if (design.bold_weight) root.setProperty('--bold-weight', design.bold_weight);
  if (design.tag_weight) root.setProperty('--tag-weight', design.tag_weight);
}

function render() {
  if (!DATA) return;
  const p = DATA.profile || {};

  // Apply design tokens FIRST
  applyDesign(DATA.design || {});

  document.title = p.name || 'Personal Homepage';

  const brand = document.querySelector('.nav-brand');
  if (brand) brand.textContent = p.name || '';

  const navLinks = document.getElementById('nav-links');
  if (navLinks) {
    const toggle = navLinks.querySelector('.theme-toggle');
    navLinks.innerHTML = '';
    (DATA.nav_links || []).forEach(l => {
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.href = l.url;
      a.textContent = l.label;
      if (l.url && l.url.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      navLinks.appendChild(a);
    });
    if (toggle) navLinks.appendChild(toggle);
  }

  const photo = document.getElementById('profile-photo');
  if (photo) {
    const src = imageOrPlaceholder(p.photo, 'profile');
    photo.src = src;
    photo.alt = p.name || '';
    photo.dataset.fallback = PLACEHOLDERS.profile;
    photo.onerror = function() {
      if (this.src.indexOf(this.dataset.fallback) < 0) {
        this.src = this.dataset.fallback;
      } else {
        this.onerror = null;
      }
    };
  }

  document.getElementById('profile-name').textContent = p.name || '';

  const titleEl = document.getElementById('profile-title');
  let titleHTML = escapeHtml(p.title || '');
  if (p.lab_name) {
    const safeUrl = escapeHtml(p.lab_url || '#');
    titleHTML += ' <a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(p.lab_name) + '</a>';
  }
  if (p.affiliation) titleHTML += ', ' + escapeHtml(p.affiliation);
  titleEl.innerHTML = titleHTML;

  document.getElementById('profile-location').textContent = p.location || '';

  const sl = document.getElementById('sidebar-links');
  sl.innerHTML = '';
  (DATA.links || []).forEach(link => {
    const wrap = document.createElement('span');
    const icon = ICONS[link.icon] || ICONS['external-link'];

    const mobile = document.createElement('a');
    mobile.className = 'sidebar-link-mobile';
    mobile.href = link.url || '#';
    if (link.url && link.url.startsWith('http')) { mobile.target = '_blank'; mobile.rel = 'noopener noreferrer'; }
    mobile.innerHTML = icon + escapeHtml(link.label);

    const desktop = document.createElement('a');
    desktop.className = 'sidebar-link-desktop';
    desktop.href = link.url || '#';
    if (link.url && link.url.startsWith('http')) { desktop.target = '_blank'; desktop.rel = 'noopener noreferrer'; }
    desktop.innerHTML = icon + escapeHtml(link.label);

    wrap.appendChild(mobile);
    wrap.appendChild(desktop);
    sl.appendChild(wrap);
  });

  document.getElementById('about-text').innerHTML = mdLinks(DATA.about || '');

  // News
  const news = document.getElementById('news-list');
  news.innerHTML = '';
  if (!DATA.news || DATA.news.length === 0) {
    document.getElementById('news-section').style.display = 'none';
  } else {
    document.getElementById('news-section').style.display = '';
    DATA.news.forEach(n => {
      const item = document.createElement('div');
      item.className = 'news-item';
      item.innerHTML =
        '<span class="news-date">' + escapeHtml(n.date) + '</span>' +
        '<p class="news-text' + (n.highlight ? ' highlight' : '') + '">' + mdLinks(n.text || '') + '</p>';
      news.appendChild(item);
    });
  }

  // Publications
  const pubs = document.getElementById('pubs-list');
  pubs.innerHTML = '';
  if (!DATA.publications || DATA.publications.length === 0) {
    document.getElementById('pubs-section').style.display = 'none';
    document.getElementById('sep-pubs').style.display = 'none';
  } else {
    document.getElementById('pubs-section').style.display = '';
    document.getElementById('sep-pubs').style.display = '';
    DATA.publications.forEach(pub => {
      const card = document.createElement('div');
      card.className = 'pub-card';
      const tags = [];
      if (pub.venue_tag) tags.push('<span class="tag">' + escapeHtml(pub.venue_tag) + '</span>');
      if (pub.type_tag) tags.push('<span class="tag type">' + escapeHtml(pub.type_tag) + '</span>');
      if (pub.highlight) tags.push('<span class="tag highlight">' + escapeHtml(pub.highlight) + '</span>');
      card.innerHTML =
        '<div class="pub-image">' + imgTag(pub.image, 'paper', pub.title) + '</div>' +
        '<div class="pub-content">' +
          '<h3 class="pub-title">' + escapeHtml(pub.title) + '</h3>' +
          '<p class="pub-authors">' + highlightSelf(pub.authors, p.name || '') + '</p>' +
          (tags.length ? '<div class="pub-tags">' + tags.join('') + '</div>' : '') +
          (pub.pdf_url ?
            '<div class="pub-actions"><a class="pub-action" href="' + escapeHtml(pub.pdf_url) + '" target="_blank" rel="noopener noreferrer">' +
              ICONS['file-text'] + 'Paper PDF</a></div>' : '') +
        '</div>';
      pubs.appendChild(card);
    });
  }

  // Projects
  const projects = document.getElementById('projects-list');
  projects.innerHTML = '';
  if (!DATA.projects || DATA.projects.length === 0) {
    document.getElementById('projects-section').style.display = 'none';
    document.getElementById('sep-projects').style.display = 'none';
  } else {
    document.getElementById('projects-section').style.display = '';
    document.getElementById('sep-projects').style.display = '';
    DATA.projects.forEach(pr => {
      const card = document.createElement('a');
      card.className = 'project-card';
      card.href = pr.url || '#';
      if (pr.url && pr.url.startsWith('http')) { card.target = '_blank'; card.rel = 'noopener noreferrer'; }
      const tags = (pr.tags || []).map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('');
      card.innerHTML =
        '<div class="project-image">' + imgTag(pr.image, 'project', pr.title) + '</div>' +
        '<div class="project-body">' +
          '<h3 class="project-title">' + escapeHtml(pr.title) + '</h3>' +
          (pr.authors ? '<p class="project-authors">' + highlightSelf(pr.authors, p.name || '') + '</p>' : '') +
          (pr.description ? '<p class="project-authors" style="margin-top:0.5rem;">' + escapeHtml(pr.description) + '</p>' : '') +
          (tags ? '<div class="project-tags">' + tags + '</div>' : '') +
        '</div>';
      projects.appendChild(card);
    });
  }

  // Footer
  const f = DATA.footer || {};
  document.getElementById('footer-text').textContent =
    '© ' + (f.year || new Date().getFullYear()) + ' ' + (f.name || p.name || '');
  const fi = document.getElementById('footer-icons');
  fi.innerHTML = '';
  (DATA.links || []).forEach(l => {
    const a = document.createElement('a');
    a.href = l.url || '#';
    a.title = l.label;
    a.setAttribute('aria-label', l.label);
    if (l.url && l.url.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.innerHTML = ICONS[l.icon] || ICONS['external-link'];
    fi.appendChild(a);
  });
}

/* ---- Live-preview support ----
   When this page is loaded inside the admin iframe,
   the parent posts {type:'data', payload: {...}} on every change.
   We re-render immediately with the supplied data. */
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'data' && e.data.payload) {
    DATA = e.data.payload;
    render();
    // Acknowledge so admin can show "synced"
    try { e.source.postMessage({ type: 'rendered' }, '*'); } catch (err) {}
  }
});

async function init() {
  setupTheme();

  // If running inside admin iframe, wait for postMessage instead of fetching
  const inIframe = window.self !== window.top;
  if (inIframe) {
    // Signal to parent we're ready
    try { window.parent.postMessage({ type: 'ready' }, '*'); } catch (e) {}
    return;
  }

  try {
    const res = await fetch('data.json?v=' + Date.now());
    if (!res.ok) throw new Error('Failed to load data.json');
    DATA = await res.json();
    render();
  } catch (e) {
    console.error(e);
    document.getElementById('about-text').textContent =
      'Could not load data.json — please visit /admin to set up your site.';
  }
}

document.addEventListener('DOMContentLoaded', init);
