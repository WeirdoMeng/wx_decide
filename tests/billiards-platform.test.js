const assert=require('node:assert/strict');
const {createWechatWebGLAdapter,prepareWebGL1Shader}=require('../miniprogram/billiards/core');
const {createDiagnostics,DIAGNOSTIC_KEY}=require('../miniprogram/billiards/diagnostics');
const nativeCanvas=Object.seal({width:844,height:390});
let extensionThis,pixelThis;const nativeGL=Object.freeze({canvas:undefined,VERSION:0x1F02,VENDOR:0x1F00,renderbufferStorageMultisample(){throw Error('must not detect WebGL2');},getParameter(flag){assert.equal(this,nativeGL);return flag===0x1F02?'WebGL 1.0 native':'Native GPU';},getExtension(name){extensionThis=this;if(name==='UNSUPPORTED')throw Error('unknown extension');return name==='known'?{name}:null;},pixelStorei(){pixelThis=this;}});
const notes=[],adapter=createWechatWebGLAdapter(nativeCanvas,nativeGL,{width:844,height:390},note=>notes.push(note));
assert.equal(adapter.gl.canvas,adapter.canvas);assert.equal(adapter.gl.canvas.width,844);adapter.canvas.width=1688;assert.equal(nativeCanvas.width,1688);
assert.equal(typeof adapter.gl.canvas.addEventListener,'function');assert.equal('addEventListener' in nativeCanvas,false);assert.equal('style' in nativeCanvas,false,'host Canvas remains untouched');
assert.equal(adapter.gl.getContext,undefined);assert.equal(adapter.gl.renderbufferStorageMultisample,undefined,'explicit webgl context cannot be misdetected as WebGL2');
assert.deepEqual(adapter.gl.getExtension('known'),{name:'known'});assert.equal(extensionThis,nativeGL);assert.equal(adapter.gl.getExtension('UNSUPPORTED'),null);assert.ok(notes.some(n=>n.compatibility==='extension-query-rejected'));
adapter.gl.pixelStorei(1,2);assert.equal(pixelThis,nativeGL);assert.equal(adapter.gl.pixelStorei,adapter.gl.pixelStorei,'method binding is stable');adapter.gl.drawElementsInstanced=()=>17;assert.equal(adapter.gl.drawElementsInstanced(),17);assert.equal(nativeGL.drawElementsInstanced,undefined,'engine patches belong to the facade');
let saved;const api={getSystemInfoSync:()=>({platform:'android',model:'Phone',system:'Android 15',version:'8.0',SDKVersion:'3.17.5',token:'never collect',userId:'never collect'}),setStorageSync:(key,value)=>{assert.equal(key,DIAGNOSTIC_KEY);saved=JSON.parse(JSON.stringify(value));}};
const diag=createDiagnostics(api,'eight');diag.mark('babylon-engine',{nativeCanvasExtensible:false});const failure=new TypeError('canvas.addEventListener is not a function');diag.fail(failure);assert.equal(saved.stage,'babylon-engine');assert.equal(saved.error.name,'TypeError');assert.match(diag.summary(),/babylon-engine/);assert.match(diag.summary(),/addEventListener/);assert.match(diag.text(),/3.17.5/);assert.equal(diag.text().includes('never collect'),false);assert.equal(saved.mode,'eight');
console.log('Native WebGL facade passed: missing gl.canvas, sealed host Canvas, frozen GL, correct native receivers, engine-only patches, extension rejection, WebGL1 pinning. Staged local diagnostics preserve real errors without collecting account data.');

// Phone log: precision/uniforms before #extension fail even though desktop ANGLE accepts it.
const shader = '#define BUMP\nprecision highp float;\nuniform vec3 color;\n#extension GL_OES_standard_derivatives : enable\nvoid main(){gl_FragColor=vec4(dFdx(color),1.);}',
  fixed=prepareWebGL1Shader(shader);
assert.ok(fixed.indexOf('#extension')<fixed.indexOf('precision'));
assert.equal(fixed.replace('#extension GL_OES_standard_derivatives : enable\n','').replace(/\s+/g,''),shader.replace('#extension GL_OES_standard_derivatives : enable','').replace(/\s+/g,''));
assert.equal(prepareWebGL1Shader(fixed),fixed,'submission normalization is idempotent');
const versioned=prepareWebGL1Shader('#version 100\n'+shader);
assert.ok(versioned.startsWith('#version 100\n#extension'));
assert.equal(prepareWebGL1Shader('// #extension fake\n/*\n#extension comment : enable\n*/\nvoid main(){}'),'// #extension fake\n/*\n#extension comment : enable\n*/\nvoid main(){}');
let submitted;const nativeShaderGL=Object.freeze({shaderSource(shader,source){assert.equal(this,nativeShaderGL);submitted=source;}});
createWechatWebGLAdapter({width:1,height:1},nativeShaderGL,{width:1,height:1}).gl.shaderSource({},shader);
assert.equal(submitted,fixed,'actual native submission receives the repaired source');
