const sound=require('../../utils/sound');const store=require('../../utils/storage');const layout=require('../../utils/layout');
const colors=['#48DCD6','#A86AF2','#54BAF2','#F46DB8','#6486F5','#FFB062','#A96AF0','#FF95B9'];
Page({
 data:{points:[],count:0,countdown:0,decided:false,winner:null},
 onLoad(){this.sound=sound.createPlayer();this.metrics=layout.metrics();this.progress=0;this.selection=0;this._registered=new Set();},
 onReady(){wx.createSelectorQuery().in(this).select('#touch-field').fields({node:true,size:true,rect:true}).exec(rows=>{const rect=rows&&rows[0];if(!rect||!rect.node)return;this.rect=rect;this.canvas=rect.node;const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.canvas.width=rect.width*info.pixelRatio;this.canvas.height=rect.height*info.pixelRatio;this.ctx=this.canvas.getContext('2d');this.ctx.scale(info.pixelRatio,info.pixelRatio);if(this.canvas.createImage){[['hintArt','touch_hint_card.png'],['smileArt','winner_smile.png']].forEach(pair=>{const image=this.canvas.createImage();image.onload=()=>{this[pair[0]]=image;this.drawTouch();};image.onerror=()=>{};image.src='/assets/original/'+pair[1];});}this.drawTouch();});},
 onHide(){this.reset();this.sound.destroy();},
 onUnload(){clearInterval(this.timer);clearInterval(this.selectionTimer);this.timer=null;this.selectionTimer=null;this.sound.destroy();this.canvas=null;this.ctx=null;},
 start(event){if(this.data.decided)this.reset();if(!this._registered)this._registered=new Set();const added=event.changedTouches&&event.changedTouches.length?event.changedTouches:event.touches||[];added.forEach(point=>this._registered.add(point.identifier));this.sync(this.registeredTouches(event.touches));},
 registeredTouches(touches){return(touches||[]).filter(point=>this._registered&&this._registered.has(point.identifier));},
 move(event){if(!this.data.decided)this.sync(this.registeredTouches(event.touches));},
 end(event){if(this.data.decided)return;const touches=this.registeredTouches(event.touches),active=new Set(touches.map(point=>point.identifier));if(this._registered)this._registered.forEach(id=>{if(!active.has(id))this._registered.delete(id);});this.sync(touches);},
 cancel(event){const touches=this.registeredTouches(event&&event.touches);if(touches.length)this.sync(touches);else this.reset();},
 sync(touches){
  if(!this.rect)return;
  const points=touches.map((point,index)=>({id:point.identifier,x:point.clientX-this.rect.left,y:point.clientY-this.rect.top,color:colors[index%colors.length],winner:false}));
  this.setData({points,count:points.length});this.drawTouch();
  if(points.length<2){clearInterval(this.timer);this.timer=null;this.progress=0;this.setData({countdown:0});this.drawTouch();return;}
  if(this.timer)return;this.setData({countdown:3});const started=Date.now();
  this.timer=setInterval(()=>{
   if(this.data.points.length<2){this.reset();return;}
   const elapsed=Date.now()-started;this.progress=Math.min(1,elapsed/3000);const remaining=Math.max(0,3-Math.floor(elapsed/1000));
   if(remaining>0){if(remaining!==this.data.countdown)this.setData({countdown:remaining});this.drawTouch();return;}
   clearInterval(this.timer);this.timer=null;const winner=this.data.points[Math.floor(Math.random()*this.data.points.length)].id;
   this.setData({decided:true,winner,countdown:0,points:this.data.points.map(point=>Object.assign({},point,{winner:point.id===winner}))});store.feedback('heavy');this.sound.play('finish');this.animateSelection();
  },33);
 },
 animateSelection(){this.selection=0;clearInterval(this.selectionTimer);if(!this.ctx)return;const started=Date.now();this.selectionTimer=setInterval(()=>{this.selection=Math.min(1,(Date.now()-started)/720);this.drawTouch();if(this.selection>=1){clearInterval(this.selectionTimer);this.selectionTimer=null;}},33);},
 drawTouch(){
  if(!this.ctx||!this.rect)return;const ctx=this.ctx,w=this.rect.width,h=this.rect.height,scale=this.metrics.scale,hs=this.metrics.heightScale;ctx.clearRect(0,0,w,h);
  if(!this.data.points.length&&!this.data.decided&&this.hintArt){const width=Math.min(w*.76,(h-24*hs)*816/1146),height=width*1146/816;ctx.drawImage(this.hintArt,(w-width)/2,(h-height)/2,width,height);return;}
  const t=this.selection,settle=1-Math.pow(1-t,3);
  this.data.points.forEach(point=>{
   const winner=point.winner,dimmed=this.data.decided&&!winner,opacity=dimmed?1-.75*settle:1;
   const radius=46*scale*(winner?(1+.3*settle)*winnerScale(t):dimmed?1-.15*settle:1);
   ctx.save();ctx.globalAlpha=opacity;ctx.fillStyle=point.color;ctx.shadowColor=point.color;ctx.shadowBlur=(winner?28:20)*scale;
   ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#ffffffe6';ctx.lineWidth=1.8*scale;ctx.stroke();
   if(!this.data.decided&&this.progress>0){ctx.beginPath();ctx.arc(point.x,point.y,radius+8*scale,-Math.PI/2,-Math.PI/2+this.progress*Math.PI*2);ctx.lineWidth=4*scale;ctx.lineCap='round';ctx.strokeStyle='#ffffffe6';ctx.stroke();}
   if(winner){
    for(let index=0;index<3;index++){const local=Math.max(0,Math.min(1,(t-(.01+index*.09))/.56));if(local<=0||local>=1)continue;const eased=1-Math.pow(1-local,3);ctx.globalAlpha=Math.sin(local*Math.PI)*.78;ctx.beginPath();ctx.arc(point.x,point.y,46*scale+10*scale+52*scale*(1-eased),0,Math.PI*2);ctx.lineWidth=(1.8+1.4*eased)*scale;ctx.strokeStyle='#fff';ctx.stroke();}
    const reveal=Math.max(0,Math.min(1,(t-.22)/.46));ctx.globalAlpha=1-Math.pow(1-reveal,3);const size=70*scale*(.72+.28*reveal);if(this.smileArt)ctx.drawImage(this.smileArt,point.x-size/2,point.y-size/2,size,size);
   }
   ctx.restore();
  });
  if(this.data.decided&&t>.58){const alpha=Math.min(1,(t-.58)/.42);ctx.save();ctx.globalAlpha=alpha;const text='已选中！松手后再次点击屏幕重新开始';ctx.font=(14*scale)+'px sans-serif';const measured=ctx.measureText(text),width=(measured&&measured.width||280*scale)+36*scale,height=36*hs,x=(w-width)/2,y=h-32*hs-height;rounded(ctx,x,y,width,height,22*scale);ctx.fillStyle='#fff';ctx.fill();ctx.fillStyle='#6574ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,y+height/2,width-20*scale);ctx.restore();}
 },
 reset(){clearInterval(this.timer);clearInterval(this.selectionTimer);this.timer=null;this.selectionTimer=null;this.progress=0;this.selection=0;this._registered=new Set();this.setData({points:[],count:0,countdown:0,decided:false,winner:null});this.drawTouch();}
});
function winnerScale(t){if(t<.16)return 1-.04*(1-Math.pow(1-t/.16,3));if(t<.58)return .96+.16*(1-Math.pow(1-(t-.16)/.42,3));return 1.12-.12*((t-.58)/.42);}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
