const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual injected script; this does not replace Android device tests.
const java = fs.readFileSync(path.join(__dirname, '../android-app/app/src/main/java/com/baogecaiba/app/MainActivity.java'), 'utf8');
const expression = java.match(/view.evaluateJavascript\(([\s\S]*?), null\)/)[1];
const script = [...expression.matchAll(/"((?:\\.|[^"\\])*)"/g)]
  .map(match => JSON.parse('"' + match[1] + '"')).join('');

test('native share captures real clicks once and leaves copy button alone', () => {
  const buttons = {};
  for (const id of ['share-wechat', 'share-system', 'copy-link']) {
    buttons[id] = { dataset: {}, listeners: [], addEventListener(type, callback, capture) {
      this.listeners.push({ type, callback, capture });
    } };
  }
  const context = { document: { getElementById: id => buttons[id] }, window: { location: {} } };
  vm.runInNewContext(script, context);
  vm.runInNewContext(script, context);
  for (const id of ['share-wechat', 'share-system']) {
    assert.equal(buttons[id].listeners.length, 1);
    const listener = buttons[id].listeners[0];
    assert.equal(listener.capture, true);
    let stopped = false;
    listener.callback({ isTrusted: true, preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(context.window.location.href, 'baoge-share://article');
  }
  assert.equal(buttons['copy-link'].listeners.length, 0);
});

test('ignores synthetic clicks and tolerates pages without share buttons', () => {
  let callback;
  const button = { dataset: {}, addEventListener(type, listener) { callback = listener; } };
  const context = { document: { getElementById: id => id === 'share-wechat' ? button : null }, window: { location: {} } };
  vm.runInNewContext(script, context);
  callback({ isTrusted: false });
  assert.equal(context.window.location.href, undefined);
  vm.runInNewContext(script, { document: { getElementById: () => null } });
});
