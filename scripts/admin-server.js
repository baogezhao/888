const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const dns = require('dns').promises;
const net = require('net');
const matter = require('gray-matter');
const { marked } = require('marked');
const ExcelJS = require('exceljs');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'posts');
const imagesDir = path.join(root, 'images');
const notificationsDir = path.join(root, 'notifications');
const adminFile = path.join(root, 'admin', 'index.html');
const siteConfigFile = path.join(root, 'site-config.json');
const port = Number(process.env.ADMIN_PORT || 3000);
fs.mkdirSync(postsDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(notificationsDir, { recursive: true });

function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
function safeName(value, fallback) { const cleaned=String(value||'').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,''); return cleaned||fallback; }
function readBody(req) { return new Promise((resolve,reject)=>{ let body=''; req.on('data',chunk=>{body+=chunk;if(body.length>20*1024*1024)req.destroy(new Error('请求内容超过 20MB'))}); req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch{reject(new Error('请求格式无效'))}});req.on('error',reject); }); }

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc')
      || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized);
  }
  return true;
}

async function assertPublicImageUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 http 或 https 图片地址');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('不允许访问本机或内网图片地址');
  return url;
}

async function downloadRemoteImage(value) {
  let currentUrl = String(value || '');
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const safeUrl = await assertPublicImageUrl(currentUrl);
    const response = await fetch(safeUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      currentUrl = new URL(response.headers.get('location'), safeUrl).href;
      continue;
    }
    if (!response.ok) throw new Error(`下载图片失败（HTTP ${response.status}）`);
    const imageTypes = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const ext = imageTypes[contentType];
    if (!ext) throw new Error('远程地址不是支持的图片格式');
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 15 * 1024 * 1024) throw new Error('图片超过 15MB');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 15 * 1024 * 1024) throw new Error('图片超过 15MB');
    const remoteName = safeName(path.basename(safeUrl.pathname, path.extname(safeUrl.pathname)), 'pasted-image');
    const filename = `${Date.now()}-${remoteName}${ext}`;
    fs.writeFileSync(path.join(imagesDir, filename), buffer);
    return `./images/${filename}`;
  }
  throw new Error('图片重定向次数过多');
}

function parseDelimitedLine(line, delimiter) {
  if (delimiter === 'space') return line.trim().split(/\s+/);
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(value.trim()); value = '';
    } else value += character;
  }
  values.push(value.trim());
  return values;
}

function detectDelimiter(lines) {
  const candidates = ['\t', ',', '|', ';'];
  const scores = candidates.map(delimiter => {
    const counts = lines.slice(0, 20).map(line => parseDelimitedLine(line, delimiter).length);
    const useful = counts.filter(count => count > 1);
    const consistent = useful.length && useful.every(count => count === useful[0]);
    return { delimiter, score: useful.length * 10 + (consistent ? 20 : 0) + Math.max(0, ...(useful || [0])) };
  }).sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].delimiter : 'space';
}

function arrangeMatchColumns(rows, hasHeader) {
  if (!hasHeader || !rows.length) return rows;
  const headers = rows[0].map(value => String(value).trim());
  const awayIndex = headers.indexOf('客队');
  const resultIndex = headers.indexOf('赛果');
  if (awayIndex < 0 || resultIndex < 0) return rows;

  return rows.map((row, rowIndex) => {
    const values = [...row];
    const awayValue = values[awayIndex] ?? '';
    const resultValue = values[resultIndex] ?? '';
    [awayIndex, resultIndex].sort((a, b) => b - a).forEach(index => values.splice(index, 1));
    while (values.length < 3) values.push('');
    values.splice(3, 0, awayValue, resultValue);

    if (rowIndex === 0) {
      values.splice(4, 1, '主队得分', '客队得分');
    } else {
      const scoreParts = String(values[4] ?? '').split('-');
      const homeScore = (scoreParts.shift() || '').trim();
      const awayScore = scoreParts.join('-').trim();
      values.splice(4, 1, homeScore, awayScore);
    }
    return values;
  });
}

function normalizeHandicapText(rows) {
  const replacements = new Map([
    ['球半/两', '球半/两球'],
    ['一/球半', '一球/球半'],
    ['两/两半', '两球/两球半'],
    ['两半/三', '两球半/三球'],
    ['两半', '两球半']
  ]);
  return rows.map(row => row.map(value => {
    const text = String(value ?? '').trim();
    return replacements.get(text) ?? value;
  }));
}

async function textToExcel(data) {
  const text = String(data.text || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (!lines.length) throw new Error('TXT 文件没有可转换的内容');
  if (lines.length > 100000) throw new Error('TXT 文件超过 100,000 行');
  const delimiters = { tab: '\t', comma: ',', pipe: '|', semicolon: ';', space: 'space' };
  const delimiter = data.delimiter === 'auto' || !delimiters[data.delimiter] ? detectDelimiter(lines) : delimiters[data.delimiter];
  const parsedRows = lines.map(line => parseDelimitedLine(line, delimiter));
  const rows = normalizeHandicapText(arrangeMatchColumns(parsedRows, data.hasHeader !== false));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '宝哥彩吧文章后台';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('转换结果');
  worksheet.addRows(rows);
  if (data.hasHeader !== false && worksheet.rowCount) {
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    header.alignment = { vertical: 'middle' };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (worksheet.columnCount) worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: worksheet.columnCount } };

    const handicapColumn = rows[0].findIndex(value => String(value).trim() === '盘路') + 1;
    if (handicapColumn > 0) {
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const cell = worksheet.getCell(rowNumber, handicapColumn);
        const value = String(cell.value ?? '').trim();
        if (value === '赢') cell.font = { ...cell.font, color: { argb: 'FFFF0000' } };
        if (value === '输') cell.font = { ...cell.font, color: { argb: 'FF0000FF' } };
      }
    }
  }
  worksheet.columns.forEach(column => {
    let width = 10;
    column.eachCell({ includeEmpty: false }, cell => { width = Math.max(width, Math.min(50, String(cell.value || '').length + 2)); });
    column.width = width;
  });
  return workbook.xlsx.writeBuffer();
}

function findGit() {
  const candidates = [
    process.env.GIT_PATH,
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe')
  ].filter(Boolean);

  const desktopDir = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'GitHubDesktop');
  if (desktopDir && fs.existsSync(desktopDir)) {
    const desktopGit = fs.readdirSync(desktopDir)
      .filter(name => name.startsWith('app-'))
      .sort().reverse()
      .map(name => path.join(desktopDir, name, 'resources', 'app', 'git', 'cmd', 'git.exe'))
      .find(candidate => fs.existsSync(candidate));
    if (desktopGit) candidates.push(desktopGit);
  }

  return candidates.find(candidate => fs.existsSync(candidate)) || 'git';
}

const gitExecutable = findGit();
function git(args) {
  return new Promise((resolve,reject)=>execFile(gitExecutable,args,{cwd:root},(error,stdout,stderr)=>{
    if (error && error.code === 'ENOENT') return reject(new Error('找不到 Git。请安装 Git for Windows，或设置 GIT_PATH 后重新启动后台。'));
    return error ? reject(new Error((stderr||error.message).trim())) : resolve(stdout.trim());
  }));
}

function parseBeijingDate(value) {
  if (!value) return new Date();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    return new Date(text + (text.length === 16 ? ':00' : '') + '+08:00');
  }
  return new Date(text);
}

function beijingDatePrefix(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function siteConfig() {
  return fs.existsSync(siteConfigFile) ? JSON.parse(fs.readFileSync(siteConfigFile, 'utf8')) : {};
}

async function articleViews(filename) {
  const code = siteConfig().analytics?.goatcounterCode;
  if (!/^[a-z0-9-]+$/.test(code || '')) return null;
  const slug = filename.replace(/\.md$/, '');
  const deployedPath = `/888/${encodeURIComponent(slug)}.html`;
  const counterUrl = `https://${code}.goatcounter.com/counter/${encodeURIComponent(deployedPath)}.json`;
  try {
    const response = await fetch(counterUrl, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return 0;
    if (!response.ok) return null;
    const data = await response.json();
    return data.count ?? 0;
  } catch (error) {
    return null;
  }
}

http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(req.method==='GET'&&['/','/admin/','/admin/index.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(adminFile).pipe(res)}
  if(req.method==='GET'&&url.pathname.startsWith('/admin/images/')){const filename=path.basename(decodeURIComponent(url.pathname)),filePath=path.join(imagesDir,filename);if(!fs.existsSync(filePath))return json(res,404,{error:'图片不存在'});res.writeHead(200,{'Cache-Control':'no-store'});return fs.createReadStream(filePath).pipe(res)}
  if(req.method==='GET'&&url.pathname==='/api/posts'){const posts=fs.readdirSync(postsDir).filter(name=>name.endsWith('.md')).map(filename=>{const parsed=matter(fs.readFileSync(path.join(postsDir,filename),'utf8')),timestamp=parsed.data.date?new Date(parsed.data.date).getTime():0;return{filename,title:parsed.data.title||filename,timestamp:Number.isNaN(timestamp)?0:timestamp}}).sort((a,b)=>b.timestamp-a.timestamp);const withViews=await Promise.all(posts.map(async post=>({...post,views:await articleViews(post.filename)})));return json(res,200,withViews)}
  if(req.method==='GET'&&url.pathname==='/api/announcement'){const config=fs.existsSync(siteConfigFile)?JSON.parse(fs.readFileSync(siteConfigFile,'utf8')):{};return json(res,200,{enabled:config.announcement?.enabled!==false,title:config.announcement?.title||'网站公告',content:config.announcement?.content||''})}
  if(req.method==='POST'&&url.pathname==='/api/announcement'){const data=await readBody(req),config=fs.existsSync(siteConfigFile)?JSON.parse(fs.readFileSync(siteConfigFile,'utf8')):{};config.announcement={enabled:Boolean(data.enabled),title:String(data.title||'网站公告').trim()||'网站公告',content:String(data.content||'').trim()};fs.writeFileSync(siteConfigFile,JSON.stringify(config,null,2)+'\n','utf8');return json(res,200,config.announcement)}
  if(req.method==='GET'&&url.pathname==='/api/post'){const filename=path.basename(url.searchParams.get('filename')||'');if(!filename.endsWith('.md'))return json(res,400,{error:'文件名无效'});const parsed=matter(fs.readFileSync(path.join(postsDir,filename),'utf8'));const author=!parsed.data.author||parsed.data.author==='baoge'?'宝哥':parsed.data.author;return json(res,200,{...parsed.data,author,bodyHtml:marked.parse(parsed.content.trimStart())})}
  if(req.method==='POST'&&url.pathname==='/api/post'){const data=await readBody(req);if(!String(data.title||'').trim())return json(res,400,{error:'请填写文章标题'});const date=parseBeijingDate(data.date);if(Number.isNaN(date.getTime()))return json(res,400,{error:'日期格式无效'});const prefix=beijingDatePrefix(date);const filename=data.originalFilename?path.basename(data.originalFilename):`${prefix}-${safeName(data.title,'post')}.md`;const author=!data.author||data.author==='baoge'?'宝哥':String(data.author).trim();const frontmatter={title:String(data.title).trim(),author,date:date.toISOString(),source:String(data.source||'原创').trim(),thumbnail:String(data.thumbnail||'').trim(),summary:String(data.summary||'').trim()};fs.writeFileSync(path.join(postsDir,filename),matter.stringify(String(data.body||''),frontmatter),'utf8');return json(res,200,{filename})}
  if(req.method==='POST'&&url.pathname==='/api/image'){const data=await readBody(req);const match=String(data.data||'').match(/^data:image\/[\w.+-]+;base64,(.+)$/);if(!match)return json(res,400,{error:'图片格式无效'});const ext=path.extname(data.name||'').toLowerCase();if(!['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(ext))return json(res,400,{error:'不支持该图片格式'});const filename=`${Date.now()}-${safeName(path.basename(data.name,ext),'image')}${ext}`;fs.writeFileSync(path.join(imagesDir,filename),Buffer.from(match[1],'base64'));return json(res,200,{path:`./images/${filename}`})}
  if(req.method==='POST'&&url.pathname==='/api/remote-image'){const data=await readBody(req);const imagePath=await downloadRemoteImage(data.url);return json(res,200,{path:imagePath})}
  if(req.method==='POST'&&url.pathname==='/api/txt-to-excel'){const data=await readBody(req);const buffer=await textToExcel(data);const baseName=safeName(path.basename(String(data.filename||'转换结果'),path.extname(String(data.filename||''))),'转换结果');res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="converted.xlsx"; filename*=UTF-8''${encodeURIComponent(baseName+'.xlsx')}`,'Content-Length':buffer.length,'Cache-Control':'no-store'});return res.end(Buffer.from(buffer))}
  if(req.method==='POST'&&url.pathname==='/api/publish'){const data=await readBody(req),message=String(data.message||'').trim();if(!message)return json(res,400,{error:'Commit 信息不能为空'});await git(['add','--','posts','images','site-config.json']);const staged=await git(['diff','--cached','--name-only']);if(staged)await git(['commit','-m',message]);await git(['push']);return json(res,200,{message:staged?`发布成功：${message}\n${staged}`:'没有新变更，已有本地 commit 已推送。'})}
  if(req.method==='POST'&&url.pathname==='/api/notification'){const data=await readBody(req),title=String(data.title||'').trim(),body=String(data.body||'').trim(),targetUrl=String(data.url||'').trim()||'https://baogezhao.github.io/888/';if(!title)return json(res,400,{error:'请填写通知标题'});if(!body)return json(res,400,{error:'请填写通知正文'});let parsedUrl;try{parsedUrl=new URL(targetUrl)}catch{return json(res,400,{error:'通知链接格式无效'})}if(parsedUrl.protocol!=='https:'||parsedUrl.hostname!=='baogezhao.github.io'||!(parsedUrl.pathname==='/888'||parsedUrl.pathname.startsWith('/888/')))return json(res,400,{error:'通知链接必须是宝哥彩吧网站地址'});const request={title:title.slice(0,100),body:body.slice(0,200),url:targetUrl,requestedAt:new Date().toISOString()};fs.writeFileSync(path.join(notificationsDir,'manual.json'),JSON.stringify(request,null,2)+'\n','utf8');await git(['add','--','notifications/manual.json']);await git(['commit','-m',`手动推送：${title.slice(0,40)}`]);await git(['push']);return json(res,200,{message:'通知请求已提交，网站部署成功后将自动发送。'})}
  if(req.method==='DELETE'&&url.pathname==='/api/post'){const filename=path.basename(url.searchParams.get('filename')||''),data=await readBody(req),message=String(data.message||'').trim();if(!filename.endsWith('.md'))return json(res,400,{error:'文件名无效'});if(!message)return json(res,400,{error:'Commit 信息不能为空'});const filePath=path.join(postsDir,filename);if(!fs.existsSync(filePath))return json(res,404,{error:'文章不存在'});fs.unlinkSync(filePath);await git(['add','-A','--','posts']);await git(['commit','-m',message]);await git(['push']);return json(res,200,{message:`已删除并发布：${filename}`})}
  json(res,404,{error:'Not Found'});
}catch(error){json(res,500,{error:error.message})}}).listen(port,'127.0.0.1',()=>{console.log(`本地文章后台：http://127.0.0.1:${port}/admin/`);console.log(`Git：${gitExecutable}`);console.log('按 Ctrl+C 停止服务')});
