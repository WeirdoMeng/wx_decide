const scene=require('./scene');
const CLOSED=[.000017,.592213,0,0,0,0,1,0,5.953135,0,0,0,0,1];
function sample(name,time){
 const clip=scene.clips[name];if(!clip)return CLOSED.slice();
 const frames=clip.frames,t=Math.max(0,Math.min(clip.duration,time));let index=Math.min(frames.length-2,Math.floor(t*60));
 while(index>0&&frames[index][0]>t)index--;while(index<frames.length-2&&frames[index+1][0]<t)index++;
 const a=frames[index],b=frames[index+1],f=Math.min(1,Math.max(0,(t-a[0])/Math.max(1e-8,b[0]-a[0])));
 return a.slice(1).map((v,i)=>v+(b[i+1]-v)*f);
}
function layout(count){
 if(count===1)return [[0,0]];
 if(count===2)return [[-1.7,0],[1.7,0]];
 if(count===3)return [[-2.5,-1.4],[2.5,-1.4],[0,2.1]];
 if(count===4)return [[-2,-2],[2,-2],[-2,2],[2,2]];
 if(count===5)return [[-2.5,-2.2],[2.5,-2.2],[0,0],[-2.5,2.2],[2.5,2.2]];
 return [[-2.7,-2.2],[0,-2.2],[2.7,-2.2],[-2.7,2.2],[0,2.2],[2.7,2.2]];
}
function quaternion(x=0,y=0,z=0){const a=Math.sin(x/2),b=Math.sin(y/2),c=Math.sin(z/2),d=Math.cos(x/2),e=Math.cos(y/2),f=Math.cos(z/2);return [a*e*f-d*b*c,d*b*f+a*e*c,d*e*c-a*b*f,d*e*f+a*b*c];}
function multiplyQuaternion(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function face(value,yaw=0){const half=Math.PI/2,rot={1:[half,0,0],2:[0,0,0],3:[0,0,half],4:[0,0,-half],5:[Math.PI,0,0],6:[-half,0,0]};return multiplyQuaternion(quaternion(0,yaw,0),quaternion(...rot[value]));}
function particles(values,random=Math.random){const points=layout(values.length);return values.map((value,i)=>({value,x:points[i][0],y:1.51,z:points[i][1],vx:(random()-.5)*8,vy:6+random()*7,vz:(random()-.5)*8,rx:random()*6,ry:random()*6,rz:random()*6,spin:5+random()*9}));}
function step(items,elapsed){const dt=Math.min(.035,Math.max(0,elapsed));
 for(const p of items){p.vy-=30*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;const radius=Math.hypot(p.x,p.z);if(radius>4.65){const nx=p.x/radius,nz=p.z/radius,dot=p.vx*nx+p.vz*nz;p.x=nx*4.65;p.z=nz*4.65;p.vx-=1.65*dot*nx;p.vz-=1.65*dot*nz;}if(p.y<1.51){p.y=1.51;p.vy=Math.abs(p.vy)*.65;}if(p.y>9.8){p.y=9.8;p.vy=-Math.abs(p.vy)*.6;}p.rx+=p.spin*dt;p.ry+=p.spin*.7*dt;p.rz+=p.spin*.4*dt;}
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z,d=Math.hypot(dx,dy,dz);if(d<1.85){const safe=Math.max(d,.001),n=d<.001?[1,0,0]:[dx/safe,dy/safe,dz/safe],push=(1.85-d)/2;for(const [k,axis] of ['x','y','z'].entries()){a[axis]+=n[k]*push;b[axis]-=n[k]*push;}const impulse=((a.vx-b.vx)*n[0]+(a.vy-b.vy)*n[1]+(a.vz-b.vz)*n[2])*.75;if(impulse<0){a.vx-=impulse*n[0];a.vy-=impulse*n[1];a.vz-=impulse*n[2];b.vx+=impulse*n[0];b.vy+=impulse*n[1];b.vz+=impulse*n[2];}}}
 return items;
}
module.exports={CLOSED,sample,layout,quaternion,face,particles,step};
