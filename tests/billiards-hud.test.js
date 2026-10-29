const assert=require('node:assert/strict');
const {CanvasBilliardsHud,BilliardsSession}=require('../miniprogram/billiards/core');
const drawCalls=[];
const ctx=new Proxy({getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get(object,key){if(key in object)return object[key];return(...args)=>drawCalls.push({method:key,args});},set(object,key,value){object[key]=value;return true;}});
const actions=[],hud=new CanvasBilliardsHud({getContext:()=>ctx},action=>actions.push(action));
const session=new BilliardsSession('eight'),ui={sound:true,top:false,spinX:0,spinY:0};hud.resize(844,390);
assert.equal(hud.update(session.snapshot(),ui),true);assert.equal(hud.update(session.snapshot(),ui),false,'static HUD does not re-upload every frame');
assert.ok(drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='击球'),'Chinese controls must actually be drawn to Canvas');
assert.ok(drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='3D 黑8'));
const region=action=>{const r=hud.regions.find(r=>r.action===action);assert.ok(r,action+' region exists');return r;};
const click=action=>{const r=region(action);hud.pointer('down',r.x+r.w/2,r.y+r.h/2);hud.pointer('up',r.x+r.w/2,r.y+r.h/2);};
click('shoot');assert.equal(actions.at(-1).action,'shoot');assert.equal(actions.filter(a=>a.action==='shoot').length,1,'one gesture commits one action');
for(const name of ['exit','pause','restart','view','opponent','sound']){click(name);assert.equal(actions.at(-1).action,name);}
const power=region('power');hud.pointer('down',power.x+power.w/2,power.y+power.h/2);assert.ok(Math.abs(actions.at(-1).value-.5)<1e-9);hud.pointer('move',power.x,power.y+1000);assert.equal(actions.at(-1).value,0);hud.pointer('move',power.x,power.y-1000);assert.equal(actions.at(-1).value,1);hud.pointer('up',power.x,power.y-1000);const pad=region('spin-pad');hud.pointer('down',pad.x+pad.w/2,pad.y+pad.h/2);assert.equal(actions.at(-1).x,0);assert.ok(Math.abs(actions.at(-1).y)<1e-9);hud.pointer('move',pad.x+1000,pad.y-1000);assert.ok(Math.abs(Math.hypot(actions.at(-1).x,actions.at(-1).y)-1)<1e-9);assert.ok(actions.at(-1).x>0&&actions.at(-1).y>0);hud.pointer('up',pad.x+pad.w/2,pad.y+pad.h);assert.equal(actions.at(-1).y,-1);
let count=actions.length;const shot=region('shoot');hud.pointer('down',shot.x+2,shot.y+2);hud.pointer('cancel',0,0);hud.pointer('up',shot.x+2,shot.y+2);assert.equal(actions.length,count,'cancel does not shoot');
session.pause();hud.update(session.snapshot(),ui);assert.ok(hud.regions.some(r=>r.action==='resume'));assert.ok(!hud.regions.some(r=>r.action==='shoot'),'pause overlay replaces gameplay hit regions');click('resume');assert.equal(actions.at(-1).action,'resume');
session.resume();session.shoot();hud.update(session.snapshot(),ui);count=actions.length;click('shoot');assert.equal(actions.length,count,'disabled pending-stroke shot cannot fire again');
const snooker=new BilliardsSession('snooker');snooker.match.resolveShot(snooker.match.beginShot(),{firstContact:'red-1',potted:['red-1']});hud.update(snooker.snapshot(),ui);assert.equal(hud.regions.filter(r=>r.action==='color-picker').length,1);click('color-picker');assert.equal(actions.at(-1).action,'color-picker');
assert.equal(hud.pixels().byteLength,844*390*4);hud.resize(667,375);assert.equal(hud.update(session.snapshot(),ui),true);
// DPR changes only the backing texture; hit coordinates stay in logical pixels.
hud.resize(844,390,2.5);hud.update(session.snapshot(),ui);
assert.equal(hud.canvas.width,2110);assert.equal(hud.canvas.height,975);
assert.equal(hud.pixels().byteLength,2110*975*4);
assert.ok(drawCalls.some(call=>call.method==='setTransform'&&call.args[0]===2.5));
click('sound');assert.equal(actions.at(-1).action,'sound');
hud.resize(844,390,3.5);assert.equal(hud.canvas.width,2954);assert.equal(hud.canvas.height,1365);assert.equal(hud.pixels().byteLength,2954*1365*4);
console.log('WebGL Canvas HUD passed: Chinese drawing, static texture caching, all button hits, single-fire/cancel, clipped vertical power and circular spin pad, pause/shot locks, original color selector trigger, resize.');

// Draw original settings panels, current selection, option details, and shield the full table.
session.restart();const clickRegion=r=>{hud.pointer('down',r.x+r.w/2,r.y+r.h/2);hud.pointer('up',r.x+r.w/2,r.y+r.h/2);};
for(const [kind,expected] of [['mode',['local','ai']],['difficulty',['easy','normal','hard']],['color',['yellow','green','brown','blue','pink','black']]]){hud.update(session.snapshot(),{...ui,menu:kind});const choices=hud.regions.filter(r=>r.action==='menu-select');assert.deepEqual(choices.map(r=>r.value),expected);assert.equal(hud.regions.some(r=>r.action==='shoot'),false);const panel=hud.regions.find(r=>r.action==='menu-panel');count=actions.length;hud.pointer('down',panel.x+4,panel.y+4);hud.pointer('up',panel.x+4,panel.y+4);assert.equal(actions.length,count,'sheet blank area absorbs touches');hud.pointer('down',choices[0].x+2,choices[0].y+2);hud.pointer('up',choices[1].x+2,choices[1].y+2);assert.equal(actions.length,count,'dragging between options must not select the original option');clickRegion(choices.at(-1));assert.equal(actions.at(-1).action,'menu-select');assert.equal(actions.at(-1).value,expected.at(-1));hud.pointer('down',1,1);hud.pointer('up',1,1);assert.equal(actions.at(-1).action,'menu-close');const close=hud.regions.filter(r=>r.action==='menu-close').at(-1);clickRegion(close);assert.equal(actions.at(-1).action,'menu-close');}
assert.ok(drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='MATCH CONTROL'));assert.ok(drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='选择对局模式'));assert.ok(drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='返回球桌'));session.pause();hud.update(session.snapshot(),{...ui,menu:'mode'});assert.equal(hud.regions.some(r=>r.action==='menu-select'),false,'pause overlay owns all input');
console.log('Original custom-sheet HUD passed: 2/3/6 options, labels/details, backdrop and panel shields, return button, cross-option drag rejection, pause priority.');
const capsuleSession=new BilliardsSession('eight');
hud.update(capsuleSession.snapshot(),{...ui,capsuleBottom:42});
const toolbar=hud.regions.filter(r=>['restart','view','sound','pause'].includes(r.action)).sort((a,b)=>a.x-b.x);
assert.equal(toolbar.length,4);
for(const region of toolbar){assert.ok(region.y>=50,'toolbar is below the native WeChat capsule');assert.ok(region.w>0&&region.x>=0&&region.x+region.w<=844);}
for(let i=1;i<toolbar.length;i++)assert.ok(toolbar[i-1].x+toolbar[i-1].w<toolbar[i].x,'toolbar actions do not overlap');
