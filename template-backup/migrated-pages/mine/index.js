const layout=require('../../utils/layout');
Page({
 data:{safeTop:20,cacheSize:'0 B'},
 onLoad(){this.setData(layout.metrics());this.loadCache();},
 onShow(){if(this.getTabBar())this.getTabBar().setData({selected:2,hidden:false});this.loadCache();},
 loadCache(){if(!wx.getSavedFileList){this._cacheFiles=[];return;}wx.getSavedFileList({success:result=>{this._cacheFiles=result.fileList||[];const bytes=this._cacheFiles.reduce((sum,file)=>sum+(Number(file.size)||0),0);this.setData({cacheSize:bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':bytes>=1024?(bytes/1024).toFixed(1)+' KB':bytes+' B'});},fail:()=>{this._cacheFiles=[];this.setData({cacheSize:'0 B'});}});},
 clearCache(){const files=this._cacheFiles||[];if(!files.length){wx.showToast({title:'缓存已清除',icon:'none'});return;}let remaining=files.length;files.forEach(file=>{wx.removeSavedFile({filePath:file.filePath,complete:()=>{remaining-=1;if(!remaining){this.loadCache();wx.showToast({title:'缓存已清除',icon:'none'});}}});});}
});
