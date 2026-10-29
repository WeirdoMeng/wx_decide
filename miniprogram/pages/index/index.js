const sound=require('../../utils/sound.js');
const rules = require('../../utils/decision.js');
const store = require('../../utils/storage.js');
const layout = require('../../utils/layout.js');
const motion = require('../../utils/motion.js');
const ads = require('../../utils/ads');
const palette = ['#48DCD6','#A86AF2','#54BAF2','#F46DB8','#6486F5','#FFB062','#A96AF0','#FF95B9'];
Page({
  data: { bannerUnit:'', bannerFailed:false, title:'小决定', count:0, spinning:false, result:'', hasList:false, ready:false, resultOpen:false, listsOpen:false, safeTop:20 },
  onLoad() { this._spinAd=ads.controller(()=>this._active);this.setData(layout.metrics()); this.rotation = 0; this.sound = sound.createPlayer(); },
  onShow() {
    this._active=true;
    this.setTabHidden(this.data.listsOpen || this.data.resultOpen);
    if (this.getTabBar()) this.getTabBar().setData({selected:0});
    try {
      const lists = store.getLists(), selectedId = store.read('selected','');
      this.selected = lists.find(item => item.id === selectedId) || lists[0] || null;
      this.items = rules.activeItems(this.selected ? this.selected.items : []);
      const same = this.selectedSnapshot === JSON.stringify(this.selected);
      if (!same) this.rotation = 0;
      this.selectedSnapshot = JSON.stringify(this.selected);
      this.setData({title:this.selected ? this.selected.title : '创建你的第一个转盘', count:this.items.length, hasList:!!this.selected, selected:this.selected, result:same ? this.data.result : ''});
      if (this.canvas) this.draw();
    } catch (_) { wx.showToast({title:'列表读取失败，请检查设备存储',icon:'none'}); }
  },
  onReady() {
    wx.createSelectorQuery().in(this).select('#wheel').fields({node:true,size:true}).exec(res => {
      if (!res[0] || !res[0].node) return;
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.canvas = res[0].node; this.size = res[0].width;
      this.canvas.width = this.size * info.pixelRatio; this.canvas.height = (res[0].height || this.size * 1.03) * info.pixelRatio;
      this.ctx = this.canvas.getContext('2d'); this.ctx.scale(info.pixelRatio,info.pixelRatio);
      this.canvasTop = this.size * .03;
      if(this.canvas.createImage){[['centerArt','/assets/original/wheel_center.png'],['pointerArt','/assets/original/wheel_pointer.png']].forEach(pair=>{const art=this.canvas.createImage();art.onload=()=>{this[pair[0]]=art;this.draw();};art.onerror=()=>{};art.src=pair[1];});}
      this.setData({ready:true}); this.draw();
    });
  },
  onHide() { if(this._spinAd)this._spinAd.cancel();this._spinAdGate=false;this._active=false;this._bannerMounted=false;this.setData({bannerUnit:''});this.cancelSpin(); this.sound.destroy(); },
  onUnload() { if(this._spinAd)this._spinAd.dispose();this._spinAdGate=false;this._active=false;this._bannerMounted=false;this.setData({bannerUnit:''});this.cancelSpin(); this.sound.destroy(); this.canvas = null; this.ctx = null; },
  cancelSpin() {
    if (this.frame && this.canvas) this.canvas.cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.data.spinning) {
      this.rotation = this.target % rules.TAU;
      this.setData({spinning:false,result:this.items[this.resultIndex].text});
      this.draw();
    }
  },
  draw() {
    if (!this.ctx) return;
    const ctx=this.ctx,size=this.size,c=size/2,r=c,segR=r*.93;
    ctx.clearRect(0,0,size,size*1.03);ctx.save();ctx.translate(0,this.canvasTop||0);
    const gradient=ctx.createLinearGradient(0,0,size,size);
    if(gradient&&gradient.addColorStop){gradient.addColorStop(0,'#fff');gradient.addColorStop(.55,'#e1ecff');gradient.addColorStop(1,'#fff');}
    ctx.beginPath();ctx.arc(c,c,r-.8,0,rules.TAU);ctx.fillStyle=gradient||'#edf3ff';ctx.fill();
    ctx.strokeStyle='#2e67b133';ctx.lineWidth=1.4;ctx.stroke();
    ctx.beginPath();ctx.arc(c,c,r-2.6,0,rules.TAU);ctx.strokeStyle='#ffffffeb';ctx.lineWidth=1;ctx.stroke();
    ctx.save();ctx.translate(c,c);
    if(!this.items||!this.items.length){ctx.beginPath();ctx.arc(0,0,segR,0,rules.TAU);ctx.fillStyle='#ffffffcc';ctx.fill();}
    rules.segments(this.items||[]).forEach((segment,index)=>{
      const angle=segment.start+this.rotation-Math.PI/2;
      const custom=Number(segment.item.colorValue),source=Number.isFinite(custom)&&custom>0?'#'+(custom>>>0).toString(16).padStart(8,'0').slice(-6):palette[index%palette.length];
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,segR,angle,angle+segment.sweep);ctx.closePath();ctx.fillStyle=softColor(source);ctx.fill();
      ctx.strokeStyle='#ffffff29';ctx.lineWidth=1.4;ctx.stroke();
    });
    ctx.beginPath();ctx.arc(0,0,segR-.8,0,rules.TAU);ctx.strokeStyle='#ffffffd1';ctx.lineWidth=1.6;ctx.stroke();
    ctx.save();ctx.shadowColor='#ffffff70';ctx.shadowBlur=9.5;ctx.beginPath();ctx.arc(0,0,segR-segR*.075/2,0,rules.TAU);ctx.lineWidth=segR*.075;ctx.strokeStyle='#ffffff70';ctx.stroke();ctx.restore();
    rules.segments(this.items||[]).forEach(segment=>{
      const angle=segment.center+this.rotation-Math.PI/2;
      const fontSize=Math.min(segR*.105,Math.max(segR*.052,segment.sweep*segR*.22));
      ctx.save();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+fontSize+'px sans-serif';ctx.shadowColor='#00000080';ctx.shadowBlur=3;ctx.shadowOffsetY=1;
      let text=String(segment.item.text||'');if(text.length>7)text=text.slice(0,7)+'…';
      if(ctx.measureText){let measured=ctx.measureText(text);while(measured&&measured.width>segR*.46&&text.length>2){text=text.replace(/…$/,'').slice(0,-1)+'…';measured=ctx.measureText(text);}}
      ctx.fillText(text,Math.cos(angle)*segR*.66,Math.sin(angle)*segR*.66,segR*.46);ctx.restore();
    });
    ctx.restore();
    const centerSize=size*.2254,pointerSize=size*.154;
    if(this.centerArt)ctx.drawImage(this.centerArt,c-centerSize/2,c-centerSize/2,centerSize,centerSize);
    if(this.pointerArt)ctx.drawImage(this.pointerArt,c-pointerSize/2,-size*.03,pointerSize,pointerSize);
    ctx.restore();
  },
  spin() {
    if (this.data.spinning || this._spinAdGate || !this.canvas) return;
    if (!this.items || this.items.length < 2) { wx.showToast({title:'至少需要 2 个参与选项',icon:'none'}); return; }
    if(ads.shouldOffer('wheel')){
      this._spinAdGate=true;
      const accepted=this._spinAd.play(()=>{this._spinAdGate=false;if(this._active&&this.canvas)this._startSpin();},{placement:'wheel'});
      if(accepted===false)this._spinAdGate=false;
      return;
    }
    this._startSpin();
  },
  _startSpin(){
    if(!this.canvas||this.data.spinning)return;
    this.resultIndex = rules.pickWeighted(this.items); this.target = rules.targetRotation(this.items,this.resultIndex,this.rotation);
    const from = this.rotation, start = Date.now(), duration = 4400;
    this.setData({spinning:true,result:'',resultOpen:false});
    const step = () => {
      if (!this.data.spinning || !this.canvas) return;
      const progress = Math.min(1,(Date.now()-start)/duration), eased = motion.wheelEase(progress);
      this.rotation = from+(this.target-from)*eased; this.draw();
      if (progress < 1) this.frame = this.canvas.requestAnimationFrame(step);
      else {
        this.frame = null; this.rotation %= rules.TAU;
        this.setData({spinning:false,result:this.items[this.resultIndex].text}); this.showOverlay('resultOpen'); store.feedback('medium'); this.sound.play('finish');
      }
    }; this.frame = this.canvas.requestAnimationFrame(step);
  },
  setTabHidden(hidden) { const tab=this.getTabBar?this.getTabBar():null;if(tab)tab.setData({hidden:!!hidden});if(hidden)this._bannerMounted=false;else if(this._active&&!this._bannerMounted){this._bannerMounted=true;this.setData({bannerUnit:ads.choose('banner'),bannerFailed:false});} },
  onMembershipChange(){this._bannerMounted=false;this.setData({bannerUnit:''});if(this._active)this.setTabHidden(this.data.resultOpen||this.data.listsOpen);},
  adLoad(event) { if(event.currentTarget.dataset.unit===this.data.bannerUnit)ads.bannerEvent('load',this.data.bannerUnit); },
  adError(event) { if(event.currentTarget.dataset.unit!==this.data.bannerUnit)return;ads.bannerEvent('error',this.data.bannerUnit,event.detail);this.setData({bannerFailed:true}); },
  adClose(event) { if(event.currentTarget.dataset.unit!==this.data.bannerUnit)return;ads.bannerEvent('close',this.data.bannerUnit);this.setData({bannerFailed:true}); },
  showOverlay(key) { if(this._overlayPending)return;this._overlayPending=true;const reveal=path=>{this._overlayPending=false;this.setData({wheelSnapshot:path||'', [key]:true});this.setTabHidden(true);};if(wx.canvasToTempFilePath&&this.canvas)wx.canvasToTempFilePath({canvas:this.canvas,success:result=>reveal(result.tempFilePath),fail:()=>reveal('')},this);else reveal(''); },
  openLists() { if (!this.data.spinning && !this._spinAdGate) this.showOverlay('listsOpen'); },
  closeLists() { this.setData({listsOpen:false}); this.setTabHidden(false); },
  selectList() { this.setData({listsOpen:false}); this.setTabHidden(false); this.onShow(); },
  listsChanged() { this.onShow(); },
  closeResult() { this.setData({resultOpen:false}); this.setTabHidden(false); },
  again() { this.setData({resultOpen:false}); this.setTabHidden(false); this.spin(); },
  edit() { if (!this.data.spinning && !this._spinAdGate) wx.navigateTo({url:'/pages/list-edit/index'+(this.selected ? '?id='+encodeURIComponent(this.selected.id) : '')}); }
});

// Flutter FortuneWheel._segmentColor: HSL saturation ×0.8, lightness +0.035.
function softColor(hex){
 const values=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255),max=Math.max(values[0],values[1],values[2]),min=Math.min(values[0],values[1],values[2]),d=max-min;let h=0,l=(max+min)/2,s=0;
 if(d){s=d/(1-Math.abs(2*l-1));h=max===values[0]?((values[1]-values[2])/d)%6:max===values[1]?(values[2]-values[0])/d+2:(values[0]-values[1])/d+4;h=(h*60+360)%360;}
 s*=.8;l=Math.min(1,l+.035);const chroma=(1-Math.abs(2*l-1))*s,x=chroma*(1-Math.abs((h/60)%2-1)),m=l-chroma/2;
 const rgb=h<60?[chroma,x,0]:h<120?[x,chroma,0]:h<180?[0,chroma,x]:h<240?[0,x,chroma]:h<300?[x,0,chroma]:[chroma,0,x];return 'rgb('+rgb.map(value=>Math.round((value+m)*255)).join(',')+')';
}
