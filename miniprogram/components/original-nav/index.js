const layout=require('../../utils/layout');
Component({
  properties:{title:{type:String,value:''},floating:{type:Boolean,value:false},back:{type:Boolean,value:true},brand:{type:Boolean,value:false},help:{type:Boolean,value:false},helpLabel:{type:String,value:'玩法说明'},helpIcon:{type:String,value:'/assets/original/party/shark_game_help.png'},managedBack:{type:Boolean,value:false}},
  data:{safeTop:20,navHeight:44,titleRight:108,helpHeight:44},
  lifetimes:{attached(){this.measure();}},
  pageLifetimes:{show(){this.measure();},resize(){this.measure();}},
  methods:{
    measure(){this.setData(layout.metrics());},
    goBack(){if(this.properties.managedBack){this.triggerEvent('back');return;}wx.navigateBack({fail(){wx.switchTab({url:'/pages/index/index'});}});},
    showHelp(){this.triggerEvent('help');},
    helpLongPress(){this.triggerEvent('helplongpress');}
  }
});
