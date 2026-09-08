# 888 个人博客

这是一个基于 Node.js 的轻量个人博客，包含本地文章管理后台、Markdown 文章、图片上传、静态网页构建和 GitHub Pages 自动部署。

管理后台只在本机运行，直接修改当前代码库中的文章和图片，不依赖 Netlify、Decap CMS 或其他第三方后台服务。

## 目前的架构

```text
本地文章管理后台
    │
    ├── 新建或修改 posts/*.md
    ├── 上传图片到 images/*
    └── Git Commit + Git Push
                 │
                 ▼
        GitHub main 分支
                 │
                 ▼
        GitHub Actions 自动构建
                 │
                 ▼
        dist/ 静态博客文件
                 │
                 ▼
        GitHub Pages 网站
```

博客采用静态网站结构，不需要线上数据库或长期运行的服务器。文章和图片都保存在 Git 仓库中。

## 目录说明

```text
.
├── .github/workflows/deploy.yml  # GitHub Pages 自动构建和部署
├── admin/index.html              # 本地文章管理界面
├── images/                       # 文章首图和正文图片
├── posts/                        # Markdown 文章文件
├── scripts/admin-server.js       # 本地后台服务
├── scripts/build.js              # 静态博客构建脚本
├── package.json                  # npm 命令和依赖
└── dist/                         # 构建结果，不需要手工编辑
```

## 环境要求

- Node.js 20 或更高版本
- npm
- Git
- 本机 Git 已配置 GitHub 登录权限

检查环境：

```powershell
node --version
npm --version
git --version
```

如果 PowerShell 出现 npm 脚本执行策略错误，可以使用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd run admin
```

## 首次安装

进入项目根目录后安装依赖：

```powershell
npm install
```

只需要在首次使用或依赖发生变化时执行。

## 启动本地后台

在项目根目录运行：

```powershell
npm run admin
```

终端出现以下提示后：

```text
本地文章后台：http://127.0.0.1:3000/admin/
```

使用浏览器打开：

```text
http://127.0.0.1:3000/admin/
```

后台只监听 `127.0.0.1`，只能从当前电脑访问。按 `Ctrl+C` 可以停止后台服务。

## 新建文章

1. 启动本地后台。
2. 点击左侧“新建文章”。
3. 填写标题、作者、日期、来源和正文。
4. 根据需要填写摘要和首图路径。
5. 点击“保存草稿”，或者直接点击“保存、Commit 并 Push”。

新文章会保存在 `posts/` 中，文件名格式类似：

```text
2026-08-30-my-article.md
```

文章使用 Markdown 格式，文件开头保存文章信息：

```yaml
---
title: 示例文章
author: 宝哥
date: 2026-08-30T12:00:00.000Z
source: 原创
thumbnail: ./images/example.jpg
summary: 这是文章摘要。
---
```

## 修改已有文章

1. 在后台左侧“已有文章”中点击文章标题。
2. 后台会读取文章信息和正文。
3. 修改需要更新的内容。
4. 点击“保存草稿”保存在本地，或者点击“保存、Commit 并 Push”直接发布。

修改文章时会更新原 Markdown 文件，不会创建重复文章。

## 上传和插入图片

在正文编辑区域中，将光标放到需要插入图片的位置，然后：

1. 点击“上传并插入图片”。
2. 从电脑选择图片。
3. 图片会保存到 `images/`。
4. 后台会在正文光标位置插入 Markdown 图片语法。

示例：

```markdown
![图片说明](./images/example.jpg)
```

支持 JPG、JPEG、PNG、GIF、WebP 和 SVG 图片，单次请求大小上限为 20 MB。后台会将普通静态图片自动缩放到最长边不超过 1600 像素，并转换为压缩 JPG；GIF 和 SVG 会保留原格式。

### 设置文章首图

文章首图路径填写为：

```text
./images/example.jpg
```

首页会显示文章首图、标题、作者、日期和摘要；文章详情页也会显示首图。

如果摘要留空，构建脚本会自动截取正文前 30 个字符作为摘要。

## 保存草稿和正式发布

### 保存草稿

点击“保存草稿”只会修改本地 `posts/` 或 `images/` 文件，不会执行 Git Commit，也不会更新线上网站。

可以查看本地变更：

```powershell
git status
```

### 一键发布

点击“保存、Commit 并 Push”会自动执行：

```text
保存当前文章
→ git add posts images
→ git commit
→ git push
```

推送成功后，GitHub Actions 会自动构建并部署博客。

后台的一键发布只提交 `posts/` 和 `images/` 中的内容变更，不会提交程序代码、配置文件或其他文件。修改程序代码后仍需手动提交：

```powershell
git add .
git commit -m "更新博客功能"
git push
```

## 本地构建博客

运行：

```powershell
npm run build
```

构建结果会生成在 `dist/` 中，包括：

- `dist/index.html`：博客首页
- `dist/<文章文件名>.html`：文章详情页
- `dist/images/`：发布后的图片

可以使用本地静态文件服务器预览：

```powershell
npx serve dist
```

请使用本地 HTTP 服务预览，不建议直接双击 HTML 文件，因为浏览器对本地文件路径有额外限制。

## GitHub Pages 自动部署

当代码或文章推送到 `main` 分支时，`.github/workflows/deploy.yml` 会自动执行：

1. 检出仓库。
2. 安装 Node.js 20。
3. 执行 `npm install`。
4. 执行 `npm run build`。
5. 将 `dist/` 部署到 `gh-pages` 分支。

网站地址：

```text
https://baogezhao.github.io/888/
```

可以在 GitHub 仓库的 **Actions** 页面查看构建状态和错误日志。

## 安卓 App 消息推送

安卓 App 已接入 Firebase Cloud Messaging，并会自动订阅 `all_users` 主题。首次打开新版 App 时，Android 13 及以上系统会询问是否允许通知。

### 配置发送凭据

`google-services.json` 只供 App 接收消息，自动和手动发送还需要 Firebase 服务账号：

1. 打开 Firebase 控制台的“项目设置 → 服务账号”。
2. 点击“生成新的私钥”，下载服务账号 JSON。
3. 打开 GitHub 仓库的“Settings → Secrets and variables → Actions”。
4. 新建 Repository secret，名称填写 `FIREBASE_SERVICE_ACCOUNT`，值粘贴服务账号 JSON 的完整内容。
5. 不要把服务账号 JSON 文件提交到 GitHub。

### 自动推送

发布文章并且网站部署成功后，`Send Article Notification` 工作流会检测本次新增或修改的 Markdown 文章，并把最新一篇自动推送给 `all_users`。只有程序代码变化而没有文章变化时会自动跳过。

### 手动推送

打开 GitHub 仓库的“Actions → Send Article Notification → Run workflow”，填写通知标题、正文和可选的网址即可发送。

也可以在本地文章后台点击左侧的“🔔 手动发送通知”。后台会提交通知请求，网站部署成功后再安全地调用 Firebase；Firebase 服务账号私钥不会保存在本地后台或网页中。

## 从其他页面粘贴图文

在正文编辑区粘贴网页或文档中的图文内容时，后台会自动识别图片，将支持的 JPG、PNG、GIF、WebP 图片复制到项目的 `images/` 目录，并把正文地址替换为本站图片地址。单独复制一张图片后粘贴也受支持。远程图片最大为 15MB，本机和内网图片地址不会被后台下载。

## TXT 转 Excel

本地文章后台左侧提供“📊 TXT 转 Excel”工具。选择不超过 10MB 的 TXT 或 CSV 文件后，可以自动识别 UTF-8/GB18030 中文编码，以及制表符、逗号、竖线、分号或连续空格分列。转换结果为标准 `.xlsx` 文件，可选择是否把第一行设为加粗表头。当表头包含“客队”和“赛果”时，工具会自动将客队调整为第 4 列，并把赛果按 `-` 拆成“主队得分”和“客队得分”两列。“日期”列的 12 月日期自动添加 2025 年，其他月份自动添加 2026 年；已有年份的日期保持不变。“盘路”列中的“赢”“赢半”显示为红色字体，“输”“输半”显示为蓝色字体。转换时还会把“一/球半”“受一/球半”等简写盘口自动规范为完整文字，将第一列全部填充为主题色“Blue, Accent 1, Lighter 60%”，并统一使用 10 号宋体及居中对齐。

后台左侧的“⚽ 抓取14场足彩”会读取中国足彩网当前期次，并在页面中显示“序号、赛事、主队、VS、客队”五列表格。点击“复制表格”后可直接粘贴到 Excel，并自动分成五列。

在 Firebase 控制台的 Messaging 页面创建通知时：

- 目标选择主题 `all_users`，可向所有已安装并允许通知的用户发送。
- 通知标题建议填写文章标题，正文填写一句简短摘要。
- 如需点击通知直达文章，在“自定义数据”中添加键 `url`，值填写完整文章网址，例如 `https://baogezhao.github.io/888/文章文件名.html`。
- App 仅允许通知打开 `https://baogezhao.github.io/888/` 下的网址，其他地址会安全地返回首页。

`google-services.json` 必须位于 `android-app/app/google-services.json`。每次 Firebase 配置变化或 App 推送代码更新后，都需要重新构建并安装新版 APK。

## 测试文章

仓库包含一篇用于检查网站结构的测试文章：

```text
posts/2026-08-30-test-article.md
```

对应首图：

```text
images/test-cover.svg
```

可以用它检查首页卡片、标题、首图、摘要、详情页和正文图片是否正常显示。不再需要时，可以删除文章和图片后提交变更。

## 常见问题

### 后台页面打不开

确认已经运行：

```powershell
npm run admin
```

后台地址是本机地址 `http://127.0.0.1:3000/admin/`，不是 GitHub Pages 上的 `/admin/`。

### 提示找不到 gray-matter 或 marked

运行：

```powershell
npm install
```

### Git Commit 失败

如果提示 `spawn git ENOENT`，表示系统环境变量中找不到 Git。本项目会自动查找 Git for Windows 和 GitHub Desktop 自带的 Git。更新代码后请先按 `Ctrl+C` 停止后台，再重新运行：

```powershell
npm.cmd run admin
```

启动信息中的 `Git：...` 应显示实际的 `git.exe` 路径。

检查 Git 用户信息：

```powershell
git config user.name
git config user.email
```

如未配置，可以设置：

```powershell
git config user.name "你的名字"
git config user.email "你的邮箱"
```

### Git Push 失败

确认仓库设置了远端，并且本机已经登录 GitHub：

```powershell
git remote -v
git status
```

如果远端分支比本地更新，请先处理远端变更。不要在存在未解决 Git 冲突时使用后台一键发布。

### 推送后网站没有更新

前往 GitHub 仓库的 **Actions** 页面检查最新工作流。部署完成后，可以强制刷新浏览器缓存。

## 安全说明

- 本地后台没有登录页面，因为它只监听 `127.0.0.1`。
- 不要将服务监听地址改成 `0.0.0.0` 后暴露到公网。
- 不要把 GitHub Token、密码或其他密钥写入文章、代码或配置文件。
- 发布前建议检查 `git status`，确认提交内容符合预期。
