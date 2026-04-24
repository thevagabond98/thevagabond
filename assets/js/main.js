/**
 * main.js — The Vagabond CMS renderer
 * Fetches Markdown from /content/{category}/, parses frontmatter,
 * renders posts onto homepage, category pages, and post pages.
 */

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
  let html = md
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/_(.+?)_/g,       '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
// Links
.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
// Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Line breaks → paragraphs
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|blockquote|hr|ul|ol|li)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

/* ─── Fetch helpers ───────────────────────────────────────────── */
const CONFIG = window.VAGABOND_CONFIG;

async function fetchPost(category, slug) {
  const url = `${CONFIG.contentBase}/${category}/${slug}.md`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Not found: ${url}`);
  const text = await res.text();
  const { meta, body } = parseFrontmatter(text);
  return { slug, category, ...meta, body };
}

async function fetchCategory(category) {
  // Fetch the index manifest for this category
  const url = `${CONFIG.contentBase}/${category}/index.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const slugs = await res.json();
    const posts = await Promise.allSettled(slugs.map(s => fetchPost(category, s)));
    return posts
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
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

/* ─── Social links injector ──────────────────────────────────── */
function renderSocialLinks() {
  const containers = document.querySelectorAll('.social-links');
  containers.forEach(el => {
    el.innerHTML = CONFIG.social.map(s =>
      `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>`
    ).join('');
  });
}

/* ─── Post card HTML ─────────────────────────────────────────── */
function postCardHtml(post) {
  const href = `/post.html?category=${post.category}&slug=${post.slug}`;
  return `
    <article class="post-card">
      <div class="post-meta">
        <span class="category">${post.category}</span>
        <span>${formatDate(post.date)}</span>
      </div>
      <h2><a href="${href}">${post.title || 'Untitled'}</a></h2>
      ${post.description ? `<p class="post-excerpt">${post.description}</p>` : ''}
    </article>`;
}

/* ─── Post list item HTML ────────────────────────────────────── */
function postListItemHtml(post) {
  const href = `/post.html?category=${post.category}&slug=${post.slug}`;
  return `
    <article class="post-list-item">
      <div>
        <h2><a href="${href}">${post.title || 'Untitled'}</a></h2>
        ${post.description ? `<p class="post-excerpt">${post.description}</p>` : ''}
      </div>
      <div class="post-list-date">${formatDate(post.date)}</div>
    </article>`;
}

/* ─── Homepage renderer ──────────────────────────────────────── */
async function renderHomepage() {
  const grid = document.getElementById('latest-posts');
  if (!grid) return;

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

  // Set page meta from config
  const meta = CONFIG.categoryMeta[category] || {};
  const titleEl = document.querySelector('.page-title');
  const subtitleEl = document.querySelector('.page-subtitle');
  if (titleEl && meta.title) titleEl.textContent = meta.title;
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

  const params = new URLSearchParams(window.location.search);
  const slug     = params.get('slug');
  const category = params.get('category');

  if (!slug || !category) {
    container.innerHTML = '<p class="empty-state">Post not found.</p>';
    return;
  }

  container.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const post = await fetchPost(category, slug);
    document.title = `${post.title} — The Vagabond`;

    container.innerHTML = `
      <a href="/${category}/" class="back-link">← ${category}</a>
      <header class="post-header">
        <div class="post-meta">
          <span class="category">${post.category}</span>
          <span>${formatDate(post.date)}</span>
        </div>
        <h1 class="post-title">${post.title || 'Untitled'}</h1>
        ${post.description ? `<p class="post-description">${post.description}</p>` : ''}
      </header>
      <div class="post-body">
        ${markdownToHtml(post.body)}
      </div>`;
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
