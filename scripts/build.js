const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const postsDir = path.join(__dirname, '../posts');
const outputDir = path.join(__dirname, '../dist');

// Git does not track empty directories, so `posts` may not exist in a fresh
// checkout before the first article is published.
if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function findFirstImage(content) {
  const markdownImage = content.match(/!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/);
  if (markdownImage) return markdownImage[1];

  const htmlImage = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return htmlImage ? htmlImage[1] : '';
}

// 1. 读取并解析所有文章
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
const posts = files.map(filename => {
  const filePath = path.join(postsDir, filename);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContent);

  // 纯文本处理（用于提取无标签纯文字）
  const plainText = content.replace(/<[^>]+>/g, '').replace(/[#*`~!\[\]\(\)]/g, '').trim();

  // 核心摘要逻辑：留空则自动抓取前100字
  let summary = data.summary && data.summary.trim() !== '' 
    ? data.summary 
    : plainText.slice(0, 100) + (plainText.length > 100 ? '...' : '');

  const htmlContent = marked.parse(content);
  const slug = filename.replace('.md', '');

  return {
    slug,
    title: data.title || '无标题',
    author: data.author || '匿名',
    date: data.date ? new Date(data.date).toISOString().split('T')[0] : '',
    source: data.source || '本站',
    // Prefer an explicitly selected cover, otherwise use the first body image.
    thumbnail: data.thumbnail || findFirstImage(content),
    detailCover: data.thumbnail || '',
    summary,
    htmlContent
  };
});

// 按发布时间降序排列
posts.sort((a, b) => new Date(b.date) - new Date(a.date));

// 2. 生成文章详情页
posts.forEach(post => {
  const detailHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title}</title>
  <!-- 微信分享 / Open Graph 元标签 -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${post.title}" />
  <meta property="og:description" content="来源：${post.source} | ${post.summary}" />
  <meta property="og:image" content="${post.thumbnail}" />
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    .meta { color: #666; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
    .source-tag { background: #e8f0fe; color: #1a73e8; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    img { max-width: 100%; height: auto; }
    .share-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 28px 0; padding-top: 18px; border-top: 1px solid #eee; }
    .share-bar a, .share-bar button { border: 0; border-radius: 5px; padding: 8px 12px; background: #f1f5f9; color: #334155; text-decoration: none; cursor: pointer; font-size: 14px; }
    .share-bar a:hover, .share-bar button:hover { background: #dbeafe; color: #1d4ed8; }
  </style>
</head>
<body>
  <h1>${post.title}</h1>
  <div class="meta">
    <span>作者：${post.author}</span> | 
    <span>发布时间：${post.date}</span> | 
    <span class="source-tag">来源：${post.source}</span>
  </div>
  ${post.detailCover ? `<img class="cover" src="${post.detailCover}" alt="${post.title}">` : ''}
  <div class="content">${post.htmlContent}</div>
  <div class="share-bar">
    <strong>分享文章：</strong>
    <button id="share-wechat-friend">微信好友</button>
    <button id="share-wechat-moments">微信朋友圈</button>
    <a id="share-weibo" target="_blank" rel="noopener">微博</a>
    <button id="copy-link">一键复制链接</button>
  </div>
  <script>
    const shareUrl = window.location.href;
    const shareTitle = document.title;
    document.getElementById('share-weibo').href = 'https://service.weibo.com/share/share.php?url=' + encodeURIComponent(shareUrl) + '&title=' + encodeURIComponent(shareTitle);
    async function shareToWechat(target) {
      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
          return;
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      alert('链接已复制，请打开微信并分享到' + target + '。');
    }
    document.getElementById('share-wechat-friend').onclick = () => shareToWechat('好友');
    document.getElementById('share-wechat-moments').onclick = () => shareToWechat('朋友圈');
    document.getElementById('copy-link').onclick = async event => {
      await navigator.clipboard.writeText(shareUrl);
      event.currentTarget.textContent = '链接已复制';
    };
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
  <title>个人主页 - 最新文章</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f7f8fa; }
    .site-header { color: white; background: linear-gradient(135deg, #1d4ed8, #6d28d9); padding: 54px 20px; }
    .header-inner { max-width: 960px; margin: 0 auto; }
    .site-title { margin: 0; font-size: 40px; letter-spacing: 1px; }
    .site-description { margin: 12px 0 0; font-size: 18px; opacity: .86; }
    .page-content { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
    h1 { border-bottom: 2px solid #1a73e8; padding-bottom: 10px; color: #333; }
    .post-list { list-style: none; padding: 0; }
    .post-item { display: grid; grid-template-columns: 240px 1fr; gap: 22px; padding: 20px; margin: 18px 0; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
    .post-cover { display: block; width: 100%; height: 150px; object-fit: cover; border-radius: 7px; background: #e5e7eb; }
    .placeholder { display: grid; place-items: center; color: #94a3b8; }
    .post-title { font-size: 22px; font-weight: 700; color: #1a73e8; text-decoration: none; }
    .post-title:hover { text-decoration: underline; }
    .post-date { color: #888; font-size: 14px; margin-top: 7px; }
    .post-summary { color: #475569; line-height: 1.6; margin: 12px 0; }
    .read-more { color: #1a73e8; text-decoration: none; }
    @media (max-width: 650px) { .post-item { grid-template-columns: 1fr; } .post-cover { height: 200px; } }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <h1 class="site-title">宝哥的个人博客</h1>
      <p class="site-description">记录思考、生活与值得分享的内容</p>
    </div>
  </header>
  <main class="page-content">
    <h1>最新文章</h1>
    <ul class="post-list">
      ${listItemsHtml}
    </ul>
  </main>
</body>
</html>`;

fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

// Copy uploaded article images into the published site.
const imagesSource = path.join(__dirname, '../images');
const imagesDest = path.join(outputDir, 'images');
if (fs.existsSync(imagesSource)) {
  fs.cpSync(imagesSource, imagesDest, { recursive: true });
}

console.log('静态网站构建完成！');
