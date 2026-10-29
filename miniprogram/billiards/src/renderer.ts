// The same Babylon dependency as the Web source. No DOM, remote files, or WebView.
import { createWechatWebGLAdapter } from "./platform";
import { Layer } from "@babylonjs/core/Layers/layer";
import { CanvasBilliardsHud, type HudAction, type HudMenu } from "./hud";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { BilliardsSession, SNOOKER_POCKETS } from "./core";

const TABLE_Y=.881;
export type ClubAssets={manifest:any;geometry:ArrayBuffer;images:Record<string,{width:number;height:number;pixels:Uint8Array}>};
const digits: Record<string,string> = {"0":"111101101101111","1":"010110010010111","2":"111001111100111","3":"111001111001111","4":"101101111001001","5":"111100111001111","6":"111100111101111","7":"111001001001001","8":"111101111101111","9":"111101111001111"};
function ballPixels(ball: any): Uint8Array {
  const w = 128, h = 64, bytes = new Uint8Array(w * h * 4);
  const hex = ball.color.slice(1), color = [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const stripeWhite = ball.kind === "stripe" && (y < 22 || y > 42);
    let rgb = stripeWhite ? [246,242,220] : color;
    if (ball.id.startsWith("pool-") && (Math.hypot(x - 32,y - 32)<10 || Math.hypot(x - 96,y - 32)<10)) rgb = [250,248,232];
    const at=(y*w+x)*4; bytes.set([...rgb,255],at);
  }
  if (ball.id.startsWith("pool-")) {
    const number=ball.id.slice(5);
    for(const center of [32,96]) for(let c=0;c<number.length;c++) for(let y=0;y<5;y++) for(let x=0;x<3;x++) if(digits[number[c]][y*3+x]==="1") {
      const xx=center - number.length*4 + c*8 + x*2, yy=27+y*2;
      for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) bytes.set([20,25,28,255],((yy+dy)*w+xx+dx)*4);
    }
  }
  return bytes;
}
function poolBallImage(ball:any,canvas?:any):{pixels:Uint8Array;width:number;height:number}{
  if(!canvas)return{pixels:ballPixels(ball),width:128,height:64};
  const width=512,height=256;canvas.width=width;canvas.height=height;
  const c=canvas.getContext("2d");c.setTransform(1,0,0,1,0,0);
  c.fillStyle=ball.kind==="stripe"?"#f6f2dc":ball.color;c.fillRect(0,0,width,height);
  if(ball.kind==="stripe"){c.fillStyle=ball.color;c.fillRect(0,88,width,80);}
  for(const x of [128,384]){c.beginPath();c.arc(x,128,40,0,Math.PI*2);c.fillStyle="#faf8e8";c.fill();c.fillStyle="#14191c";c.font="bold 56px sans-serif";c.textAlign="center";c.textBaseline="middle";c.fillText(ball.id.slice(5),x,130);}
  const data=c.getImageData(0,0,width,height).data;
  return{pixels:new Uint8Array(data.buffer,data.byteOffset,data.byteLength),width,height};
}
export class BilliardsRenderer {
  engine!: Engine;
  scene!: Scene;
  camera!: FreeCamera;
  session!: BilliardsSession;
  canvas: any;
  width: number;
  height: number;
  ratio: number;
  disposed = false;
  topView = false; // legacy property name: now the original free-observation mode
  cameraAlpha=-Math.PI/2;
  cameraBeta=.74;
  private shells=new Map<string,Mesh>();
  private highlights=new Map<string,Mesh>();
  private placement?:{x:number;z:number};
  private placementMesh?:Mesh;
  private textures=new Map<string,RawTexture>();
  private balls = new Map<string,any>();
  private shadows = new Map<string,any>();
  private cue: any;
  private guide: any;
  private targetGuide: any;
  private deflectionGuide:any;
  private impactRing:any;
  hud?: CanvasBilliardsHud;
  private hudTexture?: RawTexture;
  private hudLayer?: Layer;
  private hudSound = true;
  private hudCapsuleBottom = 0;
  private hudMenu:HudMenu|null=null;
  private onStage: (stage:string,details?:any)=>void = ()=>{};
  private firstFrame = true;
  private tableChecked = false;
  private renderStartedAt?:number;
  private viewProjection = Matrix.Identity();
  private materials: StandardMaterial[] = [];
  constructor(canvas: any, options: {width:number;height:number;pixelRatio:number;mode:"eight"|"snooker";session?:BilliardsSession;hudCanvas?:any;assets?:ClubAssets;onHudAction?:(action:HudAction)=>void;onStage?:(stage:string,details?:any)=>void}) {
    this.canvas=canvas; this.width=options.width; this.height=options.height; this.ratio=Math.max(1,options.pixelRatio||1);
    const previousEngines=new Set(EngineStore.Instances);
    try {
    canvas.width=Math.round(this.width*this.ratio); canvas.height=Math.round(this.height*this.ratio);
    const stage=options.onStage??(()=>{});this.onStage=stage;
    stage("webgl-context",{width:canvas.width,height:canvas.height});
    const nativeContext=canvas.getContext("webgl",{alpha:false,antialias:true,depth:true,stencil:true,preserveDrawingBuffer:false});
    if (!nativeContext) throw new Error("Canvas.getContext('webgl') 返回空上下文");
    stage("webgl-adapter");
    const adapted=createWechatWebGLAdapter(canvas,nativeContext,this,details=>stage("webgl-adapter",details));
    stage("babylon-engine");
    this.engine=new Engine(adapted.gl,true,{doNotHandleContextLost:true,doNotHandleTouchAction:true,audioEngine:false,disableWebGL2Support:true});
    stage("babylon-scene",{webGLVersion:this.engine.webGLVersion,maxTextureSize:this.engine.getCaps().maxTextureSize});
    this.ratio=Math.min(this.ratio,this.engine.getCaps().maxTextureSize/Math.round(this.width),this.engine.getCaps().maxTextureSize/Math.round(this.height));
    // Prevent accidental DOM canvas creation for texture fallbacks.
    this.engine.createCanvas=()=>{ throw new Error("Billiards textures must use local RawTexture data"); };
    this.scene=new Scene(this.engine); this.scene.detachControl();
    this.scene.onNewMaterialAddedObservable.add(material=>{material.onError=(_effect,errors)=>this.onStage("material-error",{name:material.name,errors});});
    this.scene.clearColor=new Color4(.012,.045,.034,1);this.scene.ambientColor=new Color3(.12,.16,.13);
    this.camera=new FreeCamera("room-camera",Vector3.Zero(),this.scene);this.camera.minZ=.02;this.camera.maxZ=60;this.camera.fov=.64;
    const hemi=new HemisphericLight("ambient",new Vector3(0,1,0),this.scene);hemi.intensity=.72;hemi.diffuse=Color3.FromHexString("#f6e5bd");hemi.groundColor=Color3.FromHexString("#102a20");
    const keyLight=new DirectionalLight("table-light",new Vector3(.16,-1,.22),this.scene);keyLight.position.set(-.8,4,-1.3);keyLight.intensity=1.15;
    const tableLight=new PointLight("table-overhead-light",new Vector3(-.15,2.65,-.28),this.scene);tableLight.diffuse=Color3.FromHexString("#ffe6b4");tableLight.specular=Color3.FromHexString("#fff4da");tableLight.intensity=.68;tableLight.range=5.8;
    const rim=new DirectionalLight("ball-rim-light",new Vector3(-.4,-.65,-.65),this.scene);rim.diffuse=Color3.FromHexString("#b8d8c8");rim.specular=Color3.FromHexString("#effff7");rim.intensity=.38;
    this.session=options.session||new BilliardsSession(options.mode);
    if(!options.assets)throw new Error("原球房本地资源未准备完成");
    stage("club-raw-textures");for(const [name,image] of Object.entries(options.assets.images)){const texture=RawTexture.CreateRGBATexture(image.pixels,image.width,image.height,this.scene,true,true,Texture.TRILINEAR_SAMPLINGMODE);texture.anisotropicFilteringLevel=8;this.textures.set(name,texture);}
    stage("table-meshes");this.buildTable(options.assets);stage("ball-meshes");this.buildBalls(options.hudCanvas);this.buildCue();
    this.guide=this.guideTube("aim-line","#f8cf72",.008);this.targetGuide=this.guideTube("target-aim-line","#fff4dd",.006);this.deflectionGuide=this.guideTube("cue-deflection-line","#56e4b1",.006);
    const circle=[];for(let i=0;i<=32;i++){const angle=i/32*Math.PI*2;circle.push(new Vector3(Math.cos(angle)*this.session.physics.radius*1.08,0,Math.sin(angle)*this.session.physics.radius*1.08));}this.impactRing=CreateTube("aim-impact-ring",{path:circle,radius:.0045,tessellation:6},this.scene);this.impactRing.material=this.guideMaterial("impact-ring-material","#f8cf72",.86);this.impactRing.renderingGroupId=2;
    if(options.hudCanvas){
      stage("hud-2d-context");
      this.hud=new CanvasBilliardsHud(options.hudCanvas,action=>options.onHudAction?.(action));
      this.hud.resize(this.width,this.height,this.ratio);
      stage("hud-texture");
      this.hudTexture=RawTexture.CreateRGBATexture(new Uint8Array(this.hud.canvas.width*this.hud.canvas.height*4),this.hud.canvas.width,this.hud.canvas.height,this.scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
      this.hudTexture.hasAlpha=true;this.hudTexture.vScale=-1;this.hudTexture.vOffset=1;
      this.hudTexture.wrapU=Texture.CLAMP_ADDRESSMODE;this.hudTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
      stage("hud-layer");
      this.hudLayer=new Layer("native-canvas-HUD",null,this.scene,false);this.hudLayer.texture=this.hudTexture;this.hudLayer.applyPostProcess=false;
    }
    stage("viewport");this.resize(this.width,this.height,this.ratio);stage("renderer-ready");
    } catch(error) {
      // A throwing constructor has no page._renderer yet. Release its partially-built
      // scene and even Engine instances that threw before new Engine(...) returned.
      try{this.scene?.dispose();}catch(_){}
      for(const engine of [...EngineStore.Instances])if(!previousEngines.has(engine)){try{engine.dispose();}catch(_){}}
      this.disposed=true;
      throw error;
    }
  }
  private material(name:string,color:string,shine=.08) {const m=new StandardMaterial(name,this.scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(shine,shine,shine);this.materials.push(m);return m;}
  private guideMaterial(name:string,color:string,alpha=.9){const m=this.material(name,color);m.emissiveColor=Color3.FromHexString(color);m.alpha=alpha;m.disableLighting=true;m.disableDepthWrite=true;return m;}
  private guideTube(name:string,color:string,radius:number){const tube=CreateTube(name,{path:[Vector3.Zero(),new Vector3(.001,0,0)],radius,tessellation:8,cap:Mesh.CAP_ALL,updatable:true},this.scene);tube.material=this.guideMaterial(name+"-material",color);tube.renderingGroupId=2;tube.alwaysSelectAsActiveMesh=true;return tube;}
  private texture(name:string,scale=1,level=1){const t=this.textures.get(name);if(!t)throw new Error("缺少原材质："+name);t.uScale=scale;t.vScale=scale;t.level=level;return t;}
  private buildTable(assets:ClubAssets) {
    const materials=new Map<string,StandardMaterial>();
    for(const source of assets.manifest.materials){const m=new StandardMaterial(source.id,this.scene);for(const [key,field] of [["diffuseColor","diffuse"],["ambientColor","ambient"],["specularColor","specular"],["emissiveColor","emissive"]] as const){const v=source[field];if(v)(m as any)[key]=new Color3(...v as [number,number,number]);}m.specularPower=source.specularPower;m.backFaceCulling=source.backFaceCulling;if(source.diffuseTexture&&this.textures.has(source.diffuseTexture.name))m.diffuseTexture=this.texture(source.diffuseTexture.name);materials.set(source.id,m);}
    const frame=this.material("table-frame-material","#9b8877");frame.diffuseTexture=this.texture("table-wood.jpg",4);frame.bumpTexture=this.texture("frame-normal.jpg",4,.54);frame.invertNormalMapX=true;frame.invertNormalMapY=true;frame.specularColor=Color3.FromHexString("#594437");frame.specularPower=46;frame.maxSimultaneousLights=2;
    const felt=this.material("table-felt-material","#0d563d");felt.diffuseTexture=this.texture("felt-diffuse.jpg",30);felt.bumpTexture=this.texture("felt-normal.jpg",30,.34);felt.specularColor=Color3.FromHexString("#173c2d");felt.specularPower=14;felt.maxSimultaneousLights=2;
    const pocket=this.material("table-pocket-material","#101310");pocket.bumpTexture=this.texture("pocket-normal.jpg",1,.76);pocket.specularTexture=this.texture("pocket-glossy.jpg",1,.58);pocket.emissiveTexture=pocket.specularTexture;pocket.invertNormalMapX=true;pocket.invertNormalMapY=true;pocket.ambientColor=Color3.FromHexString("#050706");pocket.emissiveColor=Color3.FromHexString("#252925");pocket.specularColor=Color3.FromHexString("#b9c0bb");pocket.specularPower=96;pocket.maxSimultaneousLights=2;
    // Upload independent, zero-offset views: native WebGL bridges must not see the whole club.bin backing store.
    for(const source of assets.manifest.meshes){const mesh=new Mesh(source.name,this.scene),data=new VertexData();for(const key of ["positions","normals","uvs","indices"] as const){const v=source.buffers[key];if(v)(data as any)[key]=v.type==="H"?new Uint16Array(assets.geometry,v.offset,v.length).slice():new Float32Array(assets.geometry,v.offset,v.length).slice();}data.applyToMesh(mesh);mesh.convertToUnIndexedMesh();mesh.position.fromArray(source.position);mesh.rotation.fromArray(source.rotation);mesh.scaling.fromArray(source.scaling);mesh.isPickable=false;mesh.receiveShadows=true;mesh.material=source.name==="Frame"?frame:source.name==="TableInner"?felt:source.name==="Pocket"?pocket:materials.get(source.materialId)??null;}
    const cloth=CreateGround("interactive-cloth",{width:this.session.physics.halfX*2,height:this.session.physics.halfZ*2},this.scene);cloth.position.y=TABLE_Y;const cm=this.material("cloth-material","#123a2b");cm.specularColor=Color3.FromHexString("#10271f");cm.specularPower=12;cloth.material=cm;
    if(this.session.mode==="snooker"){const points=[new Vector3(-.92,TABLE_Y+.004,-this.session.physics.halfZ+.045),new Vector3(-.92,TABLE_Y+.004,this.session.physics.halfZ-.045)];const line=CreateLines("baulk-line",{points},this.scene);line.color=Color3.FromHexString("#eee6d3");const arc=[];for(let i=0;i<=48;i++){const a=Math.PI/2+Math.PI*i/48;arc.push(new Vector3(-.92+Math.cos(a)*.3,TABLE_Y+.004,Math.sin(a)*.3));}CreateLines("snooker-d-line",{points:arc},this.scene).color=line.color;}
  }
  private buildCue(){
    this.cue=new TransformNode("cue-root",this.scene);
    const specs:[[string,string,string,number],...any[]]=[["leather-tip","#26352d","#718478",34],["ferrule","#f3eee0","#ffffff",96],["ash-shaft","#ddc79b","#fff3d2",72],["brass-joint","#b68742","#fff0b0",112],["butt","#bd9071","#dcb58b",78],["cap","#171b19","#8f9a92",64]];
    const materials=specs.map(([name,diffuse,specular,power]:any)=>{const m=this.material("cue-"+name,diffuse);m.specularColor=Color3.FromHexString(specular);m.specularPower=power;return m;});materials[4].diffuseTexture=this.texture("cue-wood-strip.jpg");materials[4].diffuseTexture!.wrapV=Texture.CLAMP_ADDRESSMODE;
    const parts=[[0,.022,.016,.0165,16],[.022,.042,.0165,.0185,20],[.064,.81,.0185,.0255,24],[.874,.032,.0255,.0275,20],[.906,.48,.0275,.034,24],[1.386,.075,.034,.035,24]];
    parts.forEach(([start,length,near,far,tessellation],i)=>{const mesh=CreateCylinder("cue-"+i,{height:length,diameterBottom:near,diameterTop:far,tessellation},this.scene);mesh.position.x=-(start+length/2);mesh.rotation.z=Math.PI/2;mesh.material=materials[i];mesh.parent=this.cue;});
  }
  private buildBalls(textureCanvas?:any) {
    const coat=this.material("ball-clear-coat-material","#000000");coat.specularColor=Color3.FromHexString("#fffaf0");coat.specularPower=256;coat.alpha=.14;coat.backFaceCulling=false;coat.disableDepthWrite=true;
    const highlightMat=this.material("ball-highlight-material","#ffffff");highlightMat.emissiveColor=Color3.FromHexString("#fff8e9");highlightMat.alpha=.72;highlightMat.disableLighting=true;highlightMat.disableDepthWrite=true;
    const pixels=new Uint8Array(96*64*4);for(let y=0;y<64;y++)for(let x=0;x<96;x++){const r=Math.hypot(x-48,y-32)/46;const alpha=r<=.042?.72:r<.42?.72+(.38-.72)*(r-.042)/(.42-.042):Math.max(0,.38*(1-r)/.58);pixels[(y*96+x)*4+3]=Math.round(alpha*255);}
    const shadowMat=this.material("ball-contact-shadow-material","#ffffff"),shadowTexture=RawTexture.CreateRGBATexture(pixels,96,64,this.scene,false,false,Texture.BILINEAR_SAMPLINGMODE);shadowTexture.hasAlpha=true;shadowMat.diffuseTexture=shadowTexture;shadowMat.opacityTexture=shadowTexture;shadowMat.useAlphaFromDiffuseTexture=true;shadowMat.disableLighting=true;shadowMat.alpha=.72;shadowMat.disableDepthWrite=true;
    for(const ball of this.session.physics.balls){const color=Color3.FromHexString(ball.color),m=this.material(ball.id,ball.color);m.diffuseColor=color.scale(.82);m.specularColor=Color3.FromHexString("#fff5dc");m.specularPower=ball.kind==="cue"?148:176;m.ambientColor=color.scale(ball.kind==="cue"?.22:.12);m.emissiveColor=color.scale(.025);
      if(ball.id.startsWith("pool-")){m.diffuseColor=Color3.White();const image=poolBallImage(ball,textureCanvas);m.diffuseTexture=RawTexture.CreateRGBATexture(image.pixels,image.width,image.height,this.scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);}
      const mesh=CreateSphere(ball.id,{diameter:this.session.physics.radius*2,segments:32},this.scene);mesh.material=m;this.balls.set(ball.id,mesh);
      const shell=CreateSphere(ball.id+"-shell",{diameter:this.session.physics.radius*2.055,segments:32},this.scene);shell.material=coat;shell.renderingGroupId=1;this.shells.set(ball.id,shell);
      const shadow=CreateGround(ball.id+"-shadow",{width:this.session.physics.radius*3.3,height:this.session.physics.radius*2.15},this.scene);shadow.material=shadowMat;this.shadows.set(ball.id,shadow);
      const hl=CreateDisc(ball.id+"-highlight",{radius:this.session.physics.radius*.19,tessellation:16,sideOrientation:Mesh.DOUBLESIDE},this.scene);hl.material=highlightMat;hl.scaling.set(1.6,.58,1);hl.billboardMode=Mesh.BILLBOARDMODE_ALL;hl.renderingGroupId=2;this.highlights.set(ball.id,hl);
    }
    this.placementMesh=CreateSphere("cue-placement-preview",{diameter:this.session.physics.radius*2,segments:24},this.scene);const preview=this.material("cue-preview-material","#e6e2bd");preview.alpha=.55;this.placementMesh.material=preview;this.placementMesh.setEnabled(false);
  }
  resize(width:number,height:number,pixelRatio=this.ratio) {
    this.width=width;this.height=height;this.ratio=Math.min(Math.max(1,pixelRatio||1),this.engine.getCaps().maxTextureSize/Math.round(width),this.engine.getCaps().maxTextureSize/Math.round(height));
    this.engine.setSize(Math.round(width*this.ratio),Math.round(height*this.ratio),true);
    this.updateCamera();
    if(this.hud){
      this.hud.resize(width,height,this.ratio);
      const pixelWidth=this.hud.canvas.width,pixelHeight=this.hud.canvas.height;
      if(this.hudTexture&&(this.hudTexture.getSize().width!==pixelWidth||this.hudTexture.getSize().height!==pixelHeight)){
        this.hudTexture.dispose();
        this.hudTexture=RawTexture.CreateRGBATexture(new Uint8Array(pixelWidth*pixelHeight*4),pixelWidth,pixelHeight,this.scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
        this.hudTexture.hasAlpha=true;this.hudTexture.vScale=-1;this.hudTexture.vOffset=1;
        this.hudTexture.wrapU=Texture.CLAMP_ADDRESSMODE;this.hudTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
        if(this.hudLayer)this.hudLayer.texture=this.hudTexture;
      }
    }
  }
  setHudMenu(menu:HudMenu|null){this.hudMenu=menu;}
  resetView(){this.topView=false;this.cameraAlpha=-Math.PI/2;this.cameraBeta=.74;this.updateCamera();}
  setHudCapsuleBottom(bottom:number){this.hudCapsuleBottom=Math.max(0,bottom);}
  setHudSound(enabled:boolean){this.hudSound=enabled;}
  hudPointer(type:"down"|"move"|"up"|"cancel",x:number,y:number){return this.hud?.pointer(type,x,y)??false;}
  private updateCamera(){const radius=4.3,target=new Vector3(0,.84,.04);this.camera.position.set(target.x+radius*Math.cos(this.cameraAlpha)*Math.sin(this.cameraBeta),target.y+radius*Math.cos(this.cameraBeta),target.z+radius*Math.sin(this.cameraAlpha)*Math.sin(this.cameraBeta));this.camera.setTarget(target);}
  setView(enabled:boolean){this.topView=enabled;}
  orbit(dx:number,dy:number){if(!this.topView)return;this.cameraAlpha-=dx*.0065;this.cameraBeta=Math.max(.22,Math.min(1.22,this.cameraBeta+dy*.0055));this.updateCamera();}
  placementPreview(point?:{x:number;z:number}){this.placement=point;}
  worldPoint(point:{x:number;z:number}){const projected=Vector3.Project(new Vector3(point.x,TABLE_Y+this.session.physics.radius,point.z),Matrix.Identity(),this.camera.getViewMatrix().multiply(this.camera.getProjectionMatrix()),this.camera.viewport.toGlobal(this.canvas.width,this.canvas.height));return{x:projected.x/this.ratio,y:projected.y/this.ratio};}
  groundPoint(x:number,y:number,aim=false) {
    const world=Matrix.Identity(),view=this.camera.getViewMatrix(),projection=this.camera.getProjectionMatrix();
    const a=Vector3.Unproject(new Vector3(x*this.ratio,y*this.ratio,0),this.canvas.width,this.canvas.height,world,view,projection);
    const b=Vector3.Unproject(new Vector3(x*this.ratio,y*this.ratio,1),this.canvas.width,this.canvas.height,world,view,projection);
    const amount=(TABLE_Y+(aim?this.session.physics.radius:0)-a.y)/(b.y-a.y);
    return {x:a.x+(b.x-a.x)*amount,z:a.z+(b.z-a.z)*amount};
  }
  render(dt:number,now:number) {
    if(this.disposed)return;
    if(this.firstFrame)this.onStage("first-frame-physics");
    this.renderStartedAt??=now;
    if(!this.tableChecked&&now-this.renderStartedAt>=2500){
      this.tableChecked=true;
      const models=["Frame","Pocket","TableInner"].map(name=>{
        const mesh=this.scene.getMeshByName(name) as Mesh;
        const ready=mesh.isReady(true),original=mesh.material as StandardMaterial;
        if(!ready){
          const fallback=this.material(name+"-compatible-material",name==="Frame"?"#9b8877":name==="Pocket"?"#101310":"#0d563d");
          fallback.disableLighting=true;fallback.backFaceCulling=false;
          fallback.emissiveColor=fallback.diffuseColor.clone();
          if(name==="Frame"&&original.diffuseTexture?.isReady())fallback.diffuseTexture=original.diffuseTexture;
          mesh.material=fallback;
        }
        const active=this.scene.getActiveMeshes();
        return {name,ready,vertices:mesh.getTotalVertices(),unindexed:mesh.isUnIndexed,active:active.data.slice(0,active.length).includes(mesh)};
      });
      const detail={models,ratio:this.ratio,canvas:[this.canvas.width,this.canvas.height],drawingBuffer:[(this.engine as any)._gl.drawingBufferWidth,(this.engine as any)._gl.drawingBufferHeight]};
      this.onStage("table-render-check",detail);console.info("[billiards] table-render-check",JSON.stringify(detail));
    }
    this.session.update(dt,now);
    for(const ball of this.session.physics.balls) {
      const mesh=this.balls.get(ball.id),shadow=this.shadows.get(ball.id),shell=this.shells.get(ball.id)!,hl=this.highlights.get(ball.id)!;
      for(const part of [mesh,shadow,shell,hl])part.setEnabled(!ball.pocketed);if(ball.pocketed)continue;
      mesh.position.set(ball.position.x,TABLE_Y+this.session.physics.radius,ball.position.z);shell.position.copyFrom(mesh.position);
      shadow.position.set(ball.position.x+.006,TABLE_Y+.0012,ball.position.z+.006);hl.position.set(ball.position.x-.008,TABLE_Y+this.session.physics.radius*1.62,ball.position.z-.009);
      const speed=Math.hypot(ball.velocity.x,ball.velocity.z);if(speed>.001)mesh.rotate(new Vector3(ball.velocity.z,0,-ball.velocity.x).normalize(),speed*dt/this.session.physics.radius,1);
    }
    if(this.placementMesh){this.placementMesh.setEnabled(Boolean(this.placement));if(this.placement)this.placementMesh.position.set(this.placement.x,TABLE_Y+this.session.physics.radius,this.placement.z);}
    const state=this.session.snapshot(),cueBall=this.session.physics.cueBall;
    const show= !this.topView && !state.paused && !cueBall.pocketed && !this.session.physics.isMoving() && state.phase!=="finished";
    this.cue.setEnabled(show);this.guide.setEnabled(show&&!state.thinking);this.targetGuide.setEnabled(show&&!state.thinking);this.deflectionGuide.setEnabled(show&&!state.thinking);this.impactRing.setEnabled(show&&!state.thinking);
    if(show){
      const dx=Math.cos(this.session.angle),dz=Math.sin(this.session.angle),pull=this.session.stroke.offset;
      const gap=this.session.physics.radius+.022+pull;this.cue.position.set(cueBall.position.x-dx*gap,TABLE_Y+this.session.physics.radius,cueBall.position.z-dz*gap);this.cue.rotation.y=-this.session.angle;
      const preview=this.session.physics.predictShot({x:dx,z:dz},this.session.sideSpin,this.session.power,this.session.followSpin);
      const map=(p:any)=>new Vector3(p.x,TABLE_Y+this.session.physics.radius,p.z);
      const trim=(start:any,end:any,from:number,to:number)=>{const length=Math.hypot(end.x-start.x,end.z-start.z)||1,dx=(end.x-start.x)/length,dz=(end.z-start.z)/length;return[map({x:start.x+dx*Math.min(from,length*.35),z:start.z+dz*Math.min(from,length*.35)}),map({x:end.x-dx*Math.min(to,length*.28),z:end.z-dz*Math.min(to,length*.28)})];};
      this.guide=CreateTube("aim-line",{path:trim(preview.primary.start,preview.primary.end,this.session.physics.radius+.015,.012),instance:this.guide},this.scene);
      this.targetGuide.setEnabled(Boolean(preview.target));if(preview.target)this.targetGuide=CreateTube("target-aim-line",{path:trim(preview.target.start,preview.target.end,this.session.physics.radius+.014,0),instance:this.targetGuide},this.scene);
      this.deflectionGuide.setEnabled(Boolean(preview.cueAfterImpact));if(preview.cueAfterImpact)this.deflectionGuide=CreateTube("cue-deflection-line",{path:trim(preview.cueAfterImpact.start,preview.cueAfterImpact.end,this.session.physics.radius*1.08+.01,0),instance:this.deflectionGuide},this.scene);
      this.impactRing.position.set(preview.impact.x,TABLE_Y+this.session.physics.radius,preview.impact.z);

    }
    if(this.hud&&this.hudTexture&&this.hud.update({...state,canShoot:state.canShoot&&!this.topView},{sound:this.hudSound,top:this.topView,capsuleBottom:this.hudCapsuleBottom,menu:this.hudMenu,spinX:Math.round(this.session.sideSpin*100),spinY:Math.round(this.session.followSpin*100)})){if(this.firstFrame)this.onStage("hud-pixel-readback");const pixels=this.hud.pixels();if(this.firstFrame)this.onStage("hud-pixel-upload",{bytes:pixels.byteLength});this.hudTexture.update(pixels);}
    if(this.firstFrame)this.onStage("scene-first-render");this.scene.render();
    if(this.firstFrame){this.firstFrame=false;this.onStage("running");}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.scene.dispose();this.engine.dispose();}
}
