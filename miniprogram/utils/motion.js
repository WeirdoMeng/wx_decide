// Flutter Cubic.transform: solve the curve's x coordinate, then evaluate its y.
function cubic(progress,x1,y1,x2,y2){
 const x=Math.max(0,Math.min(1,progress));if(x===0||x===1)return x;
 let low=0,high=1,t=x;
 for(let index=0;index<24;index++){const r=1-t,value=3*r*r*t*x1+3*r*t*t*x2+t*t*t;if(value<x)low=t;else high=t;t=(low+high)/2;}
 const r=1-t;return 3*r*r*t*y1+3*r*t*t*y2+t*t*t;
}
function wheelEase(progress){return cubic(progress,.12,.62,.18,1);}
function coinArc(progress){return Math.sin(Math.PI*Math.max(0,Math.min(1,progress/.9)));}
module.exports={cubic,wheelEase,coinArc};
