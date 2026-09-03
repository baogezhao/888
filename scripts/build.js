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
const goatcounterCode = /^[a-z0-9-]+$/.test(siteConfig.analytics?.goatcounterCode || '')
  ? siteConfig.analytics.goatcounterCode
  : '';

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
  const shareImageVersion = post.publishedTimestamp || Date.now();
  const versionedShareImage = `${shareImage}${shareImage.includes('?') ? '&' : '?'}v=${shareImageVersion}`;
  const shareImageType = /\.png(?:\?|$)/i.test(shareImage) ? 'image/png' : /\.webp(?:\?|$)/i.test(shareImage) ? 'image/webp' : 'image/jpeg';
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
  <link rel="canonical" href="${articleUrl}" />
  <meta property="og:title" content="${metaTitle}" />
  <meta name="description" content="${metaDescription}" />
  <meta property="og:description" content="${metaDescription}" />
  <meta property="og:url" content="${articleUrl}" />
  <meta property="og:site_name" content="宝哥彩吧" />
  <link rel="image_src" href="${escapeHtml(versionedShareImage)}" />
  <meta itemprop="image" content="${escapeHtml(versionedShareImage)}" />
  <meta property="og:image" content="${escapeHtml(versionedShareImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(versionedShareImage)}" />
  <meta property="og:image:type" content="${shareImageType}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${metaTitle}" />
  <meta name="twitter:description" content="${metaDescription}" />
  <meta name="twitter:image" content="${escapeHtml(versionedShareImage)}" />
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
    .wechat-share-thumbnail { position: absolute; left: -10000px; top: 0; width: 300px; height: 300px; object-fit: cover; opacity: .01; pointer-events: none; }
  </style>
</head>
<body>
  <img class="wechat-share-thumbnail" src="${escapeHtml(versionedShareImage)}" width="300" height="300" alt="${metaTitle}">
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
          // Sending title/text makes WeChat treat the payload as a plain text
          // message. Share only the URL so WeChat can fetch the Open Graph
          // metadata and render its title + description + thumbnail card.
          await navigator.share({ url: shareUrl });
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
  ${goatcounterCode ? `<script data-goatcounter="https://${goatcounterCode}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` : ''}
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
  <link rel="apple-touch-icon" href="./images/site-logo.png">
  <title>宝哥彩吧 - 欢迎转发</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f7f8fa; }
    .site-header { color: white; background: linear-gradient(135deg, #991b1b, #dc2626 58%, #ef4444); padding: 42px 20px; }
    .header-inner { position: relative; max-width: 960px; margin: 0 auto; display: flex; align-items: center; gap: 20px; }
    .site-logo { width: 92px; height: 92px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,.9); box-shadow: 0 5px 18px rgba(69,10,10,.35); flex: 0 0 auto; }
    .header-copy { min-width: 0; }
    .site-title { margin: 0; font-size: 40px; letter-spacing: 1px; }
    .site-description { margin: 12px 0 0; font-size: 18px; opacity: .86; }
    .guide-button { position: fixed; z-index: 1000; top: 30%; right: 18px; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 78px; padding: 13px 8px; border-radius: 12px; background: #b91c1c; color: #fff; font-size: 14px; font-weight: 700; line-height: 1.35; text-align: center; text-decoration: none; box-shadow: 0 6px 20px rgba(127,29,29,.35); }
    .guide-button:hover { background: #991b1b; transform: translateY(-1px); }
    .guide-button-icon { font-size: 24px; }
    .pull-refresh { position: fixed; z-index: 1200; top: 0; left: 50%; min-width: 130px; padding: 9px 14px; border-radius: 0 0 999px 999px; background: #fff; color: #991b1b; font-size: 14px; font-weight: 700; text-align: center; box-shadow: 0 3px 12px rgba(0,0,0,.14); transform: translate(-50%, -110%); transition: transform .18s ease; pointer-events: none; }
    .pull-refresh.visible { transition: none; }
    .page-content { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
    .announcement { display: flex; align-items: flex-start; gap: 14px; margin: 0 0 24px; padding: 16px 18px; border: 1px solid #fecaca; border-left: 5px solid #dc2626; border-radius: 9px; background: #fff7f7; color: #7f1d1d; box-shadow: 0 2px 8px rgba(127,29,29,.05); }
    .announcement-icon { flex: 0 0 auto; font-size: 22px; line-height: 1.35; }
    .announcement-title { margin: 0 0 4px; font-size: 17px; }
    .announcement-content { margin: 0; color: #57534e; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
    .app-download { display: grid; grid-template-columns: 126px 1fr; gap: 20px; align-items: center; margin: 0 0 24px; padding: 18px; border-radius: 12px; background: #fff; box-shadow: 0 3px 14px rgba(0,0,0,.07); }
    .app-qr { display: block; width: 126px; height: 126px; padding: 6px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
    .app-download h2 { margin: 0 0 6px; color: #991b1b; font-size: 21px; }
    .app-download p { margin: 5px 0; color: #57534e; line-height: 1.55; }
    .app-download-button { display: inline-block; margin-top: 8px; padding: 9px 16px; border-radius: 999px; background: #b91c1c; color: #fff; font-weight: 700; text-decoration: none; }
    .app-download-tip { font-size: 13px; color: #64748b !important; }
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
    @media (max-width: 650px) { .site-header { padding: 28px 16px; } .header-inner { align-items: flex-start; } .guide-button { top: auto; right: 12px; bottom: 18px; width: auto; flex-direction: row; padding: 10px 14px; border-radius: 999px; } .guide-button-icon { font-size: 20px; } .app-download { grid-template-columns: 92px 1fr; gap: 13px; padding: 14px; } .app-qr { width: 92px; height: 92px; } .app-download h2 { font-size: 18px; } .app-download p { font-size: 14px; } .post-item { grid-template-columns: 1fr; } .post-cover { height: 200px; } .site-logo { width: 70px; height: 70px; } .site-title { font-size: 30px; } }
  </style>
</head>
<body>
  <div id="pull-refresh" class="pull-refresh" role="status" aria-live="polite">↓ 下拉刷新</div>
  <header class="site-header">
    <div class="header-inner">
      <img class="site-logo" src="./images/site-logo.jpg" alt="宝哥博客 Logo">
      <div class="header-copy">
        <h1 class="site-title">宝哥彩吧</h1>
        <p class="site-description">知名足彩专家，前腾讯彩票和《足彩310》主编，五要素创始人</p>
      </div>
    </div>
  </header>
  <a class="guide-button" href="./add-to-home-guide.html"><span class="guide-button-icon" aria-hidden="true">📱</span><span>收藏首页指南</span></a>
  <main class="page-content">
    ${announcement.enabled && announcement.content ? `<aside class="announcement" aria-label="${escapeHtml(announcement.title)}">
      <span class="announcement-icon" aria-hidden="true">📢</span>
      <div><h2 class="announcement-title">${escapeHtml(announcement.title)}</h2><p class="announcement-content">${escapeHtml(announcement.content)}</p></div>
    </aside>` : ''}
    <section class="app-download" aria-labelledby="android-app-title">
      <img class="app-qr" src="./images/android-app-download-qr.svg" alt="宝哥彩吧安卓 App 下载二维码">
      <div>
        <h2 id="android-app-title">安卓 App 下载</h2>
        <p>安卓手机扫码下载安装，打开 App 即可直达宝哥彩吧。</p>
        <a class="app-download-button" href="./downloads/baogecaiba.apk" download>直接下载 APK</a>
        <p class="app-download-tip">微信内请先选择“在浏览器打开”；首次安装需允许浏览器安装未知应用。</p>
      </div>
    </section>
    <h1>最新文章</h1>
    <ul class="post-list">
      ${listItemsHtml}
    </ul>
  </main>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
    }
    if ('caches' in window) {
      caches.keys().then(keys => keys.filter(key => key.startsWith('baoge-home-')).forEach(key => caches.delete(key)));
    }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (isStandalone && 'ontouchstart' in window) {
      const refreshIndicator = document.getElementById('pull-refresh');
      let pullStart = 0;
      let pullDistance = 0;
      let trackingPull = false;
      document.addEventListener('touchstart', event => {
        if (window.scrollY === 0 && event.touches.length === 1) {
          pullStart = event.touches[0].clientY;
          pullDistance = 0;
          trackingPull = true;
        }
      }, { passive: true });
      document.addEventListener('touchmove', event => {
        if (!trackingPull) return;
        pullDistance = Math.max(0, Math.min(110, (event.touches[0].clientY - pullStart) * .65));
        if (pullDistance <= 0) return;
        event.preventDefault();
        refreshIndicator.classList.add('visible');
        refreshIndicator.style.transform = 'translate(-50%, ' + (pullDistance - 42) + 'px)';
        refreshIndicator.textContent = pullDistance >= 72 ? '↑ 松开刷新' : '↓ 下拉刷新';
      }, { passive: false });
      document.addEventListener('touchend', () => {
        if (!trackingPull) return;
        trackingPull = false;
        if (pullDistance >= 72) {
          refreshIndicator.textContent = '⟳ 正在刷新…';
          refreshIndicator.style.transform = 'translate(-50%, 0)';
          window.location.reload();
          return;
        }
        refreshIndicator.classList.remove('visible');
        refreshIndicator.style.transform = 'translate(-50%, -110%)';
      }, { passive: true });
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

const guideHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#b91c1c">
  <title>添加到主屏幕指南 - 宝哥彩吧</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f8fa; color: #292524; font-family: Arial, sans-serif; line-height: 1.7; }
    .guide-header { padding: 24px 20px; background: linear-gradient(135deg, #991b1b, #dc2626); color: #fff; }
    .guide-header-inner { max-width: 920px; margin: 0 auto; }
    .back-home { color: #fff; text-decoration: none; opacity: .9; }
    .guide-header h1 { margin: 14px 0 6px; font-size: 32px; }
    .guide-header p { margin: 0; opacity: .9; }
    main { max-width: 920px; margin: 0 auto; padding: 24px 20px 50px; }
    .notice { margin-bottom: 22px; padding: 14px 16px; border-left: 5px solid #dc2626; border-radius: 8px; background: #fff1f2; color: #7f1d1d; }
    .device-nav { position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; padding: 12px 0; background: #f7f8fa; }
    .device-nav a { flex: 1; padding: 11px; border: 1px solid #fecaca; border-radius: 8px; background: #fff; color: #b91c1c; font-weight: 700; text-align: center; text-decoration: none; }
    .device-section { scroll-margin-top: 76px; margin-top: 24px; padding: 24px; border-radius: 12px; background: #fff; box-shadow: 0 3px 14px rgba(0,0,0,.07); }
    .device-section h2 { margin: 0 0 8px; color: #991b1b; }
    .steps { margin: 14px 0 20px; padding-left: 24px; }
    .steps li { margin: 8px 0; }
    .guide-image { display: block; width: min(100%, 700px); height: auto; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; }
    .tip { margin: 16px 0 0; color: #64748b; font-size: 14px; }
    .home-cta { display: block; width: fit-content; margin: 30px auto 0; padding: 11px 20px; border-radius: 999px; background: #b91c1c; color: #fff; font-weight: 700; text-decoration: none; }
    @media (max-width: 600px) { .guide-header h1 { font-size: 26px; } main { padding: 16px 12px 36px; } .device-section { padding: 18px 12px; } }
  </style>
</head>
<body>
  <header class="guide-header"><div class="guide-header-inner">
    <a class="back-home" href="./index.html">← 返回宝哥彩吧首页</a>
    <h1>把宝哥彩吧添加到主屏幕</h1>
    <p>添加成功后，点击手机桌面图标即可直接进入首页。</p>
  </div></header>
  <main>
    <div class="notice"><strong>请注意：</strong>要选择的是“添加到主屏幕”，不需要选择“作为网络应用程序安装”。如果正在微信里打开，请先点右上角“…”并选择“在浏览器打开”。</div>
    <nav class="device-nav" aria-label="选择手机类型"><a href="#iphone">🍎 苹果手机</a><a href="#android">🤖 安卓手机</a></nav>
    <section id="iphone" class="device-section">
      <h2>苹果手机（Safari 浏览器）</h2>
      <ol class="steps"><li>使用 Safari 打开宝哥彩吧首页，点击底部的分享按钮。</li><li>向下找到并点击“添加到主屏幕”。</li><li>确认名称为“宝哥彩吧”，点击右上角“添加”。</li></ol>
      <img class="guide-image" src="./images/add-home-ios-guide-v3.png" alt="苹果手机 Safari 添加宝哥彩吧到主屏幕的三步图示">
      <p class="tip">不同 iOS 版本的按钮位置可能略有区别，但菜单名称都是“添加到主屏幕”。</p>
    </section>
    <section id="android" class="device-section">
      <h2>安卓手机（浏览器）</h2>
      <ol class="steps"><li>打开宝哥彩吧首页，点击浏览器右上角的“⋮”菜单。</li><li>在菜单中选择“添加到主屏幕”。</li><li>确认名称为“宝哥彩吧”，点击“添加”。</li></ol>
      <img class="guide-image" src="./images/add-home-android-guide-v3.png" alt="安卓手机添加宝哥彩吧到主屏幕的三步图示">
      <p class="tip">华为、小米、OPPO、vivo 等浏览器的菜单位置可能稍有不同，请寻找“添加到主屏幕”或“添加至桌面”。</p>
    </section>
    <a class="home-cta" href="./index.html">返回首页</a>
  </main>
</body>
</html>`;
fs.writeFileSync(path.join(outputDir, 'add-to-home-guide.html'), guideHtml);

// Copy uploaded article images into the published site.
const imagesSource = path.join(__dirname, '../images');
const imagesDest = path.join(outputDir, 'images');
if (fs.existsSync(imagesSource)) {
  fs.cpSync(imagesSource, imagesDest, { recursive: true });
}

console.log('静态网站构建完成！');
