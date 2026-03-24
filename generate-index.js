#!/usr/bin/env node
/**
 * generate-index.js
 * Run after adding new .md files to regenerate index.json manifests.
 * Usage: node generate-index.js
 *
 * This is also called automatically by Netlify at build time
 * if you add it to your build command in netlify.toml:
 *   command = "node generate-index.js"
 */

const fs   = require('fs');
const path = require('path');

const categories = ['stories', 'poems', 'ideas'];
const contentDir = path.join(__dirname, 'content');

categories.forEach(cat => {
  const dir = path.join(contentDir, cat);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));

  const indexPath = path.join(dir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(files, null, 2) + '\n');
  console.log(`✓ ${cat}/index.json — ${files.length} post(s): ${files.join(', ') || '(none)'}`);
});

console.log('\nIndex generation complete.');
