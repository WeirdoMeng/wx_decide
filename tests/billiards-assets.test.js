const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../miniprogram/billiards/assets/club'),manifest=require(root+'/scene.js'),source=JSON.parse(fs.readFileSync('/Users/apple/Desktop/WebSpace/mobile-3d-billiards/public/assets/models/club.babylon'));
const bytes=fs.readFileSync(root+'/club.bin'),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
assert.equal(bytes.length,manifest.geometryBytes);assert.equal(sha(bytes),manifest.geometrySha256);assert.equal(manifest.meshes.length,13);
for(const mesh of manifest.meshes){const original=source.meshes.find(item=>item.name===mesh.name);assert.ok(original);for(const key of ['position','rotation','scaling'])assert.deepEqual(mesh[key],original[key]);for(const [key,view] of Object.entries(mesh.buffers)){const data=view.type==='H'?new Uint16Array(buffer,view.offset,view.length):new Float32Array(buffer,view.offset,view.length);assert.equal(data.length,original[key].length);for(let i=0;i<data.length;i++)assert.equal(data[i],view.type==='H'?original[key][i]:Math.fround(original[key][i]),mesh.name+' '+key+' '+i);}}
for(const texture of manifest.textures){assert.equal(sha(fs.readFileSync(root+'/'+texture.name)),texture.sha256);assert.ok(texture.width<=512&&texture.height<=512);}
assert.ok(!manifest.meshes.some(m=>['MainLight','RoofLights'].includes(m.name)),'matches original disabled lights');
console.log('Original club asset fidelity passed: 13 meshes, every Float32 vertex/normal/UV and Uint16 index, transforms, all 12 texture checksums.');
const {loadSceneAssets}=require('../miniprogram/billiards/scene-assets');let image,successes=0,failures=0,cleared=0;
const api={getFileSystemManager:()=>({readFileSync:()=>buffer}),createOffscreenCanvas:()=>({createImage(){image={};return image;},getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(4)})})})};
const task=loadSceneAssets(null,api,{onStage(){},onSuccess(){successes++;},onError(){failures++;}});const stale=image.onload;task.cancel();assert.equal(image.onload,null);assert.equal(image.onerror,null);stale();assert.equal(successes,0);assert.equal(failures,0);
let error;loadSceneAssets(null,{...api,getFileSystemManager:()=>({readFileSync:()=>new ArrayBuffer(0)})},{onStage(){},onSuccess(){throw Error('must reject truncated geometry');},onError(value){error=value;}});assert.match(error.message,/几何读取不完整/);
console.log('Local asset decoder cancellation passed: detached image callbacks, stale callback ignored, malformed binary rejected.');
// WeChat filesystem buffers can belong to the main JS context, not this subpackage.
const foreign=require('node:vm').runInNewContext('new ArrayBuffer('+manifest.geometryBytes+')');
assert.equal(foreign instanceof ArrayBuffer,false);let foreignError;
const foreignTask=loadSceneAssets(null,{...api,getFileSystemManager:()=>({readFileSync:()=>foreign})},{onStage(){},onSuccess(){},onError(error){foreignError=error;}});
assert.equal(foreignError,undefined,'valid cross-context buffers must reach texture loading');foreignTask.cancel();


// Unlike Node.js, the actual WeChat 3.17.5 module resolver only loads JS definitions.
// Its official SDK appends .js even to a .json require. Exercise startup with that contract.
const vm=require('node:vm'),miniRoot=path.resolve(__dirname,'../miniprogram'),moduleCache=new Map();
function miniRequire(from,id){const relative=path.posix.normalize(path.posix.join(from,id)),name=relative.endsWith('.js')?relative:relative+'.js';if(moduleCache.has(name))return moduleCache.get(name).exports;const filename=path.join(miniRoot,name);if(!fs.existsSync(filename))throw new Error("module '"+name+"' is not defined, require args is '"+id+"'");const module={exports:{}};moduleCache.set(name,module);const code=fs.readFileSync(filename,'utf8');vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename})(next=>miniRequire(path.posix.dirname(name),next),module,module.exports);return module.exports;}
assert.throws(()=>miniRequire('billiards','./assets/club/scene.json'),/scene\.json\.js.*is not defined/);assert.equal(fs.existsSync(root+'/scene.json'),false,'do not duplicate the generated manifest in the package');assert.equal(typeof miniRequire('billiards','./scene-assets').loadSceneAssets,'function');assert.deepEqual(miniRequire('billiards','./assets/club/scene'),manifest);
console.log('WeChat JS-only startup passed: scene-assets resolves generated CommonJS manifest; JSON request reproduces native module-not-defined instead of relying on Node JSON support.');
