// ─── RENDER POSTS GRID ────────────────────────────────────────────────────────

function renderPosts(posts, containerId, basePath = "") {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  if (posts.length === 0) {
    grid.innerHTML = `<p style="color:var(--muted); padding: 2rem 0;">No posts yet. Check back soon.</p>`;
    return;
  }

  grid.innerHTML = posts.map((post, i) => `
    <a href="${basePath}${post.file}" class="post-card" style="animation-delay:${i * 0.1}s">
      <div class="post-meta">${post.category} · ${post.date}</div>
      <div class="post-title">${post.title}</div>
      <div class="post-excerpt">${post.excerpt}</div>
    </a>
  `).join("");
}

// Homepage — show all posts
if (document.getElementById("posts-grid")) {
  renderPosts(ALL_POSTS, "posts-grid", "");
}

// Category pages — filter by category
if (document.getElementById("cat-posts-grid")) {
  const category = document.body.dataset.category;
  const filtered = ALL_POSTS.filter(p => p.category === category);
  renderPosts(filtered, "cat-posts-grid", "../");
}
