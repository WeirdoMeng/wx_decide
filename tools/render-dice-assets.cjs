/* 构建期离线渲染 shaizi 的原始 dice_Baked 网格，无运行时 WebGL 依赖。
 * 先运行 import-dice-assets.py。BABYLON_SOURCE、PLAYWRIGHT_MODULE、CHROME_BIN 可覆盖本机依赖路径。
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),work=process.env.DICE_ASSET_WORK||'/tmp/wx-decide-dice-assets';
const source=process.env.BABYLON_SOURCE||'/Users/apple/Desktop/WebSpace/mobile-3d-billiards';
const esbuild=require(path.join(source,'node_modules/esbuild'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 if(!fs.existsSync(path.join(work,'model.json')))throw Error('请先运行 import-dice-assets.py');
 await esbuild.build({entryPoints:[path.join(__dirname,'dice/render.ts')],bundle:true,format:'iife',outfile:path.join(work,'render.js'),nodePaths:[path.join(source,'node_modules')],minify:true});
 const html='<!doctype html><style>html,body{margin:0;background:transparent}canvas{display:block;width:320px;height:320px}</style><canvas width="320" height="320"></canvas><script src="render.js"></script>';
 const server=http.createServer((q,r)=>{if(q.url==='/'){r.setHeader('Content-Type','text/html');r.end(html);return;}const name=q.url.slice(1);if(!['render.js','model.json'].includes(name)){r.writeHead(404);r.end();return;}r.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':'application/json');r.end(fs.readFileSync(path.join(work,name)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:320,height:320},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  // 原网格六个朝上面的实际点数已逐张核对：+Y=2，-Y=5，-Z=1，+Z=6，+X=3，-X=4。
  const poses={1:[Math.PI/2,0,0],2:[0,0,0],3:[0,0,Math.PI/2],4:[0,0,-Math.PI/2],5:[Math.PI,0,0],6:[-Math.PI/2,0,0]};
  for(const [value,pose] of Object.entries(poses)){await page.evaluate(p=>window.pose(...p),pose);await page.screenshot({path:path.join(root,'miniprogram/dice/assets/die-'+value+'.png'),omitBackground:true});}
  const manifestPath=path.join(root,'docs/source-data/dice-assets.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  manifest.outputs=fs.readdirSync(path.join(root,'miniprogram/dice/assets')).filter(name=>name.endsWith('.png')).map(name=>{const bytes=fs.readFileSync(path.join(root,'miniprogram/dice/assets',name));return {name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log('原模型六个点数面已生成。');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
