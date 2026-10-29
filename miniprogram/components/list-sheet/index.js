const store=require('../../utils/storage');const templates=require('../../data/templates');
Component({
 properties:{show:{type:Boolean,value:false,observer(value){if(value)this.refresh();}},currentId:{type:String,value:''}},
 data:{lists:[],templates:[],templateOpen:false,confirmDelete:false,deleteId:'',deleteTitle:''},
 pageLifetimes:{show(){if(this.properties.show){this.refresh();if(this._creating){const id=this._createdId;this._creating=false;this._createdId='';if(id)this.chooseId(id);}}}},
 methods:{
  refresh(){try{this.setData({lists:store.getLists().map(item=>Object.assign({},item,{count:item.items.length})),templates:templates.map(item=>Object.assign({},item,{preview:item.items.slice(0,4).map(option=>option.text).join(' · ')}))});}catch(_){wx.showToast({title:'列表读取失败，请检查设备存储',icon:'none'});}},
  close(){if(this.data.templateOpen){this.setData({templateOpen:false});return;}this.setData({confirmDelete:false});this.triggerEvent('close');},noop(){},
  choose(event){this.chooseId(event.currentTarget.dataset.id);},
  chooseId(id){if(!id)return;try{store.write('selected',id);this.triggerEvent('selectlist',{id});this.close();}catch(_){wx.showToast({title:'选择失败，请重试',icon:'none'});}},
  add(){this._creating=true;this._createdId='';wx.navigateTo({url:'/pages/list-edit/index',events:{saved:result=>{this._createdId=result.id;}},fail:()=>{this._creating=false;this._createdId='';}});},
  edit(event){wx.navigateTo({url:'/pages/list-edit/index?id='+encodeURIComponent(event.currentTarget.dataset.id)});},
  remove(event){if(this.data.lists.length<=1)return;const list=this.data.lists.find(item=>item.id===event.currentTarget.dataset.id);if(list)this.setData({confirmDelete:true,deleteId:list.id,deleteTitle:list.title});},
  cancelDelete(){this.setData({confirmDelete:false});},
  deleteConfirmed(){try{store.deleteList(this.data.deleteId);this.setData({confirmDelete:false});this.refresh();this.triggerEvent('change');}catch(_){wx.showToast({title:'删除失败，请重试',icon:'none'});}},
  openTemplates(){this.setData({templateOpen:true});},closeTemplates(){this.setData({templateOpen:false});},
  template(event){const source=templates.find(item=>item.id===event.currentTarget.dataset.id);if(!source)return;try{const list=store.clone(source);list.id=store.newId();list.items=list.items.map(item=>Object.assign({weight:1,excluded:false},item,{id:store.newId()}));store.saveList(list);this.chooseId(list.id);}catch(_){wx.showToast({title:'保存失败，请检查设备存储',icon:'none'});}}
 }
});
