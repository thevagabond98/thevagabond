/**
 * main.js — The Vagabond CMS renderer
 * Fetches Markdown from /content/{category}/, parses frontmatter,
 * renders posts onto homepage, category pages, and post pages.
 *
 * Security: DOMPurify sanitizes all markdown→HTML output before DOM injection.
 * All metadata fields (title, date, category, description) are escaped via
 * escapeHtml() when interpolated into innerHTML attribute strings.
 */

/* ─── DOMPurify config ────────────────────────────────────────── */
// Allowed elements and attributes for markdown-rendered content.
// Blocks <script>, <iframe>, <object>, on* handlers, javascript: URLs.
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1','h2','h3','h4','h5','h6',
    'p','br','hr','blockquote',
    'strong','em','code','pre',
    'a','img',
    'ul','ol','li',
    'table','thead','tbody','tr','th','td',
  ],
  ALLOWED_ATTR: ['href','src','alt','title','class','target','rel'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script','style','iframe','object','embed','form','input'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur'],
};

function sanitize(dirtyHtml) {
  if (typeof DOMPurify === 'undefined' || typeof DOMPurify.sanitize !== 'function') {
    // Fallback: strip all HTML tags when DOMPurify is unavailable.
    // Returns plain text — safe but loses formatting. A warning is shown once.
    if (!sanitize._warned) {
      console.warn('[Vagabond] DOMPurify unavailable — HTML stripped as XSS fallback. Check CDN connectivity.');
      sanitize._warned = true;
    }
    return String(dirtyHtml).replace(/<[^>]*>/g, '');
  }
  return DOMPurify.sanitize(dirtyHtml, DOMPURIFY_CONFIG);
}

/* ─── HTML entity escaper (for attribute injection) ───────────── */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

/* ─── Safe URL validator (allow only http/https/relative) ────── */
function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch (_) {
    if (/^\/[^/]/.test(url) || /^[^:]+$/.test(url)) return url;
  }
  return '#';
}

/* ─── Frontmatter parser ──────────────────────────────────────── */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  match[1].split('\n').forEach(line => {
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  });
  return { meta, body: match[2].trim() };
}

/* ─── Minimal Markdown → HTML ─────────────────────────────────── */
function markdownToHtml(md) {
  const html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/^> (.+)$/gm,   '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/_(.+?)_/g,       '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>')
    // Images — src sanitised before DOMPurify pass
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
      `<img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}">`)
    // Links — href sanitised before DOMPurify pass
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, text, href) =>
      `<a href="${escapeHtml(safeUrl(href))}">${escapeHtml(text)}</a>`)
    .replace(/^---$/gm, '<hr>')
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|blockquote|hr|ul|ol|li)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  // DOMPurify is the final defence — cleans anything the regex pipeline missed
  return sanitize(html);
}

/* ─── Fetch helpers ───────────────────────────────────────────── */
const CONFIG = window.VAGABOND_CONFIG;

async function fetchPost(category, slug) {
  const url = `${CONFIG.contentBase}/${encodeURIComponent(category)}/${encodeURIComponent(slug)}.md`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Not found: ${url}`);
  const text = await res.text();
  const { meta, body } = parseFrontmatter(text);
  return { slug, category, ...meta, body };
}

async function fetchCategory(category) {
  const url = `${CONFIG.contentBase}/${encodeURIComponent(category)}/index.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const slugs = await res.json();
    if (!Array.isArray(slugs)) return [];
    const posts = await Promise.allSettled(slugs.map(s => fetchPost(category, s)));
    return posts.filter(r => r.status === 'fulfilled').map(r => r.value);
  } catch {
    return [];
  }
}

async function fetchAllPosts() {
  const all = await Promise.all(CONFIG.categories.map(fetchCategory));
  const flat = all.flat();
  flat.sort((a, b) => new Date(b.date) - new Date(a.date));
  return flat;
}

/* ─── Date formatter ─────────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ─── ISO date helper for JSON-LD ────────────────────────────── */
function toIsoDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* ─── JSON-LD helpers ────────────────────────────────────────── */
function injectJsonLd(id, data) {
  // Remove any previous tag with the same id to avoid duplicates
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = id;
  script.textContent = JSON.stringify(data, null, 2);
  document.head.appendChild(script);
}

function injectHomepageSchema() {
  const siteUrl = 'https://thevagabond.blog/';
  injectJsonLd('ld-website', {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': siteUrl + '#website',
    name: CONFIG.title || 'The Vagabond',
    url: siteUrl,
    description: 'Navigating the noise \u2014 politics, stories, poetry & ideas for people who still believe words matter.',
    publisher: {
      '@type': 'Organization',
      '@id': siteUrl + '#organization',
      name: CONFIG.title || 'The Vagabond',
      url: siteUrl,
    },
    sameAs: (CONFIG.social || []).map(s => s.url).filter(Boolean),
  });
}

function injectCategorySchema(category) {
  const catMeta = CONFIG.categoryMeta[category] || {};
  injectJsonLd('ld-breadcrumb', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://thevagabond.blog/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: catMeta.title || category,
        item: `https://thevagabond.blog/${encodeURIComponent(category)}/`,
      },
    ],
  });
}

function injectArticleSchema(post, category, slug) {
  const siteUrl   = 'https://thevagabond.blog/';
  const postUrl   = `${siteUrl}post.html?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(slug)}`;
  const catMeta   = (CONFIG.categoryMeta && CONFIG.categoryMeta[category]) || {};

  // Build schema — every field null-guarded so missing frontmatter can't break output
  const headline    = (post.title       || 'Untitled Post').slice(0, 110); // Google truncates at 110
  const description = (post.description || '').slice(0, 300);
  const authorName  = (post.author      || 'The Vagabond');
  const isoDate     = toIsoDate(post.date) || '';
  const section     = (category         || '').toLowerCase();
  const keywords    = (post.tags || post.keywords || '');

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': postUrl + '#article',
    headline,
    ...(description ? { description } : {}),
    ...(isoDate     ? { datePublished: isoDate, dateModified: isoDate } : {}),
    author: {
      '@type': 'Person',
      name: authorName,
    },
    publisher: {
      '@type': 'Organization',
      '@id': siteUrl + '#organization',
      name: CONFIG.title || 'The Vagabond',
      url: siteUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl,
    },
    url: postUrl,
    ...(section     ? { articleSection: section } : {}),
    ...(keywords    ? { keywords } : {}),
    ...(post.image  ? { image: post.image } : {}),
  };

  injectJsonLd('ld-article', articleSchema);

  // Breadcrumb: Home → Category → Post
  injectJsonLd('ld-breadcrumb', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: catMeta.title || category,
        item: `${siteUrl}${encodeURIComponent(category)}/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: headline,
        item: postUrl,
      },
    ],
  });
}

/* ─── Social links injector ──────────────────────────────────── */
function renderSocialLinks() {
  document.querySelectorAll('.social-links').forEach(el => {
    el.innerHTML = CONFIG.social.map(s =>
      `<a href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`
    ).join('');
  });
}

/* ─── Post card HTML ─────────────────────────────────────────── */
function postCardHtml(post) {
  const href = `/post.html?category=${encodeURIComponent(post.category)}&slug=${encodeURIComponent(post.slug)}`;
  return `
    <article class="post-card">
      <div class="post-meta">
        <span class="category">${escapeHtml(post.category)}</span>
        <span>${escapeHtml(formatDate(post.date))}</span>
      </div>
      <h2><a href="${escapeHtml(href)}">${escapeHtml(post.title || 'Untitled')}</a></h2>
      ${post.description ? `<p class="post-excerpt">${escapeHtml(post.description)}</p>` : ''}
    </article>`;
}

/* ─── Post list item HTML ────────────────────────────────────── */
function postListItemHtml(post) {
  const href = `/post.html?category=${encodeURIComponent(post.category)}&slug=${encodeURIComponent(post.slug)}`;
  return `
    <article class="post-list-item">
      <div>
        <h2><a href="${escapeHtml(href)}">${escapeHtml(post.title || 'Untitled')}</a></h2>
        ${post.description ? `<p class="post-excerpt">${escapeHtml(post.description)}</p>` : ''}
      </div>
      <div class="post-list-date">${escapeHtml(formatDate(post.date))}</div>
    </article>`;
}

/* ─── Homepage renderer ──────────────────────────────────────── */
async function renderHomepage() {
  const grid = document.getElementById('latest-posts');
  if (!grid) return;

  injectHomepageSchema();

  grid.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const posts = await fetchAllPosts();
    const latest = posts.slice(0, CONFIG.homepagePostCount);
    if (!latest.length) {
      grid.innerHTML = '<p class="empty-state">No posts yet.</p>';
      return;
    }
    grid.innerHTML = latest.map(postCardHtml).join('');
  } catch (e) {
    grid.innerHTML = '<p class="empty-state">Could not load posts.</p>';
    console.error(e);
  }
}

/* ─── Category page renderer ─────────────────────────────────── */
async function renderCategoryPage() {
  const list = document.getElementById('category-posts');
  if (!list) return;

  const category = document.body.dataset.category;
  if (!category) return;

  injectCategorySchema(category);

  // Set page meta from config
  const meta = CONFIG.categoryMeta[category] || {};
  const titleEl    = document.querySelector('.page-title');
  const subtitleEl = document.querySelector('.page-subtitle');
  if (titleEl    && meta.title)       titleEl.textContent    = meta.title;
  if (subtitleEl && meta.description) subtitleEl.textContent = meta.description;

  list.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const posts = await fetchCategory(category);
    if (!posts.length) {
      list.innerHTML = '<p class="empty-state">No posts in this category yet.</p>';
      return;
    }
    list.innerHTML = posts.map(postListItemHtml).join('');
  } catch (e) {
    list.innerHTML = '<p class="empty-state">Could not load posts.</p>';
    console.error(e);
  }
}

/* ─── Single post renderer ───────────────────────────────────── */
async function renderPost() {
  const container = document.getElementById('post-container');
  if (!container) return;

  const params   = new URLSearchParams(window.location.search);
  const slug     = params.get('slug');
  const category = params.get('category');

  if (!slug || !category) {
    container.innerHTML = '<p class="empty-state">Post not found.</p>';
    return;
  }

  container.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const post = await fetchPost(category, slug);

    // Page title
    document.title = `${post.title || 'Post'} — The Vagabond`;

    // Dynamic Open Graph / Twitter meta (SEO)
    const setMeta = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('content', val);
    };
    setMeta('og-title',       post.title || 'The Vagabond');
    setMeta('og-description', post.description || '');
    setMeta('og-url',         `https://thevagabond.blog/post.html?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(slug)}`);
    setMeta('tw-title',       post.title || 'The Vagabond');
    setMeta('tw-description', post.description || '');

    // JSON-LD Article + Breadcrumb schema
    injectArticleSchema(post, category, slug);

    const categoryHref = `/${encodeURIComponent(category)}/`;

    // markdownToHtml() already runs sanitize() internally
    const bodyHtml = markdownToHtml(post.body);

    container.innerHTML = `
      <a href="${escapeHtml(categoryHref)}" class="back-link">← ${escapeHtml(category)}</a>
      <header class="post-header">
        <div class="post-meta">
          <span class="category">${escapeHtml(post.category)}</span>
          <span>${escapeHtml(formatDate(post.date))}</span>
        </div>
        <h1 class="post-title">${escapeHtml(post.title || 'Untitled')}</h1>
        ${post.description ? `<p class="post-description">${escapeHtml(post.description)}</p>` : ''}
      </header>
      <div class="post-body">${bodyHtml}</div>`;
  } catch (e) {
    container.innerHTML = '<p class="empty-state">Post not found.</p>';
    console.error(e);
  }
}

/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  renderSocialLinks();
  renderHomepage();
  renderCategoryPage();
  renderPost();
});
