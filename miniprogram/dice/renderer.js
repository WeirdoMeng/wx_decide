// 轻量WebGL1播放器：使用原Unity网格与原rock/open动画采样，不用静态图片代替盅体。
const scene=require('./scene');
const motion=require('./motion');
const VERTEX=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aColor;
uniform mat4 uModel;uniform mat4 uVP;uniform float uQuant;
varying vec3 vPosition;varying vec3 vNormal;varying vec4 vColor;varying vec3 vLocal;
void main(){vLocal=aPosition*uQuant;vec4 p=uModel*vec4(vLocal,1.);vPosition=p.xyz;vNormal=mat3(uModel)*aNormal;vColor=aColor;gl_Position=uVP*p;}`;
const FRAGMENT=`precision mediump float;
uniform vec3 uEye;uniform vec3 uColor;uniform float uGloss;uniform float uShadow;
varying vec3 vPosition;varying vec3 vNormal;varying vec4 vColor;varying vec3 vLocal;
void main(){if(uShadow>0.5){float a=max(0.,1.-dot(vLocal.xz,vLocal.xz));gl_FragColor=vec4(0.,0.,0.,a*a*.34);return;}
vec3 N=normalize(vNormal),V=normalize(uEye-vPosition),L=normalize(vec3(-.55,1.,.8)),L2=normalize(vec3(.8,.45,-.6));
float diffuse=max(dot(N,L),0.),rim=pow(1.-max(dot(N,V),0.),3.);
vec3 base=uColor*vColor.rgb;vec3 color=base*(.42+.65*diffuse+.22*max(dot(N,L2),0.));
float spec=pow(max(dot(N,normalize(L+V)),0.),uGloss);float spec2=pow(max(dot(N,normalize(L2+V)),0.),uGloss*1.4);
float materialSpec=mix(.08,1.,step(.65,(vColor.r+vColor.g+vColor.b)/3.));
color+=vec3(.68,.72,.8)*spec*.4*materialSpec+vec3(.3,.35,.45)*spec2*.3*materialSpec+vec3(.1,.12,.16)*rim;
gl_FragColor=vec4(color,vColor.a);}`;
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function transform(position,q=[0,0,0,1],scale=[1,1,1]){let [x,y,z,w]=q;const length=Math.hypot(x,y,z,w)||1;x/=length;y/=length;z/=length;w/=length;const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;return new Float32Array([(1-yy-zz)*scale[0],(xy+wz)*scale[0],(xz-wy)*scale[0],0,(xy-wz)*scale[1],(1-xx-zz)*scale[1],(yz+wx)*scale[1],0,(xz+wy)*scale[2],(yz-wx)*scale[2],(1-xx-yy)*scale[2],0,...position,1]);}
function lookAt(eye,target){const normalize=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);},z=normalize(eye.map((v,i)=>v-target[i])),x=normalize([z[2],0,-z[0]]),y=[z[1]*x[2],z[2]*x[0]-z[0]*x[2],-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((a,v,i)=>a+v*eye[i],0),-y.reduce((a,v,i)=>a+v*eye[i],0),-z.reduce((a,v,i)=>a+v*eye[i],0),1]);}
function ortho(width,height){const n=.1,f=140;return new Float32Array([2/width,0,0,0,0,2/height,0,0,0,0,-2/(f-n),0,0,0,-(f+n)/(f-n),1]);}
class DiceRenderer{
 constructor(canvas,buffer,{width,height,pixelRatio=1,onError=()=>{}}){
  this.canvas=canvas;this.width=width;this.height=height;this.onError=onError;this.disposed=false;this.buffers=[];this.shaders=[];this.values=[];this.pose=motion.CLOSED.slice();
  this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true})||canvas.getContext('experimental-webgl');
  if(!this.gl||!this.gl.createShader)throw Error('WebGL画布不可用');
  try{const gl=this.gl;const ratio=Math.max(1,Math.min(4,Number(pixelRatio)||1));canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);gl.viewport(0,0,canvas.width,canvas.height);
   const program=gl.createProgram();this.program=program;
   for(const [type,source]of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]){const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);}
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
   this.attributes={};for(const name of ['Position','Normal','Color']){this.attributes[name]=gl.getAttribLocation(program,'a'+name);gl.enableVertexAttribArray(this.attributes[name]);}
   this.uniforms={};for(const name of ['Model','VP','Quant','Eye','Color','Gloss','Shadow'])this.uniforms[name]=gl.getUniformLocation(program,'u'+name);
   this.vertex=this._buffer(gl.ARRAY_BUFFER,buffer);this.index=this._buffer(gl.ELEMENT_ARRAY_BUFFER,buffer);
   this.shadow=this._shadow();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);this.draw();
  }catch(error){this.dispose();throw error;}
 }
 _buffer(type,data){const gl=this.gl,b=gl.createBuffer();this.buffers.push(b);gl.bindBuffer(type,b);gl.bufferData(type,data,gl.STATIC_DRAW);return b;}
 _shadow(){const count=34,raw=new ArrayBuffer(count*16),view=new DataView(raw),indices=[];for(let i=0;i<count;i++){const a=(i-1)/32*Math.PI*2;view.setInt16(i*16,i?Math.round(Math.cos(a)*32767):0,true);view.setInt16(i*16+4,i?Math.round(Math.sin(a)*32767):0,true);view.setInt16(i*16+8,32767,true);for(let c=0;c<4;c++)view.setUint8(i*16+12+c,255);if(i>=2)indices.push(0,i-1,i);}return {vertex:this._buffer(this.gl.ARRAY_BUFFER,raw),index:this._buffer(this.gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices)),vertexOffset:0,indexOffset:0,indexCount:indices.length,positionScale:1/32767};}
 _mesh(name,model,color,gloss=40,shadow=false){const gl=this.gl,m=shadow?this.shadow:scene.meshes[name];gl.bindBuffer(gl.ARRAY_BUFFER,shadow?m.vertex:this.vertex);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,shadow?m.index:this.index);gl.vertexAttribPointer(this.attributes.Position,3,gl.SHORT,false,16,m.vertexOffset);gl.vertexAttribPointer(this.attributes.Normal,3,gl.SHORT,true,16,m.vertexOffset+6);gl.vertexAttribPointer(this.attributes.Color,4,gl.UNSIGNED_BYTE,true,16,m.vertexOffset+12);gl.uniformMatrix4fv(this.uniforms.Model,false,model);gl.uniform1f(this.uniforms.Quant,m.positionScale);gl.uniform3fv(this.uniforms.Color,color);gl.uniform1f(this.uniforms.Gloss,gloss);gl.uniform1f(this.uniforms.Shadow,shadow?1:0);gl.drawElements(gl.TRIANGLES,m.indexCount,gl.UNSIGNED_SHORT,m.indexOffset);}
 draw(){
  if(this.disposed)return;if(this.gl.isContextLost&&this.gl.isContextLost())throw Error('WebGL context lost');const gl=this.gl,pose=this.pose,open=Math.min(1,Math.abs(pose[7])/20.432564),shake=this.animation&&this.animation.name==='rock_2'?Math.sin(Math.PI*Math.min(1,(Date.now()-this.animation.started)/this.animation.duration)):0;
  const target=[0,6-open*4+shake*1.5,0],angle=(28+open*17)*Math.PI/180,eye=[0,target[1]+Math.sin(angle)*42,Math.cos(angle)*42],height=20-open*2+shake*6;
  this.viewProjection=multiply(ortho(height*this.width/this.height,height),lookAt(eye,target));gl.useProgram(this.program);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.uniforms.VP,false,this.viewProjection);gl.uniform3fv(this.uniforms.Eye,eye);
  const root=transform(pose.slice(0,3),pose.slice(3,7));
  this._mesh('tray',multiply(root,transform([0,-.075873,-.000037])),[.055,.057,.065],65);
  const points=motion.layout(this.values.length);
  for(let i=0;i<this.values.length;i++){
   const particle=this.animation&&this.animation.name==='rock_2'&&this.particles?this.particles[i]:null;
   const p=particle?[particle.x,particle.y,particle.z]:[points[i][0],1.51,points[i][1]],q=particle?motion.quaternion(particle.rx,particle.ry,particle.rz):motion.face(this.values[i],this.yaws[i]);
   gl.depthMask(false);this._mesh(null,multiply(root,transform([p[0],.56,p[2]],[0,0,0,1],[1.65,1,1.65])),[0,0,0],1,true);gl.depthMask(true);
   this._mesh('die',multiply(root,transform(p,q)),[.86,.89,.95],50);
  }
  const cup=multiply(root,multiply(transform(pose.slice(7,10),pose.slice(10,14)),transform([.000074,-.002164,-.000033])));
  this._mesh('cup',cup,[.035,.038,.045],55);
 }
 setState(values,open=false){this.cancel();this.values=values.slice();this.yaws=values.map((_,i)=>i*.27-.45);this.pose=open?motion.sample('open_2',scene.clips.open_2.duration):motion.CLOSED.slice();this.cupOpen=open;this.draw();}
 animate(name,complete){
  this.cancel();const animation={name,started:Date.now(),duration:scene.clips[name].duration*1000,complete};this.animation=animation;let previous=animation.started;
  const frame=()=>{this.frameId=null;if(this.disposed||this.animation!==animation)return;try{const now=Date.now(),elapsed=Math.min(animation.duration,now-animation.started);this.pose=motion.sample(name,elapsed/1000);if(name==='rock_2')motion.step(this.particles,(now-previous)/1000);previous=now;this.draw();if(elapsed>=animation.duration){this.animation=null;if(name==='rock_2'){this.pose=motion.CLOSED.slice();this.cupOpen=false;}else this.cupOpen=name==='open_2';this.draw();if(complete)complete();}else this.frameId=this.canvas.requestAnimationFrame(frame);}catch(error){this.cancel();this.onError(error);}};
  frame();
 }
 roll(values,complete,onShakeStart){const start=()=>{if(onShakeStart)onShakeStart();this.values=values.slice();this.yaws=values.map((_,i)=>i*.27-.45);this.particles=motion.particles(values);this.animate('rock_2',complete);};if(this.cupOpen)this.animate('open_3',start);else start();}
 open(complete){this.animate('open_2',complete);}
 close(complete){this.animate('open_3',complete);}
 cancel(){this.animation=null;if(this.frameId!=null&&this.canvas.cancelAnimationFrame)this.canvas.cancelAnimationFrame(this.frameId);this.frameId=null;}
 dispose(){if(this.disposed)return;this.cancel();this.disposed=true;const gl=this.gl;if(gl){this.buffers.forEach(b=>gl.deleteBuffer(b));if(this.program)gl.deleteProgram(this.program);this.shaders.forEach(s=>gl.deleteShader(s));}this.buffers=[];}
}
module.exports={DiceRenderer,multiply,transform,lookAt};
