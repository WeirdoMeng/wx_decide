const words=require('./words');
function shuffled(values,random=Math.random){const result=values.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
// 每款玩法各自记录已见词；同玩法跨分类仍优先展示未见词。
function deck(category,seen=[],random=Math.random,mode='heads'){const pool=words.pool(category,mode),used=new Set(seen),fresh=pool.filter(item=>!used.has(item.word)),old=pool.filter(item=>used.has(item.word));return shuffled(fresh,random).concat(shuffled(old,random));}
function timingClock(ms){const value=Math.max(0,Math.round(Number(ms)||0)),minutes=String(Math.floor(value/60000)).padStart(2,'0'),seconds=String(Math.floor(value/1000)%60).padStart(2,'0'),milliseconds=String(value%1000).padStart(3,'0');return{minutes,seconds,milliseconds,text:minutes+':'+seconds+'.'+milliseconds};}
function rankTiming(attempts,players,rounds){
 const result=Array.from({length:players},(_,index)=>{const scores=attempts.filter(item=>item.player===index),mean=scores.length?scores.reduce((sum,item)=>sum+Math.abs(item.error),0)/scores.length:0;return{player:index,name:'玩家 '+(index+1),average:mean,errorText:(mean/1000).toFixed(3),complete:scores.length===rounds};}).filter(item=>item.complete).sort((a,b)=>Math.round(a.average)-Math.round(b.average)||a.player-b.player);
 let previous=null,rank=0;result.forEach((item,index)=>{const key=Math.round(item.average);if(key!==previous)rank=index+1;item.rank=rank;previous=key;});return result;
}
function rankTeams(scores){const sorted=scores.map((score,index)=>({index,name:score.name,score:score.score})).sort((a,b)=>b.score-a.score||a.index-b.index);let previous=null,rank=0;sorted.forEach((item,index)=>{if(item.score!==previous)rank=index+1;item.rank=rank;previous=item.score;});return sorted;}
module.exports={shuffled,deck,timingClock,rankTiming,rankTeams};
