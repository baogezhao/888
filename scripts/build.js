const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const postsDir = path.join(__dirname, '../posts');
const outputDir = path.join(__dirname, '../dist');
const siteConfigFile = path.join(__dirname, '../site-config.json');
const siteUrl = (process.env.SITE_URL || 'https://baogezhao.github.io/888').replace(/\/$/, '');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteSiteUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, `${siteUrl}/`).href;
  } catch (error) {
    return '';
  }
}

// Git does not track empty directories, so `posts` may not exist in a fresh
// checkout before the first article is published.
if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

// dist is generated output. Recreate it on every build so deleted articles do
// not leave stale HTML pages behind.
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

let siteConfig = {};
if (fs.existsSync(siteConfigFile)) {
  try {
    siteConfig = JSON.parse(fs.readFileSync(siteConfigFile, 'utf8'));
  } catch (error) {
    throw new Error(`site-config.json 格式无效：${error.message}`);
  }
}
const announcement = {
  enabled: siteConfig.announcement?.enabled !== false,
  title: String(siteConfig.announcement?.title || '网站公告').trim(),
  content: String(siteConfig.announcement?.content || '').trim()
};

function findFirstImage(content) {
  const markdownImage = content.match(/!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/);
  if (markdownImage) return markdownImage[1];

  const htmlImage = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return htmlImage ? htmlImage[1] : '';
}

function formatPublishTime(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replace(/\//g, '-');
}

// 1. 读取并解析所有文章
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
const posts = files.map(filename => {
  const filePath = path.join(postsDir, filename);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContent);

  // 纯文本处理（用于提取无标签纯文字）
  const plainText = content.replace(/<[^>]+>/g, '').replace(/[#*`~!\[\]\(\)]/g, '').trim();

  // 摘要留空时，自动抓取正文前 30 个字。
  let summary = data.summary && data.summary.trim() !== '' 
    ? data.summary 
    : plainText.slice(0, 30) + (plainText.length > 30 ? '...' : '');

  const htmlContent = marked.parse(content).replace(/<img(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
  const slug = filename.replace('.md', '');
  const publishedAt = data.date ? new Date(data.date) : null;
  const publishedTimestamp = publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.getTime() : 0;

  return {
    slug,
    title: data.title || '无标题',
    author: !data.author || data.author === 'baoge' ? '宝哥' : data.author,
    date: publishedTimestamp ? formatPublishTime(publishedAt) : '',
    publishedTimestamp,
    source: data.source || '本站',
    // Prefer an explicitly selected cover, otherwise use the first body image.
    thumbnail: data.thumbnail || findFirstImage(content),
    detailCover: data.thumbnail || '',
    summary,
    htmlContent
  };
});

// 按完整发布时间倒序排列，同一天发布的文章也会按具体时间排序。
posts.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);

// 2. 生成文章详情页
posts.forEach(post => {
  const articleUrl = `${siteUrl}/${encodeURIComponent(post.slug)}.html`;
  const shareImage = absoluteSiteUrl(post.thumbnail) || `${siteUrl}/images/site-logo.png`;
  const metaTitle = escapeHtml(post.title);
  const metaDescription = escapeHtml(`作者：${post.author} | ${post.summary}`);
  const detailHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metaTitle}</title>
  <!-- 微信分享 / Open Graph 元标签 -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${metaTitle}" />
  <meta name="description" content="${metaDescription}" />
  <meta property="og:description" content="${metaDescription}" />
  <meta property="og:url" content="${articleUrl}" />
  <meta property="og:site_name" content="宝哥彩吧" />
  <meta property="og:image" content="${escapeHtml(shareImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(shareImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${metaTitle}" />
  <meta name="twitter:description" content="${metaDescription}" />
  <meta name="twitter:image" content="${escapeHtml(shareImage)}" />
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #292524; }
    .article-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 3px solid #b91c1c; }
    .brand { display: flex; align-items: center; gap: 10px; color: #991b1b; font-size: 20px; font-weight: 700; text-decoration: none; }
    .brand-logo { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 3px solid #dc2626; }
    .home-link { display: inline-block; padding: 8px 12px; border-radius: 6px; background: #fef2f2; color: #b91c1c; text-decoration: none; }
    .home-link:hover { background: #fee2e2; }
    .meta { color: #666; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
    .source-tag { background: #fef2f2; color: #b91c1c; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    img { max-width: 100%; height: auto; }
    .share-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 12px 0 18px; padding: 12px 14px; border-radius: 8px; background: #fff7f7; }
    .share-bar a, .share-bar button { border: 0; border-radius: 5px; padding: 8px 12px; background: #f1f5f9; color: #334155; text-decoration: none; cursor: pointer; font-size: 14px; }
    .share-bar a:hover, .share-bar button:hover { background: #fee2e2; color: #b91c1c; }
    .wechat-guide { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.78); color: white; padding: 28px; text-align: right; }
    .wechat-guide.show { display: block; }
    .wechat-guide .arrow { font-size: 48px; line-height: 1; }
    .wechat-guide p { max-width: 320px; margin: 16px 0 0 auto; font-size: 18px; line-height: 1.7; }
  </style>
</head>
<body>
  <header class="article-header">
    <a class="brand" href="./index.html"><img class="brand-logo" src="./images/site-logo.jpg" alt="宝哥博客 Logo"><span>宝哥彩吧</span></a>
    <a class="home-link" href="./index.html">← 返回主页</a>
  </header>
  <h1>${post.title}</h1>
  <div class="share-bar">
    <strong>分享文章：</strong>
    <button id="share-wechat">微信分享</button>
    <a id="share-weibo" target="_blank" rel="noopener">微博</a>
    <button id="copy-link">一键复制链接</button>
  </div>
  <div class="meta">
    <span>作者：${post.author}</span> | 
    <span>发布时间：${post.date}</span> | 
    <span class="source-tag">来源：${post.source}</span>
  </div>
  ${post.detailCover ? `<img class="cover" src="${post.detailCover}" alt="${post.title}">` : ''}
  <div class="content">${post.htmlContent}</div>
  <div id="wechat-guide" class="wechat-guide">
    <div class="arrow">↗</div>
    <p id="wechat-guide-text"></p>
    <small>点击任意位置关闭提示</small>
  </div>
  <script>
    const shareUrl = window.location.href;
    const shareTitle = document.title;
    document.getElementById('share-weibo').href = 'https://service.weibo.com/share/share.php?url=' + encodeURIComponent(shareUrl) + '&title=' + encodeURIComponent(shareTitle);
    const isWechat = /MicroMessenger/i.test(navigator.userAgent);
    function showWechatGuide(target) {
      document.getElementById('wechat-guide-text').textContent = '请点击右上角“…”菜单，然后选择“发送给朋友”或“分享到朋友圈”。当前目标：' + target;
      document.getElementById('wechat-guide').classList.add('show');
    }
    async function copyShareUrl() {
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(shareUrl); return true; } catch (error) {}
      }
      const input = document.createElement('textarea');
      input.value = shareUrl;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(input);
      return copied;
    }
    async function shareToWechat(target) {
      if (isWechat) return showWechatGuide(target);
      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
          return;
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
      const copied = await copyShareUrl();
      alert(copied ? '链接已复制，请打开微信并分享到' + target + '。' : '请长按浏览器地址栏复制链接，再打开微信分享。');
    }
    document.getElementById('share-wechat').onclick = () => shareToWechat('好友或朋友圈');
    document.getElementById('wechat-guide').onclick = event => event.currentTarget.classList.remove('show');
    document.getElementById('copy-link').onclick = async event => {
      const copied = await copyShareUrl();
      event.currentTarget.textContent = copied ? '链接已复制' : '复制失败，请长按地址栏';
    };
    document.querySelectorAll('img').forEach(image => {
      const originalUrl = image.currentSrc || image.src;
      let retries = 0;
      image.addEventListener('error', () => {
        if (retries >= 2) return;
        retries += 1;
        setTimeout(() => { image.src = originalUrl + (originalUrl.includes('?') ? '&' : '?') + 'retry=' + retries; }, retries * 1000);
      });
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, `${post.slug}.html`), detailHtml);
});

// 3. 提取前20条文章生成首页列表
const recentPosts = posts.slice(0, 20);
const listItemsHtml = recentPosts.map(p => `
  <li class="post-item">
    <a href="./${p.slug}.html" target="_blank" rel="noopener" class="post-cover-link">
      ${p.thumbnail ? `<img class="post-cover" src="${p.thumbnail}" alt="${p.title}">` : '<div class="post-cover placeholder">暂无图片</div>'}
    </a>
    <div class="post-info">
      <a href="./${p.slug}.html" target="_blank" rel="noopener" class="post-title">${p.title}</a>
      <div class="post-date">${p.date} · ${p.author}</div>
      <p class="post-summary">${p.summary}</p>
      <a href="./${p.slug}.html" target="_blank" rel="noopener" class="read-more">阅读全文 →</a>
    </div>
  </li>
`).join('');

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#b91c1c">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="宝哥彩吧">
  <link rel="manifest" href="./manifest.webmanifest">
  <link rel="apple-touch-icon" href="./images/site-logo.png">
  <title>宝哥彩吧 - 欢迎转发</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f7f8fa; }
    .site-header { color: white; background: linear-gradient(135deg, #991b1b, #dc2626 58%, #ef4444); padding: 42px 20px; }
    .header-inner { position: relative; max-width: 960px; margin: 0 auto; display: flex; align-items: center; gap: 20px; padding-right: 168px; }
    .site-logo { width: 92px; height: 92px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,.9); box-shadow: 0 5px 18px rgba(69,10,10,.35); flex: 0 0 auto; }
    .header-copy { min-width: 0; }
    .site-title { margin: 0; font-size: 40px; letter-spacing: 1px; }
    .site-description { margin: 12px 0 0; font-size: 18px; opacity: .86; }
    .install-button { position: absolute; top: 4px; right: 0; display: inline-flex; align-items: center; gap: 7px; border: 1px solid rgba(255,255,255,.72); border-radius: 999px; padding: 10px 16px; background: rgba(255,255,255,.16); color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(69,10,10,.18); backdrop-filter: blur(5px); }
    .install-button:hover { background: rgba(255,255,255,.27); }
    .install-button[hidden] { display: none; }
    .install-dialog { width: min(420px, calc(100% - 36px)); border: 0; border-radius: 14px; padding: 0; color: #292524; box-shadow: 0 18px 60px rgba(0,0,0,.3); }
    .install-dialog::backdrop { background: rgba(0,0,0,.55); }
    .install-dialog-content { padding: 24px; }
    .install-dialog h2 { margin: 0 0 12px; color: #991b1b; }
    .install-dialog p { margin: 0; line-height: 1.7; color: #475569; }
    .dialog-close { float: right; border: 0; background: transparent; color: #64748b; font-size: 26px; line-height: 1; cursor: pointer; }
    .page-content { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
    .announcement { display: flex; align-items: flex-start; gap: 14px; margin: 0 0 24px; padding: 16px 18px; border: 1px solid #fecaca; border-left: 5px solid #dc2626; border-radius: 9px; background: #fff7f7; color: #7f1d1d; box-shadow: 0 2px 8px rgba(127,29,29,.05); }
    .announcement-icon { flex: 0 0 auto; font-size: 22px; line-height: 1.35; }
    .announcement-title { margin: 0 0 4px; font-size: 17px; }
    .announcement-content { margin: 0; color: #57534e; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
    h1 { border-bottom: 2px solid #dc2626; padding-bottom: 10px; color: #333; }
    .post-list { list-style: none; padding: 0; }
    .post-item { display: grid; grid-template-columns: 240px 1fr; gap: 22px; padding: 20px; margin: 18px 0; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
    .post-cover { display: block; width: 100%; height: 150px; object-fit: cover; border-radius: 7px; background: #e5e7eb; }
    .placeholder { display: grid; place-items: center; color: #94a3b8; }
    .post-title { font-size: 22px; font-weight: 700; color: #b91c1c; text-decoration: none; }
    .post-title:hover { text-decoration: underline; }
    .post-date { color: #888; font-size: 14px; margin-top: 7px; }
    .post-summary { color: #475569; line-height: 1.6; margin: 12px 0; }
    .read-more { color: #b91c1c; text-decoration: none; font-weight: 600; }
    @media (max-width: 650px) { .site-header { padding: 28px 16px; } .header-inner { align-items: flex-start; padding-right: 0; padding-top: 52px; } .install-button { top: 0; left: 0; right: auto; padding: 8px 13px; } .post-item { grid-template-columns: 1fr; } .post-cover { height: 200px; } .site-logo { width: 70px; height: 70px; } .site-title { font-size: 30px; } }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <button id="install-app" class="install-button" type="button" aria-haspopup="dialog"><span aria-hidden="true">⌂</span> 添加到桌面</button>
      <img class="site-logo" src="./images/site-logo.jpg" alt="宝哥博客 Logo">
      <div class="header-copy">
        <h1 class="site-title">宝哥彩吧</h1>
        <p class="site-description">知名足彩专家，前腾讯彩票和《足彩310》主编，五要素创始人</p>
      </div>
    </div>
  </header>
  <main class="page-content">
    ${announcement.enabled && announcement.content ? `<aside class="announcement" aria-label="${escapeHtml(announcement.title)}">
      <span class="announcement-icon" aria-hidden="true">📢</span>
      <div><h2 class="announcement-title">${escapeHtml(announcement.title)}</h2><p class="announcement-content">${escapeHtml(announcement.content)}</p></div>
    </aside>` : ''}
    <h1>最新文章</h1>
    <ul class="post-list">
      ${listItemsHtml}
    </ul>
  </main>
  <dialog id="install-dialog" class="install-dialog">
    <div class="install-dialog-content">
      <button id="close-install-dialog" class="dialog-close" type="button" aria-label="关闭">×</button>
      <h2>添加到桌面</h2>
      <p id="install-help"></p>
    </div>
  </dialog>
  <script>
    let deferredInstallPrompt = null;
    const installButton = document.getElementById('install-app');
    const installDialog = document.getElementById('install-dialog');
    const installHelp = document.getElementById('install-help');
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isWechatBrowser = /MicroMessenger/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    if (isStandalone) installButton.hidden = true;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });
    installButton.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        return;
      }
      installHelp.textContent = isWechatBrowser
        ? '请先点击右上角“…”并选择“在浏览器打开”，然后再点击“添加到桌面”。'
        : isIos
          ? '请点击浏览器底部的“分享”按钮，再选择“添加到主屏幕”。'
          : '请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。';
      if (typeof installDialog.showModal === 'function') installDialog.showModal();
      else alert(installHelp.textContent);
    });
    document.getElementById('close-install-dialog').addEventListener('click', () => installDialog.close());
    installDialog.addEventListener('click', event => {
      if (event.target === installDialog) installDialog.close();
    });
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
    }

    document.querySelectorAll('img').forEach(image => {
      if (image.classList.contains('post-cover')) { image.loading = 'lazy'; image.decoding = 'async'; }
      const originalUrl = image.currentSrc || image.src; let retries = 0;
      image.addEventListener('error', () => {
        if (retries >= 2) return;
        retries += 1;
        setTimeout(() => { image.src = originalUrl + (originalUrl.includes('?') ? '&' : '?') + 'retry=' + retries; }, retries * 1000);
      });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

const manifest = {
  name: '宝哥彩吧',
  short_name: '宝哥彩吧',
  description: '宝哥彩吧首页',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  background_color: '#f7f8fa',
  theme_color: '#b91c1c',
  icons: [{ src: './images/site-logo.png', sizes: '1254x1254', type: 'image/png', purpose: 'any' }]
};
fs.writeFileSync(path.join(outputDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const serviceWorker = `const CACHE_NAME = 'baoge-home-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './images/site-logo.png', './images/site-logo.jpg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html'))));
});`;
fs.writeFileSync(path.join(outputDir, 'service-worker.js'), serviceWorker);

// Copy uploaded article images into the published site.
const imagesSource = path.join(__dirname, '../images');
const imagesDest = path.join(outputDir, 'images');
if (fs.existsSync(imagesSource)) {
  fs.cpSync(imagesSource, imagesDest, { recursive: true });
}

console.log('静态网站构建完成！');
