const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const matter = require('gray-matter');

const SITE_URL = 'https://baogezhao.github.io/888';
const TOPIC = 'all_users';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsignedToken), serviceAccount.private_key);
  return `${unsignedToken}.${signature.toString('base64url')}`;
}

async function getAccessToken(serviceAccount) {
  const response = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createAssertion(serviceAccount)
    })
  });
  if (!response.ok) throw new Error(`获取 Firebase 访问令牌失败（HTTP ${response.status}）`);
  const result = await response.json();
  return result.access_token;
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#*`~>[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleFromFile(relativePath) {
  const absolutePath = path.resolve(relativePath);
  const postsRoot = path.resolve('posts') + path.sep;
  if (!absolutePath.startsWith(postsRoot) || !absolutePath.endsWith('.md') || !fs.existsSync(absolutePath)) return null;
  const source = fs.readFileSync(absolutePath, 'utf8');
  const { data, content } = matter(source);
  const slug = path.basename(relativePath, '.md');
  const body = cleanText(data.summary || content).slice(0, 100) || '宝哥彩吧有新的文章更新，点击查看。';
  const timestamp = data.date && !Number.isNaN(new Date(data.date).getTime()) ? new Date(data.date).getTime() : 0;
  return {
    title: cleanText(data.title) || '宝哥彩吧文章更新',
    body,
    url: `${SITE_URL}/${encodeURIComponent(slug)}.html`,
    timestamp
  };
}

function automaticMessage() {
  const before = argument('before');
  const after = argument('after') || 'HEAD';
  let changedFiles = [];
  try {
    const isInitialPush = !before || /^0+$/.test(before);
    const args = isInitialPush
      ? ['-c', 'core.quotepath=false', 'show', '--pretty=', '--name-only', '--diff-filter=AM', after, '--', 'posts/*.md', 'notifications/manual.json']
      : ['-c', 'core.quotepath=false', 'diff', '--name-only', '--diff-filter=AM', before, after, '--', 'posts/*.md', 'notifications/manual.json'];
    changedFiles = execFileSync('git', args, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    throw new Error('无法检测本次更新的文章文件');
  }
  if (changedFiles.includes('notifications/manual.json')) {
    const request = JSON.parse(fs.readFileSync(path.resolve('notifications/manual.json'), 'utf8'));
    return validatedManualMessage(request.title, request.body, request.url);
  }
  const articles = changedFiles.map(articleFromFile).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp);
  return articles[0] || null;
}

function validatedManualMessage(rawTitle, rawBody, rawUrl) {
  const title = cleanText(rawTitle);
  const body = cleanText(rawBody);
  const url = String(rawUrl || '').trim() || `${SITE_URL}/`;
  if (!title || !body) throw new Error('手动推送必须填写标题和正文');
  const parsedUrl = new URL(url);
  if (parsedUrl.origin + parsedUrl.pathname.substring(0, 5) !== `${SITE_URL}/`) {
    throw new Error('推送链接必须是宝哥彩吧网站地址');
  }
  return { title: title.slice(0, 100), body: body.slice(0, 200), url };
}

function manualMessage() {
  return validatedManualMessage(argument('title'), argument('body'), argument('url'));
}

async function send(message) {
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawCredentials) throw new Error('缺少 GitHub Secret：FIREBASE_SERVICE_ACCOUNT');
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawCredentials);
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 不是有效的 JSON');
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 缺少必要字段');
  }

  const accessToken = await getAccessToken(serviceAccount);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        topic: TOPIC,
        notification: { title: message.title, body: message.body },
        data: { url: message.url }
      }
    })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Firebase 推送失败（HTTP ${response.status}）：${details.slice(0, 500)}`);
  }
  console.log(`推送成功：${message.title}`);
}

async function main() {
  const mode = argument('mode') || 'automatic';
  const message = mode === 'manual' ? manualMessage() : automaticMessage();
  if (!message) {
    console.log('本次提交没有新增或更新文章，跳过推送。');
    return;
  }
  await send(message);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
