const { setTimeout: sleep } = require('node:timers/promises');

// Updating gh-pages finishes before GitHub Pages necessarily serves the page.
async function waitForPage(url, {
  fetchPage = fetch,
  pause = sleep,
  attempts = 40,
  intervalMs = 15000,
  log = console.log
} = {}) {
  let lastError = '尚未检查';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchPage(url, {
        method: 'HEAD',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      if (response.status === 200) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    log(`等待推送页面上线（${attempt}/${attempts}）：${lastError}`);
    if (attempt < attempts) await pause(intervalMs);
  }
  throw new Error(`推送已取消：页面尚不可访问（${lastError}）：${url}`);
}

module.exports = { waitForPage };
