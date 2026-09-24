const test = require('node:test');
const assert = require('node:assert/strict');
const { waitForPage } = require('./wait-for-page');

test('waits through 404 and network errors until the exact notification URL is available', async () => {
  const url = 'https://baogezhao.github.io/888/%E6%B5%8B%E8%AF%95.html';
  let requests = 0;
  const delays = [];
  await waitForPage(url, {
    fetchPage: async (requestedUrl, options) => {
      assert.equal(requestedUrl, url);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.method, 'HEAD');
      requests++;
      if (requests === 2) throw new Error('network failure');
      return { status: requests === 3 ? 200 : 404 };
    },
    pause: async ms => delays.push(ms),
    log: () => {}
  });
  assert.equal(requests, 3);
  assert.deepEqual(delays, [15000, 15000]);
});

test('fails closed for missing pages, redirects and server errors', async () => {
  for (const status of [404, 302, 503]) {
    let requests = 0;
    let pauses = 0;
    await assert.rejects(waitForPage('https://baogezhao.github.io/888/missing.html', {
      attempts: 3,
      fetchPage: async () => { requests++; return { status }; },
      pause: async () => { pauses++; },
      log: () => {}
    }), /推送已取消/);
    assert.equal(requests, 3);
    assert.equal(pauses, 2);
  }
});
