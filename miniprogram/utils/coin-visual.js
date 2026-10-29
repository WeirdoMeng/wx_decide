const motion=require('./motion');
// Exact palettes and geometry from Flutter decision/widgets/coin_flip.dart.
const palettes=[['#F9F0FF','#AAA0FF','#6E68CF'],['#FFF0F7','#F58FBB','#C84D82'],['#FFFFFF','#D7D8F3','#8C83C6'],['#FFF7E8','#F3C178','#C47C3C'],['#FFE0D2','#C77C63','#5A302B']];
function whiteMix(hex){const channels=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16));return 'rgb('+channels.map(value=>Math.round(value+(255-value)*.22)).join(',')+')';}
function layers(skin){const palette=palettes[skin]||palettes[0],result=[];for(let index=8;index>=1;index--)result.push({index,top:whiteMix(palette[0]),middle:index%2===0?palette[1]:palette[0],bottom:palette[2]});return result;}
function matrix(angle){
 const c=Math.cos(angle),s=Math.sin(angle);
 // CSS matrix3d uses column-major entries like vector_math Matrix4. P × rotateX,
 // with setEntry(3,2,.0015), reproduces the source perspective sign and origin.
 return 'matrix3d(1,0,0,0,0,'+c+','+s+','+(.0015*s)+',0,'+(-s)+','+c+','+(.0015*c)+',0,0,0,1)';
}
function frame(progress,from,target){
 const t=Math.max(0,Math.min(1,progress)),angle=from+(target-from)*motion.cubic(t,.165,.84,.44,1),sideAmount=Math.sin(angle),sideVisibility=Math.pow(Math.abs(sideAmount),1.35),lift=motion.coinArc(t),front=Math.cos(angle)>=0;
 return {angle,sideAmount,sideVisibility,lift,liftScale:1+.14*lift,shadowWidth:400*(.72-.34*lift),shadowOpacity:1-.7*lift,edgeMatrix:matrix(angle),faceMatrix:matrix(front?angle:angle+Math.PI),face:front?'heads':'tails'};
}
module.exports={palettes,layers,matrix,frame};
