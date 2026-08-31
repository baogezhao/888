const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const matter = require('gray-matter');
const { marked } = require('marked');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'posts');
const imagesDir = path.join(root, 'images');
const adminFile = path.join(root, 'admin', 'index.html');
const port = Number(process.env.ADMIN_PORT || 3000);
fs.mkdirSync(postsDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
function safeName(value, fallback) { const cleaned=String(value||'').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,''); return cleaned||fallback; }
function readBody(req) { return new Promise((resolve,reject)=>{ let body=''; req.on('data',chunk=>{body+=chunk;if(body.length>20*1024*1024)req.destroy(new Error('请求内容超过 20MB'))}); req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch{reject(new Error('请求格式无效'))}});req.on('error',reject); }); }

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

http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(req.method==='GET'&&['/','/admin/','/admin/index.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(adminFile).pipe(res)}
  if(req.method==='GET'&&url.pathname.startsWith('/admin/images/')){const filename=path.basename(decodeURIComponent(url.pathname)),filePath=path.join(imagesDir,filename);if(!fs.existsSync(filePath))return json(res,404,{error:'图片不存在'});res.writeHead(200,{'Cache-Control':'no-store'});return fs.createReadStream(filePath).pipe(res)}
  if(req.method==='GET'&&url.pathname==='/api/posts'){const posts=fs.readdirSync(postsDir).filter(name=>name.endsWith('.md')).map(filename=>{const parsed=matter(fs.readFileSync(path.join(postsDir,filename),'utf8'));return{filename,title:parsed.data.title||filename}});return json(res,200,posts)}
  if(req.method==='GET'&&url.pathname==='/api/post'){const filename=path.basename(url.searchParams.get('filename')||'');if(!filename.endsWith('.md'))return json(res,400,{error:'文件名无效'});const parsed=matter(fs.readFileSync(path.join(postsDir,filename),'utf8'));const author=!parsed.data.author||parsed.data.author==='baoge'?'宝哥':parsed.data.author;return json(res,200,{...parsed.data,author,bodyHtml:marked.parse(parsed.content.trimStart())})}
  if(req.method==='POST'&&url.pathname==='/api/post'){const data=await readBody(req);if(!String(data.title||'').trim())return json(res,400,{error:'请填写文章标题'});const date=data.date?new Date(data.date):new Date();if(Number.isNaN(date.getTime()))return json(res,400,{error:'日期格式无效'});const prefix=date.toISOString().slice(0,10);const filename=data.originalFilename?path.basename(data.originalFilename):`${prefix}-${safeName(data.title,'post')}.md`;const author=!data.author||data.author==='baoge'?'宝哥':String(data.author).trim();const frontmatter={title:String(data.title).trim(),author,date:date.toISOString(),source:String(data.source||'原创').trim(),thumbnail:String(data.thumbnail||'').trim(),summary:String(data.summary||'').trim()};fs.writeFileSync(path.join(postsDir,filename),matter.stringify(String(data.body||''),frontmatter),'utf8');return json(res,200,{filename})}
  if(req.method==='POST'&&url.pathname==='/api/image'){const data=await readBody(req);const match=String(data.data||'').match(/^data:image\/[\w.+-]+;base64,(.+)$/);if(!match)return json(res,400,{error:'图片格式无效'});const ext=path.extname(data.name||'').toLowerCase();if(!['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(ext))return json(res,400,{error:'不支持该图片格式'});const filename=`${Date.now()}-${safeName(path.basename(data.name,ext),'image')}${ext}`;fs.writeFileSync(path.join(imagesDir,filename),Buffer.from(match[1],'base64'));return json(res,200,{path:`./images/${filename}`})}
  if(req.method==='POST'&&url.pathname==='/api/publish'){const data=await readBody(req),message=String(data.message||'').trim();if(!message)return json(res,400,{error:'Commit 信息不能为空'});await git(['add','--','posts','images']);const staged=await git(['diff','--cached','--name-only']);if(staged)await git(['commit','-m',message]);await git(['push']);return json(res,200,{message:staged?`发布成功：${message}\n${staged}`:'没有新变更，已有本地 commit 已推送。'})}
  if(req.method==='DELETE'&&url.pathname==='/api/post'){const filename=path.basename(url.searchParams.get('filename')||''),data=await readBody(req),message=String(data.message||'').trim();if(!filename.endsWith('.md'))return json(res,400,{error:'文件名无效'});if(!message)return json(res,400,{error:'Commit 信息不能为空'});const filePath=path.join(postsDir,filename);if(!fs.existsSync(filePath))return json(res,404,{error:'文章不存在'});fs.unlinkSync(filePath);await git(['add','-A','--','posts']);await git(['commit','-m',message]);await git(['push']);return json(res,200,{message:`已删除并发布：${filename}`})}
  json(res,404,{error:'Not Found'});
}catch(error){json(res,500,{error:error.message})}}).listen(port,'127.0.0.1',()=>{console.log(`本地文章后台：http://127.0.0.1:${port}/admin/`);console.log(`Git：${gitExecutable}`);console.log('按 Ctrl+C 停止服务')});
