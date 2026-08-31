const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const postsDir = path.join(__dirname, '../posts');
const outputDir = path.join(__dirname, '../dist');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
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
    thumbnail: data.thumbnail || '',
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
  </style>
</head>
<body>
  <h1>${post.title}</h1>
  <div class="meta">
    <span>作者：${post.author}</span> | 
    <span>发布时间：${post.date}</span> | 
    <span class="source-tag">来源：${post.source}</span>
  </div>
  <div class="content">${post.htmlContent}</div>
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, `${post.slug}.html`), detailHtml);
});

// 3. 提取前20条文章生成首页列表
const recentPosts = posts.slice(0, 20);
const listItemsHtml = recentPosts.map(p => `
  <li class="post-item">
    <a href="./${p.slug}.html" target="_blank" class="post-title">${p.title}</a>
    <span class="post-date">${p.date}</span>
  </li>
`).join('');

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>个人主页 - 最新文章</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { border-bottom: 2px solid #1a73e8; padding-bottom: 10px; color: #333; }
    .post-list { list-style: none; padding: 0; }
    .post-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
    .post-title { font-size: 16px; color: #1a73e8; text-decoration: none; }
    .post-title:hover { text-decoration: underline; }
    .post-date { color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <h1>最新文章</h1>
  <ul class="post-list">
    ${listItemsHtml}
  </ul>
</body>
</html>`;

fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

// 拷贝后台管理界面到构建输出目录
const adminSource = path.join(__dirname, '../admin');
const adminDest = path.join(outputDir, 'admin');
if (fs.existsSync(adminSource)) {
  fs.cpSync(adminSource, adminDest, { recursive: true });
}

console.log('静态网站构建完成！');