const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../miniprogram');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('本地图片能进入微信上传白名单，后缀匹配真实编码且资源引用存在',()=>{
 const allowed=new Set(['.png','.jpg','.jpeg','.gif','.svg']);
 for(const f of files(path.join(root,'assets'))){
  const ext=path.extname(f),bytes=fs.readFileSync(f);
  assert.ok(allowed.has(ext),`图片会被上传过滤: ${f}`);
  if(ext==='.png')assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',f);
  if(ext==='.jpg'||ext==='.jpeg')assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8',f);
 }
 for(const f of files(root).filter(f=>/\.(js|wxml|wxss)$/.test(f)&&!f.includes('/billiards/'))){
  const text=fs.readFileSync(f,'utf8');
  assert.ok(!text.includes('.webp'),`不能引用上传忽略的WebP: ${f}`);
  for(const match of text.matchAll(/['"](\/assets\/[^'"{}]+\.(?:png|jpg))['"]/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
 }
 const config=require('../project.config.json'),packages=require('../miniprogram/app.json').subPackages||[],sizes={main:0};
 for(const pkg of packages)sizes[pkg.root]=0;
 for(const f of files(root)){
  const name=path.relative(root,f).split(path.sep).join('/');
  if(config.packOptions.ignore.some(x=>name===x.value||(x.type==='folder'&&name.startsWith(x.value+'/'))))continue;
  const pkg=packages.find(pkg=>name.startsWith(pkg.root+'/'));
  sizes[pkg?pkg.root:'main']+=fs.statSync(f).size;
 }
 for(const [name,bytes] of Object.entries(sizes))assert.ok(bytes<2*1024*1024,`${name}本地运行输入超过2MiB: ${bytes}`);
});
