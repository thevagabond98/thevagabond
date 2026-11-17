#!/usr/bin/env node
/**
 * generate-index.js
 * Rebuilds content/{category}/index.json (newest post first) and sitemap.xml.
 * Run automatically by Netlify at build time (see netlify.toml), or manually:
 *   node generate-index.js
 */

const fs   = require('fs');
const path = require('path');

const SITE       = 'https://thevagabond.blog';
const categories = ['stories', 'poems', 'ideas'];
const contentDir = path.join(__dirname, 'content');

/** Read just the frontmatter keys we need (title/date). */
function readMeta(file) {
  const raw  = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const m    = raw.match(/^---\n([\s\S]*?)\n---/);
  const meta = {};
  if (m) {
    m[1].split('\n').forEach(line => {
      if (/^\s/.test(line)) return;               // folded continuation lines
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    });
  }
  return meta;
}

const xmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const postUrls  = [];

categories.forEach(cat => {
  const dir = path.join(contentDir, cat);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const posts = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const slug = f.replace(/\.md$/, '');
      const t    = new Date(readMeta(path.join(dir, f)).date).getTime();
      return { slug, time: isNaN(t) ? 0 : t };
    })
    .sort((a, b) => b.time - a.time || a.slug.localeCompare(b.slug));   // newest first

  const files = posts.map(p => p.slug);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(files, null, 2) + '\n');
  console.log(`✓ ${cat}/index.json — ${files.length} post(s): ${files.join(', ') || '(none)'}`);

  posts.forEach(p => postUrls.push({
    loc: `${SITE}/post.html?category=${cat}&slug=${encodeURIComponent(p.slug)}`,
    lastmod: p.time ? new Date(p.time).toISOString().slice(0, 10) : null,
  }));
});

// ── sitemap.xml ──
const pages = [
  { loc: `${SITE}/`,            freq: 'weekly',  pri: '1.0' },
  { loc: `${SITE}/about.html`,  freq: 'monthly', pri: '0.6' },
  { loc: `${SITE}/stories/`,    freq: 'weekly',  pri: '0.8' },
  { loc: `${SITE}/poems/`,      freq: 'weekly',  pri: '0.8' },
  { loc: `${SITE}/ideas/`,      freq: 'weekly',  pri: '0.8' },
];
const entry = (loc, freq, pri, lastmod) =>
  `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n` +
  (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
  `    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>\n`;

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n' +
  pages.map(p => entry(p.loc, p.freq, p.pri)).join('\n') + '\n' +
  postUrls.map(p => entry(p.loc, 'monthly', '0.7', p.lastmod)).join('\n') +
  '\n</urlset>\n';

fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);
console.log(`✓ sitemap.xml — ${pages.length} pages + ${postUrls.length} post(s)`);
console.log('\nIndex generation complete.');
