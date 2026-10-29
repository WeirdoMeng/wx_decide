const rules=require('../../utils/decision');const store=require('../../utils/storage');const sound=require('../../utils/sound');
Page({
 data:{mode:'random',min:'1',max:'100',count:'1',repeat:false,results:[],displayResults:[],counter:0,counterFrame:[{id:0,value:0,old:0,transition:'none'}],focusField:'',keyboardHeight:0},
 onLoad(){this.sound=sound.createPlayer();this.seed=0;},
 onHide(){this.stopRoll();this.sound.destroy();this.setData({focusField:'',keyboardHeight:0});},
 onUnload(){this.stopRoll();this.sound.destroy();},
 mode(event){this.commit();this.setData({mode:event.currentTarget.dataset.mode});},
 input(event){this.setData({[event.currentTarget.dataset.field]:event.detail.value});},
 repeat(event){this.setData({repeat:!event.detail.value});},
 applyInputs(){const min=rules.integer(this.data.min,0,0,999999),max=rules.integer(this.data.max,0,0,999999),count=rules.integer(this.data.count,1,1,100);this.setData({min:String(min),max:String(max),count:String(count)});},
 commit(){this.applyInputs();if(wx.hideKeyboard)wx.hideKeyboard();this.setData({focusField:'',keyboardHeight:0});},
 focus(event){this.setData({focusField:event.currentTarget.dataset.field});},
 blur(event){if(this.data.focusField===event.currentTarget.dataset.field)this.setData({focusField:''});},
 keyboard(event){this.setData({keyboardHeight:event.detail.height||0});},
 confirm(event){const field=event.currentTarget.dataset.field;if(field==='count')this.commit();else this.setData({focusField:field==='min'?'max':'count'});},
 previous(){const fields=['min','max','count'],index=fields.indexOf(this.data.focusField);if(index>0)this.setData({focusField:fields[index-1]});},
 next(){const fields=['min','max','count'],index=fields.indexOf(this.data.focusField);if(index>=0&&index<2)this.setData({focusField:fields[index+1]});},
 roll(){
  this.commit();this.stopRoll();
  try{
   const results=rules.randomNumbers(this.data.min,this.data.max,this.data.count,this.data.repeat);this.seed+=1;this.setData({results});
   const min=Math.min(Number(this.data.min),Number(this.data.max)),max=Math.max(Number(this.data.min),Number(this.data.max)),span=max-min+1;
   const digits=Math.max(String(min).length,String(max).length),width=Math.max(64,Math.min(220,digits*15+36))*2;
   const start=Date.now(),seed=this.seed;
   const update=()=>{const progress=Math.min(1,(Date.now()-start)/680),step=Math.floor((1-Math.pow(1-progress,3))*15);this.setData({displayResults:results.map((target,index)=>({id:seed+'-'+index,value:progress>=.82?target:min+((seed*7919+index*104729+step*15485863)&0x7fffffff)%span,width,settled:progress>=.82}))});if(progress>=1){clearInterval(this.rollTimer);this.rollTimer=null;}};
   update();this.rollTimer=setInterval(update,33);store.feedback();this.sound.play('tick');
  }catch(error){wx.showToast({title:error.message,icon:'none'});}
 },
 stopRoll(){if(this.rollTimer){clearInterval(this.rollTimer);this.rollTimer=null;this.setData({displayResults:this.data.results.map((value,index)=>({id:'final-'+index,value,width:Math.max(64,Math.min(220,String(value).length*15+36))*2,settled:true}))});}},
 resetRange(){this.stopRoll();this.setData({min:'1',max:'100',count:'1',repeat:false,results:[],displayResults:[]});store.feedback();},
 clear(){this.stopRoll();this.setData({results:[],displayResults:[]});},
 step(event){const old=this.data.counter,delta=Number(event.currentTarget.dataset.step),value=old+delta;this.seed+=1;this.setData({counter:value,counterFrame:[{id:this.seed,value,old,transition:delta>0?'increment':'decrement'}]});store.feedback();},
 reset(){const old=this.data.counter;this.seed+=1;this.setData({counter:0,counterFrame:[{id:this.seed,value:0,old,transition:'reset'}]});store.feedback();}
});
