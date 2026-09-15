// Shared by the generated article pages and the interaction tests.
async function mountArticleLikes(root, connect) {
  const button = root.querySelector('button');
  const label = root.querySelector('[data-like-label]');
  const count = root.querySelector('[data-like-count]');
  const status = root.querySelector('[role="status"]');
  let service;
  let liked = false;
  let busy = false;
  let pendingTarget = null;
  async function withTimeout(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('点赞服务连接超时')), 15000);
      })]);
    } finally { clearTimeout(timer); }
  }

  function render() {
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(liked));
    label.textContent = busy ? '请稍候…' : pendingTarget !== null ? '重试' : liked ? '已点赞' : '点赞';
  }

  async function refresh() {
    const state = await withTimeout(service.read());
    liked = state.liked;
    count.textContent = String(state.count);
  }

  async function act(initial = false) {
    if (busy) return;
    busy = true;
    status.textContent = '';
    render();
    try {
      if (!service) {
        service = await withTimeout(connect());
        await refresh();
      } else if (initial) {
        await refresh();
      } else {
        // Retry an uncertain write with the same desired state, never a second toggle.
        pendingTarget = pendingTarget === null ? !liked : pendingTarget;
        await withTimeout(service.setLiked(pendingTarget));
        liked = pendingTarget;
        pendingTarget = null;
        status.textContent = liked ? '感谢支持！' : '已取消点赞';
        try { await refresh(); }
        catch { count.textContent = '—'; status.textContent += '，点赞数暂时无法更新，请刷新页面。'; }
      }
    } catch (error) {
      if (pendingTarget === null) service = null;
      status.textContent = pendingTarget !== null
        ? '暂时无法确认结果，请点击重试。'
        : '点赞暂时不可用，请稍后点击重试。';
      label.textContent = '重试';
    } finally {
      busy = false;
      render();
      if (!service) label.textContent = '重试';
    }
  }

  button.addEventListener('click', () => act());
  await act(true);
}

if (typeof module !== 'undefined') module.exports = { mountArticleLikes };
if (typeof document !== 'undefined') {
  const root = document.getElementById('article-likes');
  if (root) {
    const config = JSON.parse(document.getElementById('article-likes-config').textContent);
    if (!config.firebase.apiKey || !config.firebase.projectId) {
      root.querySelector('[data-like-label]').textContent = '点赞暂未开放';
    } else {
      mountArticleLikes(root, async () => {
        const { connectLikes } = await import('./firebase-likes.js');
        return connectLikes(config.firebase, config.articleId);
      });
    }
  }
}
