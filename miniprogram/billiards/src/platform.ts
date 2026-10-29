/** Babylon resolves material defines before this submission. Some mobile GLSL ES
 * compilers reject its extension directives placed after precision/uniforms.
 * Keep every requested extension and its order; only move directives into the
 * prologue, after #version when present. Comments and all shader math stay intact.
 */
export function prepareWebGL1Shader(source:string):string {
  const extensions:string[]=[];
  const body=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|^[ \t]*#[ \t]*extension[^\r\n]*(?:\r?\n|$)/gm,part=>{
    if(!/^[ \t]*#/.test(part))return part;
    extensions.push(part.trim());return "";
  });
  if(!extensions.length)return source;
  const prologue=extensions.join("\n")+"\n";
  const version=body.match(/^(\s*#[ \t]*version[^\r\n]*(?:\r?\n|$))/);
  return version?version[1]+prologue+body.slice(version[1].length):prologue+body;
}

/** Babylon consumes a browser Canvas; WeChat exposes a host Canvas node.
 * Keep all browser shims on our own objects, never mutate native Canvas/GL.
 * Canvas acquisition/contexts: https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.getContext.html
 * Unsupported WebGL extensions return null: https://registry.khronos.org/webgl/specs/latest/1.0/#5.14.14
 */
export function createWechatWebGLAdapter(nativeCanvas: any, nativeGL: any, size: {width:number;height:number}, note?: (value:any)=>void) {
  if (!nativeCanvas || !nativeGL) throw new Error("Canvas 或 WebGL 上下文为空");
  const localCanvas: any = { style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {}, blur() {}, getBoundingClientRect: () => ({left:0,top:0,right:size.width,bottom:size.height,width:size.width,height:size.height}) };
  Object.defineProperties(localCanvas, {
    width: {get:()=>nativeCanvas.width,set:(value:number)=>{nativeCanvas.width=value;},enumerable:true},
    height: {get:()=>nativeCanvas.height,set:(value:number)=>{nativeCanvas.height=value;},enumerable:true},
    clientWidth: {get:()=>size.width,enumerable:true}, clientHeight: {get:()=>size.height,enumerable:true},
  });
  const assigned: Record<PropertyKey,any> = Object.create(null), methods = new Map<PropertyKey,{original:any;bound:any}>();
  const gl: any = new Proxy(assigned, {
    get(target,key) {
      if (key === "canvas") return localCanvas;
      if (key === "getContext") return undefined; // select Babylon's existing-context constructor path
      if (key === "renderbufferStorageMultisample") return undefined; // requested context is WebGL 1
      if (Object.prototype.hasOwnProperty.call(target,key)) return target[key];
      const value = Reflect.get(nativeGL,key,nativeGL);
      if (typeof value !== "function") return value;
      const cached=methods.get(key);if(cached&&cached.original===value)return cached.bound;
      let bound: any;
      if(key === "getExtension") bound=(name:string)=>{
        try{return value.call(nativeGL,name)??null;}
        catch(error){note?.({compatibility:"extension-query-rejected",name,message:error instanceof Error?error.message:String(error)});return null;}
      };
      else if(key === "shaderSource") bound=(shader:any,source:string)=>value.call(nativeGL,shader,prepareWebGL1Shader(source));
      else bound=value.bind(nativeGL);
      methods.set(key,{original:value,bound});return bound;
    },
    set(target,key,value){target[key]=value;return true;},
    has(target,key){return key==="canvas"||key in target||key in nativeGL;},
  });
  localCanvas.getContext=(type:string)=>type==="webgl"||type==="experimental-webgl"?gl:null;
  note?.({nativeCanvasExtensible:Object.isExtensible(nativeCanvas),nativeGLCanvas:Boolean(nativeGL.canvas),nativeCanvasEvents:typeof nativeCanvas.addEventListener,nativeGLVersion:readGl(nativeGL,"VERSION"),nativeGLVendor:readGl(nativeGL,"VENDOR")});
  return {canvas:localCanvas,gl};
}
function readGl(gl:any,key:string) {try{return typeof gl.getParameter==="function"&&gl[key]!==undefined?String(gl.getParameter(gl[key])):"unavailable";}catch{return "unavailable";}}
