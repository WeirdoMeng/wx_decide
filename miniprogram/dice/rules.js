// 摇骰子的结果只在一次摇动完成时生成，开盅/盖盅不会改变点数。
function count(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=6?n:5;}
function roll(value,random=Math.random){return Array.from({length:count(value)},()=>Math.min(6,Math.max(1,Math.floor(random()*6)+1)));}
function summary(values){const counts=Array(6).fill(0);values.forEach(n=>{if(Number.isInteger(n)&&n>=1&&n<=6)counts[n-1]++;});return {total:values.reduce((sum,n)=>sum+n,0),counts:counts.map((number,index)=>({value:index+1,number}))};}
function motionDelta(previous,next){if(!previous)return 0;return Math.sqrt(['x','y','z'].reduce((sum,key)=>sum+Math.pow((Number(next[key])||0)-(Number(previous[key])||0),2),0));}
module.exports={count,roll,summary,motionDelta};
