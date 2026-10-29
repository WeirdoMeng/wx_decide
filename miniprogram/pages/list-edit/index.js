const store = require('../../utils/storage.js');
const motion = require('../../utils/motion.js');
const ads = require('../../utils/ads');
function emptyItem(){return {id:store.newId(),text:'',weight:1,excluded:false};}
Page({
  data:{title:'',items:[],saving:false,pageTitle:'新建列表',canAdd:false,scrollTop:0},
  onLoad(options) { this._active=true;this._rewardAd=ads.controller(()=>this._active,'rewarded');let list; try { list=store.getLists().find(item=>item.id===options.id); } catch (_) {} this.id=list?list.id:store.newId(); this.type=list?list.type:'wheel'; this.setData({pageTitle:list?'编辑列表':'新建列表',title:list?list.title:'',items:list?store.clone(list.items):[emptyItem(),emptyItem()],canAdd:!!(list&&list.items.length&&String(list.items[list.items.length-1].text).trim())}); },
  inputTitle(e) { this.setData({title:e.detail.value}); },
  inputItem(e) { const index=Number(e.currentTarget.dataset.index),field=e.currentTarget.dataset.field; this.setData({['items['+index+'].'+field]:e.detail.value});if(field==='text'&&index===this.data.items.length-1)this.setData({canAdd:!!String(e.detail.value).trim()}); },
  toggleItem(e) { const index=Number(e.currentTarget.dataset.index); this.setData({['items['+index+'].excluded']:!this.data.items[index].excluded}); },
  add() { if(this.data.items.length&&!String(this.data.items[this.data.items.length-1].text).trim()){wx.showToast({title:'请先填写当前选项',icon:'none'});this.scrollBottom();return;} this.setData({items:this.data.items.concat(emptyItem()),canAdd:false},()=>this.scrollBottom()); },
  remove(e) { if(this.data.items.length<=2)return; const index=Number(e.currentTarget.dataset.index); const items=this.data.items.filter((_,i)=>i!==index);this.setData({items,canAdd:!!(items.length&&String(items[items.length-1].text).trim())}); },
  recordScroll(event){this._scrollTop=event.detail.scrollTop;},
  scrollBottom(){
    if(!wx.createSelectorQuery)return;wx.createSelectorQuery().in(this).select('.editor-scroll').fields({size:true,scrollOffset:true}).select('.editor-content').boundingClientRect().exec(result=>{if(!result[0]||!result[1])return;clearTimeout(this._scrollTimer);const from=Number(result[0].scrollTop)||this._scrollTop||0,target=Math.max(0,result[1].height-result[0].height),start=Date.now();const tick=()=>{const progress=Math.min(1,(Date.now()-start)/260);this.setData({scrollTop:from+(target-from)*motion.cubic(progress,.215,.61,.355,1)});if(progress<1)this._scrollTimer=setTimeout(tick,16);else this._scrollTimer=null;};tick();});
  },
  onShow(){this._active=true;},
  onHide(){this._active=false;if(this._rewardAd)this._rewardAd.cancel();this.setData({saving:false});clearTimeout(this._scrollTimer);this._scrollTimer=null;},
  onUnload(){this._active=false;if(this._rewardAd)this._rewardAd.dispose();clearTimeout(this._scrollTimer);this._scrollTimer=null;},
  save() {
    if (this.data.saving) return;
    const items=this.data.items.filter(item=>String(item.text).trim()).map(item=>Object.assign({},item,{text:String(item.text).trim(),weight:Number(item.weight)}));
    const error=!this.data.title.trim()?'请填写列表标题':items.length<2?'至少需要 2 个选项':'';
    if (error) { wx.showToast({title:error,icon:'none'}); return; }
    const draft={id:this.id,title:this.data.title.trim(),type:this.type,items};
    this.setData({saving:true});
    if(this._saveAdCredit===JSON.stringify(draft)||!ads.shouldOffer('save','rewarded')){this._commitSave(draft);return;}
    const accepted=this._rewardAd.play(result=>{
      if(!this._active)return;
      if(result.status==='complete'){this._saveAdCredit=JSON.stringify(draft);this._commitSave(draft);return;}
      this.setData({saving:false});
      wx.showToast({title:result.status==='incomplete'?'未看完视频，修改尚未保存':'广告暂不可用，修改已保留',icon:'none'});
    });
    if(accepted===false)this.setData({saving:false});
  },
  _commitSave(draft){
    try { store.saveList(draft);if(this.getOpenerEventChannel){const channel=this.getOpenerEventChannel();if(channel&&channel.emit)channel.emit('saved',{id:this.id});} wx.navigateBack(); }
    catch (_) { this.setData({saving:false}); wx.showToast({title:'保存失败，请检查设备存储',icon:'none'}); }
  }
});
