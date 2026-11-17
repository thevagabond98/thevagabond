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
    // CMS rich-text blocks
    'figure','figcaption',
    'div','span',
  ],
  ALLOWED_ATTR: [
    'href','src','alt','title','class','target','rel',
    // CMS image attributes
    'width','height','loading',
  ],
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
  } catch (_) {}
  // Allow absolute paths, relative paths, and filenames (no protocol = safe)
  if (/^[^:]*$/.test(url)) return url;
  return '#';
}

/* ─── Frontmatter parser ──────────────────────────────────────── */
// Strip surrounding quotes only when the value both starts and ends with the same quote
function unquote(v) {
  const m = v.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : v;
}

function parseFrontmatter(raw) {
  // Normalise Windows (\r\n) and old-Mac (\r) line endings so paragraph splitting works
  raw = String(raw).replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  let lastKey = null;
  match[1].split('\n').forEach(line => {
    // YAML folded-scalar continuation: indented line with no colon = append to last key
    if (lastKey && /^ {2,}\S/.test(line) && line.indexOf(':') === -1) {
      meta[lastKey] = unquote(meta[lastKey] + ' ' + line.trim());
      return;
    }
    const colon = line.indexOf(':');
    if (colon === -1) return;
    const key = line.slice(0, colon).trim();
    const val = unquote(line.slice(colon + 1).trim());
    meta[key] = val;
    lastKey = key;
  });
  return { meta, body: match[2].trim() };
}

/* ─── Markdown → HTML ─────────────────────────────────────────── */
// Inline formatting. Code, images and links are lifted into placeholders first so
// characters inside URLs (e.g. underscores in image names) are never read as emphasis.
function inlineMd(text) {
  const stash = [];
  const hold = html => '\u0000' + (stash.push(html) - 1) + '\u0000';

  let out = String(text)
    .replace(/`([^`]+)`/g, (_, c) => hold('<code>' + escapeHtml(c) + '</code>'))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) =>
      hold(`<img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt || ' ')}" loading="lazy">`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, t, href) =>
      hold(`<a href="${escapeHtml(safeUrl(href))}">${escapeHtml(t)}</a>`));

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // _em_ only at word boundaries, so snake_case words are left alone
    .replace(/(^|[\s(>])_([^\s_](?:[^_]*?[^\s_])?)_(?=$|[\s).,;:!?<])/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

// Blocks that already are HTML (CMS-generated) are passed straight to DOMPurify.
const RAW_BLOCK = /^<(h[1-6]|blockquote|hr|ul|ol|li|img|figure|figcaption|table|pre|div|span|p)[\s>\/]/i;

function markdownToHtml(md) {
  // Normalise Windows (\r\n) / old-Mac (\r) line endings first
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], quote = [], list = null, fence = null;

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ').trim();
    para = [];
    if (!text) return;
    if (RAW_BLOCK.test(text)) out.push(text);
    else if (/^!\[[^\]]*\]\([^)]*\)$/.test(text)) out.push(inlineMd(text)); // image on its own
    else out.push('<p>' + inlineMd(text) + '</p>');
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const groups = [[]];
    quote.forEach(l => { if (l === '') groups.push([]); else groups[groups.length - 1].push(l); });
    const paras = groups.filter(g => g.length).map(g => inlineMd(g.join(' ')));
    out.push('<blockquote>' + (paras.length > 1 ? paras.map(x => '<p>' + x + '</p>').join('') : paras[0] || '') + '</blockquote>');
    quote = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.tag}>` + list.items.map(i => '<li>' + inlineMd(i) + '</li>').join('') + `</${list.tag}>`);
    list = null;
  };
  const flushAll = () => { flushPara(); flushQuote(); flushList(); };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (fence !== null) {                      // inside ``` code block
      if (/^```/.test(line)) { out.push('<pre><code>' + escapeHtml(fence.join('\n')) + '</code></pre>'); fence = null; }
      else fence.push(rawLine);
      continue;
    }
    if (/^```/.test(line)) { flushAll(); fence = []; continue; }
    if (!line.trim())      { flushAll(); continue; }   // blank line = paragraph break

    let m;
    if ((m = line.match(/^(#{1,6})\s+(.+?)\s*$/))) {
      flushAll();
      out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushAll(); out.push('<hr>'); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1].trim()); continue; }
    if ((m = line.match(/^\s{0,3}[-*+]\s+(.+)$/))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = line.match(/^\s{0,3}\d{1,3}[.)]\s+(.+)$/))) {   // 1-3 digits so "2019. Text" stays a paragraph
      flushPara(); flushQuote();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushQuote(); flushList();
    para.push(line.trim());
  }
  if (fence !== null) out.push('<pre><code>' + escapeHtml(fence.join('\n')) + '</code></pre>');
  flushAll();

  // DOMPurify is the final defence — cleans anything the parser let through
  return sanitize(out.join('\n'));
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
    return posts.filter(r => r.status === 'fulfilled').map(r => r.value)
      .sort((x, y) => new Date(y.date) - new Date(x.date));
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

    // Canonical URL for this post
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    canon.href = `https://thevagabond.blog/post.html?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(slug)}`;

    // JSON-LD Article + Breadcrumb schema
    injectArticleSchema(post, category, slug);

    const categoryHref = `/${encodeURIComponent(category)}/`;

    // markdownToHtml() already runs sanitize() internally
    const bodyHtml = markdownToHtml(post.body);

    window.scrollTo(0, 0);
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
