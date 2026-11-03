// 辅助布局回归：真实WXML/WXSS转为浏览器预览；不能代替微信/真机验收。
const fs=require('fs'),vm=require('vm'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),base=path.join(root,'miniprogram'),out=process.env.PARTYPLAY_ARTIFACTS||'/tmp/wx-partyplay-preview';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><head></head><body></body></html>');
 await page.evaluate(()=>{window.render=(source,state,nav)=>{
 const interp=(value,scope)=>String(value).replace(/{{([\s\S]*?)}}/g,(_,expr)=>{try{return Function('s','with(s){return ('+expr+')}')(scope)??'';}catch(e){throw Error(expr+': '+e.message);}});
 const expr=(value,scope)=>{try{return Function('s','with(s){return ('+value.replace(/^{{|}}$/g,'')+')}')(scope);}catch(e){throw Error(value+': '+e.message);}};
 const doc=new DOMParser().parseFromString(source.replace(/<image\b([^>]*?)\/>/g,'<img$1>').replace(/<original-nav[^>]*\/>/g,nav),'text/html');
 function children(parent,scope){let chain=false;const result=document.createDocumentFragment();for(const node of parent.childNodes){if(node.nodeType!==1){if(node.nodeType===3)result.append(document.createTextNode(interp(node.textContent,scope)));continue;}
 const each=node.getAttribute('wx:for'),items=each?expr(each,scope):[null];
 for(let index=0;index<items.length;index++){const s=each?{...scope,[node.getAttribute('wx:for-item')||'item']:items[index],[node.getAttribute('wx:for-index')||'index']:index}:scope;
 const cond=node.getAttribute('wx:if'),elif=node.getAttribute('wx:elif'),els=node.hasAttribute('wx:else');
 if(cond!==null){chain=!!expr(cond,s);if(!chain)continue;}else if(elif!==null){if(chain)continue;chain=!!expr(elif,s);if(!chain)continue;}else if(els){if(chain)continue;chain=true;}else chain=false;
 let tag=node.tagName.toLowerCase();if(tag==='block'){result.append(children(node,s));continue;}tag=tag==='view'?'div':tag==='text'?'span':tag==='block'?'section':tag==='switch'?'input':tag;const el=document.createElement(tag);
 for(const a of node.attributes){if(a.name.startsWith('wx:')||a.name.startsWith('bind')||a.name.startsWith('catch'))continue;let val=interp(a.value,s);if(a.name==='disabled'){if(val==='true')el.disabled=true;continue;}if(a.name==='src'&&val.startsWith('/'))val=window.assets[val]||val;el.setAttribute(a.name,val);}
 if(node.tagName.toLowerCase()==='switch')el.type='checkbox';el.append(children(node,s));result.append(el);
 }
 }return result;}
 document.body.replaceChildren(children(doc.body,state));
 };});
 const assets={};for(const rel of ['assets/original/main_bg.jpg','assets/original/party/party_intro_random_person.png','assets/original/party/truth_dare_star.png']){const b=fs.readFileSync(path.join(base,rel));assets['/'+rel]='data:image/'+(rel.endsWith('jpg')?'jpeg':'png')+';base64,'+b.toString('base64');}
 await page.evaluate(assets=>window.assets=assets,assets);
 fs.mkdirSync(out,{recursive:true});
 function definition(kind){let d;vm.runInNewContext(fs.readFileSync(path.join(base,'partyplay/pages/'+kind+'/index.js'),'utf8'),{Page:v=>d=v,require:name=>name.endsWith('/words')?require(path.join(base,'partyplay/words')):{}});return JSON.parse(JSON.stringify(d.data));}
 const rows=Array.from({length:4},(_,i)=>({key:i,title:'玩家 '+(i+1),value:'0.20 秒误差',extra:'误差 0.20 秒'}));
 const scenarios=[];
 for(const [width,height]of [[844,390],[667,375],[568,320]]){
  const state=definition('words');
  scenarios.push(['heads-setup-'+width,'words',width,height,{...state}]);
  scenarios.push(['charades-setup-'+width,'words',width,height,{...state,mode:'charades',title:'你比我猜',grouped:true,teamCount:4,categories:[{key:'mixed',title:'混合题库'}].concat(require(path.join(base,'partyplay/words')).categoriesFor('charades'))}]);
  scenarios.push(['heads-playing-'+width,'words',width,height,{...state,phase:'playing',word:'手舞足蹈',wordCategory:'成语挑战',seconds:42,correct:4,skipped:2,teamName:'猜词玩家'}]);
  scenarios.push(['heads-paused-'+width,'words',width,height,{...state,phase:'paused',teamName:'猜词玩家'}]);
  scenarios.push(['words-result-'+width,'words',width,height,{...state,mode:'charades',title:'你比我猜',phase:'result',final:true,grouped:true,detailRows:rows,detailPages:3}]);
 }
 for(const [width,height]of [[390,844],[375,667],[320,568]]){
  const state=definition('timing');
  scenarios.push(['timing-setup-'+width,'timing',width,height,{...state}]);
  scenarios.push(['timing-multi-setup-'+width,'timing',width,height,{...state,multi:true,players:8,customTarget:true,target:300,best:'0.20'}]);
  scenarios.push(['timing-running-'+width,'timing',width,height,{...state,phase:'running',clock:'···',clockHidden:true}]);
  scenarios.push(['timing-multi-result-'+width,'timing',width,height,{...state,phase:'result',final:true,multi:true,ranking:[{player:0}],detailRows:rows,detailPages:6,elapsedText:'10.230',errorText:'0.230',direction:'超时按停',differenceText:'超出目标 0.230 秒',resultMinutes:'00',resultSeconds:'10',resultMillis:'230',isBest:true}]);
 }

 const checks=[];for(const [name,kind,width,height,data]of scenarios){await page.setViewportSize({width,height});const css=(fs.readFileSync(path.join(base,'app.wxss'),'utf8')+'\n'+fs.readFileSync(path.join(base,'partyplay/pages/'+kind+'/index.wxss'),'utf8')).replace(/(-?[\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px').replace(/\bpage\b/g,'body').replace(/\bimage\b/g,'img').replace(/\bview(?=[\s{>.:#\[])/g,'div').replace(/\btext\b(?=\s*[{,>])/g,'span');
 await page.evaluate(({css,source,data})=>{document.head.innerHTML='<style>html,body{margin:0}*{box-sizing:border-box}section{display:contents}button,input{font:inherit}button{border:0;width:184px}img{object-fit:contain}.main-bg{object-fit:cover}input[type=checkbox]{width:40px;height:22px}button{cursor:pointer}'+css+'</style>';window.render(source,data,'<div style="height:64px;flex:none;display:flex;align-items:center;padding:0 24px;gap:18px"><span style="font-size:24px">‹</span><b style="font-size:17px">'+data.title+'</b></div>');},{css,source:fs.readFileSync(path.join(base,'partyplay/pages/'+kind+'/index.wxml'),'utf8'),data:{title:'十秒挑战',...data}});
 await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});checks.push(await page.evaluate(name=>({name,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('button')].map(el=>{const card=el.closest('.settings-card,.details-card,.result-details'),box=card&&card.getBoundingClientRect(),rect=el.getBoundingClientRect();return{clipped:!!box&&(rect.left<box.left-1||rect.right>box.right+1||rect.top<box.top-1||rect.bottom>box.bottom+1),label:el.textContent.trim(),width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height),top:Math.round(el.getBoundingClientRect().top),bottom:Math.round(el.getBoundingClientRect().bottom),left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)}})}),name));}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,checks},null,2));console.log(JSON.stringify({errors,checks:checks.map(x=>({name:x.name,overflow:x.scrollWidth>x.width,height:x.scrollHeight,viewport:x.height,offscreen:x.buttons.filter(b=>b.clipped||b.top<0||b.bottom>x.height+1||b.left<0||b.right>x.width+1)}))},null,2));await browser.close();
 const failures=checks.filter(x=>x.scrollWidth>x.width||x.scrollHeight>x.height+1||x.buttons.some(b=>b.clipped||b.top<0||b.bottom>x.height+1||b.left<0||b.right>x.width+1));if(errors.length||failures.length)throw Error('布局溢出或预览错误: '+failures.map(x=>x.name).join(','));
})().catch(error=>{console.error(error);process.exitCode=1;});
