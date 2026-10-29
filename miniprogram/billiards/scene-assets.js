const manifest=require('./assets/club/scene');
const ROOT='/billiards/assets/club/';
// Decode packaged images through the native Canvas APIs; no DOM, network or global cache.
function loadSceneAssets(canvas,api,{onStage,onSuccess,onError}){
  let cancelled=false,image=null,timer=null,decodeCanvas=null;
  const images={};let geometry;
  const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;if(image){image.onload=null;image.onerror=null;image=null;}};
  const task={cancel(){cancelled=true;clear();decodeCanvas=null;geometry=null;for(const key of Object.keys(images))delete images[key];}};
  const fail=error=>{if(cancelled)return;clear();task.cancel();onError(error);};
  try{
    onStage('club-geometry-read');geometry=api.getFileSystemManager().readFileSync(ROOT+'club.bin');
    // Native filesystem data can come from a different JS context than this subpackage.
    // instanceof ArrayBuffer rejects such valid buffers in the actual developer tool.
    if(ArrayBuffer.isView(geometry))geometry=geometry.buffer.slice(geometry.byteOffset,geometry.byteOffset+geometry.byteLength);
    const geometryType=Object.prototype.toString.call(geometry),geometryBytes=geometry&&geometry.byteLength;
    onStage('club-geometry-check',{type:geometryType,actualBytes:geometryBytes,expectedBytes:manifest.geometryBytes});
    if(geometryType!=='[object ArrayBuffer]'||geometryBytes!==manifest.geometryBytes)throw new Error('原球房几何读取不完整：'+geometryBytes+'/'+manifest.geometryBytes+' '+geometryType);
    decodeCanvas=api.createOffscreenCanvas({type:'2d',width:1,height:1});
    const next=index=>{
      if(cancelled)return;
      if(index===manifest.textures.length){clear();decodeCanvas=null;onSuccess({manifest,geometry,images});return;}
      const entry=manifest.textures[index];onStage('club-texture-decode',{name:entry.name,index});
      image=typeof decodeCanvas.createImage==='function'?decodeCanvas.createImage():canvas.createImage();
      image.onload=()=>{
        if(cancelled)return;
        try{clear();decodeCanvas.width=entry.width;decodeCanvas.height=entry.height;const context=decodeCanvas.getContext('2d');context.drawImage(loadedImage,0,0,entry.width,entry.height);const pixels=context.getImageData(0,0,entry.width,entry.height).data;images[entry.name]={width:entry.width,height:entry.height,pixels:new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength)};next(index+1);}catch(error){fail(error);}
      };
      const loadedImage=image;
      image.onerror=error=>fail(new Error('原球房材质读取失败：'+entry.name+' '+String(error&&error.errMsg||'')));
      timer=setTimeout(()=>fail(new Error('原球房材质读取超时：'+entry.name)),12000);
      image.src=ROOT+entry.name;
    };
    next(0);
  }catch(error){fail(error);}
  return task;
}
module.exports={loadSceneAssets};
