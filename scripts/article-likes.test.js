const test = require('node:test');
const assert = require('node:assert/strict');
const { mountArticleLikes } = require('./article-likes');

function ui() {
  const elements = Object.fromEntries(['button', '[data-like-label]', '[data-like-count]', '[role="status"]'].map(key => [key, { textContent: '', attributes: {} }]));
  elements.button.setAttribute = (key, value) => { elements.button.attributes[key] = value; };
  elements.button.addEventListener = (_, callback) => { elements.button.click = callback; };
  return { querySelector: key => elements[key], button: elements.button, label: elements['[data-like-label]'], count: elements['[data-like-count]'], status: elements['[role="status"]'] };
}

test('loads shared count, likes, restores after reload, and cancels', async () => {
  let liked = false;
  const service = { read: async () => ({ liked, count: 12 + Number(liked) }), setLiked: async value => { liked = value; } };
  const page = ui();
  await mountArticleLikes(page, async () => service);
  assert.equal(page.count.textContent, '12');
  await page.button.click();
  assert.equal(page.count.textContent, '13');
  assert.equal(page.button.attributes['aria-pressed'], 'true');
  const reopened = ui();
  await mountArticleLikes(reopened, async () => service);
  assert.equal(reopened.label.textContent, '已点赞');
  await reopened.button.click();
  assert.equal(reopened.count.textContent, '12');
  assert.equal(reopened.button.attributes['aria-pressed'], 'false');
});

test('uncertain write retries the same desired state instead of double counting or cancelling', async () => {
  let liked = false;
  let calls = 0;
  const targets = [];
  const page = ui();
  await mountArticleLikes(page, async () => ({
    read: async () => ({ liked, count: Number(liked) }),
    setLiked: async value => {
      targets.push(value); liked = value;
      if (++calls === 1) throw new Error('response lost after write');
    }
  }));
  await page.button.click();
  assert.equal(page.count.textContent, '0');
  assert.equal(page.label.textContent, '重试');
  await page.button.click();
  assert.deepEqual(targets, [true, true]);
  assert.equal(page.count.textContent, '1');
});

test('initial read failure recovers without changing a vote', async () => {
  let reads = 0;
  let writes = 0;
  const page = ui();
  await mountArticleLikes(page, async () => ({
    read: async () => { if (++reads < 3) throw new Error('offline'); return { liked: true, count: 7 }; },
    setLiked: async () => { writes++; }
  }));
  await page.button.click();
  await page.button.click();
  assert.equal(writes, 0);
  assert.equal(page.label.textContent, '已点赞');
  assert.equal(page.count.textContent, '7');
});

test('rapid clicks send only one write; failed count refresh never invents a total', async () => {
  let finish;
  let writes = 0;
  let reads = 0;
  const page = ui();
  await mountArticleLikes(page, async () => ({
    read: async () => { if (++reads > 1) throw new Error('count unavailable'); return { liked: false, count: 4 }; },
    setLiked: async () => { writes++; await new Promise(resolve => { finish = resolve; }); }
  }));
  const click = page.button.click();
  await page.button.click();
  assert.equal(writes, 1);
  assert.equal(page.button.disabled, true);
  finish();
  await click;
  assert.equal(page.button.disabled, false);
  assert.equal(page.label.textContent, '已点赞');
  assert.equal(page.count.textContent, '—');
  assert.match(page.status.textContent, /点赞数暂时无法更新/);
});
