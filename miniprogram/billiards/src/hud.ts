/** A texture HUD drawn in the same WebGL frame as the table. No native overlay ordering. */
export type HudMenu="mode"|"difficulty"|"color";
export type HudAction = { action: string; value?: number | string; x?:number; y?:number };
export type HudRegion = { x: number; y: number; w: number; h: number; action: string; value?: string; range?: boolean; vertical?:boolean; pad?:boolean; disabled?: boolean };
export class CanvasBilliardsHud {
  regions: HudRegion[] = [];
  private ctx: any;
  private key = "";
  private active?: HudRegion;
  private width = 0;
  private height = 0;
  private scale = 1;
  private pixelRatio = 1;
  constructor(public canvas: any, private dispatch: (action: HudAction) => void) {
    this.ctx = canvas.getContext("2d");
    if (!this.ctx || !this.ctx.getImageData) throw new Error("当前微信不支持离屏 2D 球桌界面");
  }
  resize(width: number, height: number, pixelRatio = 1) { this.width = Math.round(width); this.height = Math.round(height); this.pixelRatio = Math.max(1, pixelRatio); this.canvas.width = Math.round(this.width * this.pixelRatio); this.canvas.height = Math.round(this.height * this.pixelRatio); this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0); this.scale = Math.min(1, Math.max(.65, Math.min(width / 844, height / 390))); this.key = ""; this.active = undefined; }
  private round(x:number,y:number,w:number,h:number,r:number|number[],color:any,stroke?:string) {
    const c=this.ctx,rr=(Array.isArray(r)?r:[r,r,r,r]).map(v=>Math.min(v,w/2,h/2)),[tl,tr,br,bl]=rr;c.beginPath();c.moveTo(x+tl,y);c.lineTo(x+w-tr,y);c.quadraticCurveTo(x+w,y,x+w,y+tr);c.lineTo(x+w,y+h-br);c.quadraticCurveTo(x+w,y+h,x+w-br,y+h);c.lineTo(x+bl,y+h);c.quadraticCurveTo(x,y+h,x,y+h-bl);c.lineTo(x,y+tl);c.quadraticCurveTo(x,y,x+tl,y);c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}

  }
  private gradient(x:number,y:number,w:number,h:number,from:string,to:string){const g=this.ctx.createLinearGradient?.(x,y,x+w,y+h);if(g&&typeof g.addColorStop==="function"){g.addColorStop(0,from);g.addColorStop(1,to);return g;}return from;}
  private text(text:string,x:number,y:number,size=12,color="#E8E1CB",align="left",weight="normal") {const c=this.ctx;c.font=weight+" "+Math.round(size*this.scale)+"px "+(size>=13&&weight==="600"?"Georgia, serif":"sans-serif");c.textAlign=align;c.textBaseline="middle";c.fillStyle=color;c.fillText(text,x,y);}
  private button(label:string,x:number,y:number,w:number,h:number,action:string,primary=false,disabled=false,value?:string) {
    this.round(x,y,w,h,primary?[4,18,4,18].map(v=>v*this.scale):999,primary?(disabled?"#31483D":this.gradient(x,y,w,h,"#ecd597","#b78e45")):"rgba(3,20,14,.86)",primary?"#eed59a":"rgba(225,197,139,.35)");
    this.text(label,x+w/2,y+h/2,primary?16:11,primary?(disabled?"#7D9687":"#173022"):disabled?"#647C6C":"#D2D4B9","center",primary?"600":"normal");
    this.regions.push({x,y,w,h,action,value,disabled});
  }
  private range(label:string,value:number,x:number,y:number,w:number,action:string,disabled:boolean) {
    const s=this.scale,c=this.ctx;this.text(label,x,y+6*s,9,disabled?"#5A7565":"#A7B89E");
    const left=x+38*s,top=y+6*s,track=w-44*s;
    this.round(left,top-2*s,track,4*s,2*s,"#365345");this.round(left,top-2*s,Math.max(1,track*value),4*s,2*s,disabled?"#536B51":"#C4A763");
    c.beginPath();c.arc(left+track*value,top,5*s,0,Math.PI*2);c.fillStyle=disabled?"#62795F":"#E5D39D";c.fill();
    this.regions.push({x:left-7*s,y:y-6*s,w:track+14*s,h:24*s,action,range:true,disabled});
  }
  update(state:any,ui:{sound:boolean;top:boolean;spinX:number;spinY:number;capsuleBottom?:number;menu?:HudMenu|null}):boolean {
    const key=JSON.stringify([this.width,this.height,state,ui]);if(key===this.key)return false;this.key=key;
    const c=this.ctx,w=this.width,h=this.height,s=this.scale,p=18*s;this.regions=[];c.clearRect(0,0,w,h);
    // Match the original Web game's index.html/style.css: compact top score board,
    // top-right reset/view/sound/pause, bottom-left spin ball, right vertical power,
    // bottom-center shot and bottom-right match settings. No invented sidebar panel.
    this.button("‹",p,10*s,34*s,34*s,"exit");
    // On WeChat, use a second action row below the real capsule instead of shrinking hit areas beside it.
    const controlsY=ui.capsuleBottom?Math.max(9*s,ui.capsuleBottom+8):9*s;
    let right=w-p-(ui.capsuleBottom?0:82*s);const topFit=ui.capsuleBottom?1:Math.min(1,Math.max(.6,(w-p-82*s-(w/2+138*s)-12*s)/(279*s)));
    for(const [label,action,width] of [["暂停","pause",44],[ui.sound?"声音开":"声音关","sound",60],[ui.top?"完成":"视角","view",44],["重新开局","restart",82]] as [string,string,number][]){right-=width*s*topFit;this.button(label,right,controlsY,width*s*topFit,44*s,action);right-=7*s*topFit;}
    const scoreW=276*s,scoreX=w/2-scoreW/2,scoreY=8*s;
    this.round(scoreX,scoreY,scoreW,54*s,[5,17,5,17].map(v=>v*s),"rgba(3,20,14,0.88)","rgba(214,180,109,0.5)");
    for(let i=0;i<2;i++){const x=scoreX+(i===0?0:204*s);if(state.activePlayer===i){this.round(x+1,scoreY+1,71*s,52*s,6*s,"rgba(166,124,51,0.23)");c.fillStyle="#D6B46D";c.fillRect(x+13*s,scoreY+51*s,38*s,2*s);}this.text(i===1&&state.ai?"AI":"PLAYER "+(i+1),x+36*s,scoreY+13*s,7,state.activePlayer===i?"#FFF1C8":"#8F9B87","center");this.text(String(state.players[i]),x+36*s,scoreY+33*s,20,"#F5EAD2","center","600");}
    this.text("当前目标",w/2,scoreY+10*s,7,"#979B85","center");this.text(state.targetLabel,w/2,scoreY+27*s,13,"#D6B46D","center","600");
    const nominate=state.mode==="snooker"&&state.phase==="reds"&&state.target!=="red"&&!state.moving&&!state.thinking&&!state.paused;
    if(nominate){this.text("选择彩球 ⌄",w/2,scoreY+43*s,8,"#E6CA85","center");this.regions.push({x:scoreX+72*s,y:scoreY+15*s,w:132*s,h:37*s,action:"color-picker"});}
    else this.text(state.mode==="snooker"?state.redsRemaining+" 红":"3D 黑8",w/2,scoreY+43*s,7,"#9DA48F","center");
    const statusX=68*s,statusW=Math.max(100*s,scoreX-statusX-14*s);c.fillStyle="#D6B46D";c.fillRect(statusX,11*s,2*s,34*s);
    this.text(state.thinking?"AI 思考中":(state.activePlayer===1&&state.ai?"AI":"PLAYER "+(state.activePlayer+1))+(state.moving?" 击球中":" 击球"),statusX+12*s,21*s,12,"#F5EAD2","left","600");
    const detail=state.ballInHand?(state.mode==="snooker"?"母球落袋 · 请在 D 区摆球":"犯规自由球 · 点击台面摆球"):String(state.message||"按住球杆后端拖动瞄准");const chars=Math.max(8,Math.floor(statusW/(9*s)));this.text(detail.length>chars?detail.slice(0,chars-1)+"…":detail,statusX+12*s,39*s,9,"#A8B0A0");
    // The original circular hit point maps X to side spin and inverted Y to follow spin.
    const diameter=70*s,spinX=17*s,spinY=h-96*s,centerX=spinX+diameter/2,centerY=spinY+diameter/2;
    this.text("击球点",centerX,spinY-11*s,9,"#D6B46D","center");c.beginPath();c.arc(centerX,centerY,diameter/2,0,Math.PI*2);const glow=c.createRadialGradient?.(centerX-10*s,centerY-14*s,1,centerX,centerY,diameter/2);if(glow&&typeof glow.addColorStop==="function"){glow.addColorStop(0,"#fffdf4");glow.addColorStop(.56,"#e9dec5");glow.addColorStop(1,"#ae9c79");c.fillStyle=glow;}else c.fillStyle="#e9dec5";c.fill();c.strokeStyle="#E5CC97";c.lineWidth=1;c.stroke();c.beginPath();c.moveTo(spinX+5*s,centerY);c.lineTo(spinX+diameter-5*s,centerY);c.moveTo(centerX,spinY+5*s);c.lineTo(centerX,spinY+diameter-5*s);c.strokeStyle="rgba(58,48,30,.23)";c.stroke();
    c.beginPath();c.arc(centerX+ui.spinX/100*diameter*.32,centerY-ui.spinY/100*diameter*.32,4*s,0,Math.PI*2);c.fillStyle="#9F2F30";c.fill();c.strokeStyle="#FFF0C7";c.stroke();
    const spinLabel=Math.abs(ui.spinX)<18&&Math.abs(ui.spinY)<18?"中心球":(ui.spinY>25?"高杆":ui.spinY< -25?"低杆":"")+(ui.spinX>25?"右塞":ui.spinX< -25?"左塞":"");this.text(spinLabel,centerX,h-7*s,8,"#ADB4A2","center");this.regions.push({x:spinX,y:spinY,w:diameter,h:diameter,action:"spin-pad",pad:true,disabled:!state.canShoot});
    const powerX=w-54*s,powerY=h/2-Math.min(h*.31,190*s)/2,powerH=Math.min(h*.31,190*s),fraction=(state.power-8)/92;
    this.text("力度",powerX+18*s,powerY-18*s,9,"#D6B46D","center");this.round(powerX+15*s,powerY,5*s,powerH,2*s,"#70482D");this.round(powerX+15*s,powerY+powerH*(1-fraction),5*s,Math.max(1,powerH*fraction),2*s,"#D0AD63");c.beginPath();c.arc(powerX+17.5*s,powerY+powerH*(1-fraction),12.5*s,0,Math.PI*2);c.fillStyle="#173D31";c.fill();c.strokeStyle="#F2D99E";c.lineWidth=2*s;c.stroke();this.text(String(state.power),powerX+18*s,powerY+powerH+18*s,15,"#F5EAD2","center","600");this.regions.push({x:powerX-4*s,y:powerY,w:44*s,h:powerH,action:"power",range:true,vertical:true,disabled:!state.canShoot&&!state.ballInHand});
    this.button(state.ballInHand?"摆球":state.thinking?"AI 思考中":state.moving?"击球中":"击球",w/2-46*s,h-62*s,92*s,48*s,"shoot",true,!state.canShoot);
    let settingsX=w-p;const settings:[string,string,string][]=[];if(state.ai)settings.push(["AI 难度",{easy:"简单",normal:"普通",hard:"困难"}[state.difficulty as "easy"|"normal"|"hard"],"difficulty"]);settings.push(["对局模式",state.ai?"单人 vs AI":"本地双人","opponent"]);
    for(const [caption,label,action] of settings){const bw=100*s,bh=44*s;settingsX-=bw;this.round(settingsX,h-56*s,bw,bh,[4,15,4,15].map(v=>v*s),this.gradient(settingsX,h-56*s,bw,bh,"rgba(19,61,46,.94)","rgba(3,21,15,.94)"),"rgba(225,197,139,.42)");this.text(caption,settingsX+12*s,h-43*s,7,"rgba(245,234,210,.48)");this.text(label,settingsX+12*s,h-25*s,11,"#f6d98d","left","600");this.text("›",settingsX+bw-12*s,h-34*s,22,"#d6b46d","center");this.regions.push({x:settingsX,y:h-56*s,w:bw,h:bh,action});settingsX-=6*s;}
    if(state.paused||state.phase==="finished"){
      c.fillStyle="rgba(2,14,9,0.87)";c.fillRect(0,0,w,h);this.regions=[];
      const mw=310*s,mh=220*s,mx=w/2-mw/2,my=h/2-mh/2;
      this.round(mx,my,mw,mh,18*s,"#132F24","#877C46");this.text(state.phase==="finished"?"FRAME COMPLETE":"TABLE PAUSED",w/2,my+24*s,8,"#BAA16A","center");
      this.text(state.phase==="finished"?(state.winner===null?"本局平局":(state.winner===1&&state.ai?"AI":"玩家 "+(state.winner+1))+" 获胜"):"球房已暂停",w/2,my+63*s,24,"#EBE2C8","center","600");
      this.text(state.phase==="finished"?state.players[0]+" : "+state.players[1]:"回来后从当前回合继续。",w/2,my+98*s,14,"#B4BEA6","center");
      this.button(state.phase==="finished"?"再来一局":"继续对局",mx+30*s,my+125*s,mw-60*s,38*s,state.phase==="finished"?"restart":"resume",true);
      if(state.phase!=="finished")this.button("重新开局",mx+30*s,my+177*s,110*s,27*s,"restart");
      this.button("返回聚会",state.phase==="finished"?mx+90*s:mx+168*s,my+177*s,state.phase==="finished"?130*s:110*s,27*s,"exit");
    }
    if(ui.menu&&!state.paused&&state.phase!=="finished")this.settingsSheet(state,ui.menu);
    return true;
  }
  private settingsSheet(state:any,kind:HudMenu){
    const c=this.ctx,w=this.width,h=this.height,s=this.scale,compact=h<=430,colors=[['yellow','黄球','#f4d13d','2'],['green','绿球','#27834a','3'],['brown','棕球','#8a4b28','4'],['blue','蓝球','#2c79c5','5'],['pink','粉球','#df7b9a','6'],['black','黑球','#171717','7']];
    const options:string[][]=kind==="mode"?[["local","本地双人","同屏轮流"],["ai","单人 vs AI","挑战电脑"]]:kind==="difficulty"?[["easy","简单","更宽容"],["normal","普通","平衡体验"],["hard","困难","更精准"]]:colors.map(([value,label,hex,points])=>[value,label,points+" 分球",hex]);
    const title=kind==="mode"?"选择对局模式":kind==="difficulty"?"选择 AI 难度":"指定本杆彩球",description=kind==="mode"?"本地双人轮流出杆，或让 AI 接管 PLAYER 2":kind==="difficulty"?"难度会改变 AI 的线路精度、力度误差与思考时间":"红球入袋后选择本杆要击打的彩球";
    const pad=(compact?14:18)*s,gap=(compact?5:7)*s,ow=Math.min((kind==="color"?350:326)*s,w-36*s),rowH=(compact?(kind==="color"?46:48):kind==="color"?60:54)*s,rows=kind==="color"?2:1,header=(compact?64:72)*s,mh=pad*2+header+rowH*rows+gap*(rows-1)+47*s,mx=Math.max(18*s,w-(compact?66:78)*s-ow),my=Math.max(12*s,h-(compact?(kind==="color"?50:57):70)*s-mh);
    c.fillStyle="rgba(1,10,7,.58)";c.fillRect(0,0,w,h);this.regions=[{x:0,y:0,w,h,action:"menu-close"}];
    this.round(mx,my,ow,mh,[7,25,7,25].map(v=>v*s),this.gradient(mx,my,ow,mh,"rgba(19,62,45,.98)","rgba(3,21,15,.99)"),"rgba(235,207,148,.52)");this.round(mx+7*s,my+7*s,ow-14*s,mh-14*s,[4,19,4,19].map(v=>v*s),"rgba(0,0,0,0)","rgba(214,180,109,.12)");
    this.regions.push({x:mx,y:my,w:ow,h:mh,action:"menu-panel",disabled:true});
    this.text("MATCH CONTROL",mx+pad,my+pad+5*s,8,"#d6b46d");this.text(title,mx+pad,my+pad+28*s,compact?20:23,"#fff1c7","left","600");this.text(description,mx+pad,my+pad+51*s,9,"rgba(245,234,210,.54)");
    const cellW=(ow-2*pad-2*gap)/3,gridY=my+pad+header,selected=kind==="mode"?(state.ai?"ai":"local"):kind==="difficulty"?state.difficulty:state.selectedColor;
    options.forEach(([value,label,detail,color],i)=>{const x=mx+pad+(i%3)*(cellW+gap),y=gridY+Math.floor(i/3)*(rowH+gap),active=value===selected;this.round(x,y,cellW,rowH,[3,13,3,13].map(v=>v*s),active?this.gradient(x,y,cellW,rowH,"#efd898","#ae813b"):"rgba(2,26,17,.82)",active?"#f1d690":"rgba(214,180,109,.26)");if(color){c.beginPath();c.arc(x+cellW/2-20*s,y+rowH*.36,7.5*s,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle="rgba(255,245,214,.78)";c.lineWidth=1;c.stroke();}this.text(label,x+cellW/2+(color?8*s:0),y+rowH*.36,11,active?"#102219":"rgba(245,234,210,.72)","center");this.text(detail,x+cellW/2,y+rowH*.69,7,active?"rgba(12,34,25,.62)":"rgba(245,234,210,.36)","center");this.regions.push({x,y,w:cellW,h:rowH,action:"menu-select",value});});
    const closeY=gridY+rows*rowH+(rows-1)*gap+3*s;this.text("返回球桌",mx+ow/2,closeY+22*s,10,"rgba(245,234,210,.7)","center");this.regions.push({x:mx+pad,y:closeY,w:ow-pad*2,h:44*s,action:"menu-close"});
  }
  pixels():Uint8Array {const data=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data;return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);}
  private at(x:number,y:number):HudRegion|undefined {return [...this.regions].reverse().find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);}
  private emitRange(region:HudRegion,x:number,y:number) {if(region.disabled)return;if(region.pad){const nx=Math.max(-1,Math.min(1,((x-region.x)/region.w-.5)*2)),ny=Math.max(-1,Math.min(1,((y-region.y)/region.h-.5)*2)),length=Math.hypot(nx,ny),scale=length>1?1/length:1;this.dispatch({action:"spin-pad",x:nx*scale,y:-ny*scale});}else this.dispatch({action:region.action,value:region.vertical?Math.max(0,Math.min(1,1-(y-region.y)/Math.max(1,region.h))):Math.max(0,Math.min(1,(x-region.x-7*this.scale)/Math.max(1,region.w-14*this.scale)))});}
  pointer(type:"down"|"move"|"up"|"cancel",x:number,y:number):boolean {
    if(type==="down"){this.active=this.at(x,y);if(this.active&&(this.active.range||this.active.pad))this.emitRange(this.active,x,y);return Boolean(this.active);}
    const active=this.active;if(!active)return false;
    if(type==="move"){if(active.range||active.pad)this.emitRange(active,x,y);return true;}
    this.active=undefined;if(type==="up"&&!active.disabled){if(active.range||active.pad)this.emitRange(active,x,y);else if(this.at(x,y)?.action===active.action&&this.at(x,y)?.value===active.value)this.dispatch({action:active.action,value:active.value});}return true;
  }
}
