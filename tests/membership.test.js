const test=require('node:test');
const assert=require('node:assert/strict');
const {createService,USERS,ORDERS,GRANTS}=require('../cloudfunctions/membership/lib/service');
const {hmac,paySig,paymentData,createProvider}=require('../cloudfunctions/membership/lib/payment');
const {createAccount}=require('../miniprogram/utils/account');
const {createManager}=require('../miniprogram/utils/ads');
const {compareVersion,unavailable}=require('../miniprogram/utils/member-payment');
const config={appId:'test-app',appSecret:'test-secret',offerId:'1450698692',productId:'1000001',appKey:'test-key'};
function harness(){
 const data=new Map(),platform=new Map();let lock=Promise.resolve(),provideCount=0,failProvide=false;
 const key=(c,id)=>c+':'+id;
 const copy=value=>value===undefined?null:structuredClone(value);
 const access={get:async(c,id)=>copy(data.get(key(c,id))),set:async(c,id,value)=>{data.set(key(c,id),copy(value));}};
 const repo={...access,patch:async(c,id,value)=>{data.set(key(c,id),{...data.get(key(c,id)),...copy(value)});},transaction(fn){const job=lock.then(async()=>{const before=new Map([...data].map(([k,v])=>[k,copy(v)]));try{return await fn(access);}catch(err){data.clear();before.forEach((v,k)=>data.set(k,v));throw err;}});lock=job.catch(()=>{});return job;},listOrders:async openid=>[...data].filter(([k,v])=>k.startsWith(ORDERS+':')&&v.openid===openid).map(([,v])=>copy(v)),pendingOrders:async()=>[...data].filter(([k,v])=>k.startsWith(ORDERS+':')&&['pending','delivered_pending_ack'].includes(v.state)).map(([,v])=>copy(v))};
 const provider={exchange:async code=>({openid:code,session_key:'server-session'}),query:async order=>({order:copy(platform.get(order.id))}),provide:async()=>{provideCount++;if(failProvide)throw Error('network');}};
 const service=createService({repo,provider,config});
 async function order(){await service.login('alice','alice');const result=await service.createOrder('alice','alice');platform.set(result.orderId,{order_id:result.orderId,wx_order_id:'wx'+result.orderId,env_type:1,order_type:0,order_fee:990,paid_fee:990,left_fee:990,status:1,paid_time:123});return result;}
 return{service,repo,data,platform,order,provideCount:()=>provideCount,failProvide:value=>{failProvide=value;}};
}
test('签名严格匹配微信公开测试向量，signData签名和传输使用同一字符串',()=>{
 const body='{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}';
 assert.equal(paySig('/xpay/query_user_balance',body,'12345'),'c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5');
 assert.equal(hmac('9hAb/NEYUlkaMBEsmFgzig==',body),'089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7');
 const result=paymentData(config,{id:'T12345678',productId:'1000001',attach:'a'},'session');
 assert.deepEqual(JSON.parse(result.signData),{offerId:'1450698692',buyQuantity:1,env:0,currencyType:'CNY',productId:'1000001',goodsPrice:990,outTradeNo:'T12345678',attach:'a'});
 assert.equal(result.signature,hmac('session',result.signData));assert.equal(result.paySig,paySig('requestVirtualPayment',result.signData,config.appKey));
 assert.doesNotMatch(JSON.stringify(result),/test-secret|server-session|test-key/);
});
test('未支付不发货，不能替别人查单或以另一个登录凭证下单',async()=>{
 const h=harness(),order=await h.order();assert.equal((await h.service.query('alice',order.orderId)).entitlement.adFree,false);
 await assert.rejects(h.service.query('bob',order.orderId),{code:'ORDER_NOT_FOUND'});
 await assert.rejects(h.service.createOrder('alice','bob'),{code:'IDENTITY_MISMATCH'});
 assert.equal([...h.data.keys()].filter(k=>k.startsWith(GRANTS+':')).length,0);
});
test('重复并发推送和查单仅生成一个平台订单权益，已发货不再确认',async()=>{
 const h=harness(),result=await h.order(),order=await h.repo.get(ORDERS,result.orderId);h.platform.get(order.id).status=4;
 const push={MsgType:'event',Event:'xpay_goods_deliver_notify',OutTradeNo:order.id,OpenId:'alice',Env:0,GoodsInfo:{ProductId:'1000001',Quantity:1,Attach:order.attach,OrigPrice:990,ActualPrice:990}};
 await Promise.all([h.service.notify(push),h.service.notify(push),h.service.query('alice',order.id)]);
 const state=await h.service.status('alice');assert.equal(state.entitlement.adFree,true);assert.equal(state.entitlement.version,1);
 assert.equal([...h.data.keys()].filter(k=>k.startsWith(GRANTS+':')).length,1);assert.equal(h.provideCount(),0);
 await assert.rejects(h.service.createOrder('alice','alice'),{code:'ALREADY_MEMBER'});
});
test('退款后收回对应权益，迟到的支付查单不能再次开通',async()=>{
 const h=harness(),result=await h.order(),p=h.platform.get(result.orderId);p.status=4;await h.service.query('alice',result.orderId);
 p.status=8;p.left_fee=0;
 await h.service.notify({Event:'xpay_refund_notify',MchOrderId:result.orderId,OpenId:'alice',RetCode:0});
 assert.equal((await h.service.status('alice')).entitlement.adFree,false);
 p.status=4;p.left_fee=990;await h.service.query('alice',result.orderId);
 const state=await h.service.status('alice');assert.equal(state.entitlement.adFree,false);assert.equal(state.entitlement.version,2);
});
test('错误价格、测试环境、错误平台单号和伪造通知均不能发货',async()=>{
 for(const patch of [{paid_fee:1},{order_fee:1},{env_type:2},{order_id:'other-order'}]){
  const h=harness(),order=await h.order();Object.assign(h.platform.get(order.orderId),{status:4},patch);
  await assert.rejects(h.service.query('alice',order.orderId));assert.equal((await h.service.status('alice')).entitlement.adFree,false);
 }
 const h=harness(),order=await h.order();
 await assert.rejects(h.service.notify({Event:'xpay_goods_deliver_notify',OutTradeNo:order.orderId,OpenId:'alice',Env:0,GoodsInfo:{ProductId:'forged'}}),{code:'NOTIFY_MISMATCH'});
});
test('微信确认发货超时保留待确认记录，定时查单可恢复；重新登录恢复服务端权益',async()=>{
 const h=harness(),order=await h.order();h.platform.get(order.orderId).status=2;h.failProvide(true);
 assert.equal((await h.service.query('alice',order.orderId)).entitlement.adFree,true);assert.equal((await h.repo.get(ORDERS,order.orderId)).state,'delivered_pending_ack');
 h.failProvide(false);assert.deepEqual(await h.service.reconcilePending(),{checked:1,failed:0});
 assert.equal((await h.service.login('alice','alice')).entitlement.adFree,true);
 assert.equal((await h.service.restore('alice')).entitlement.version,1);
});
test('HTTPS查单请求构造、签名、生产env与token缓存路径；发货确认不带pay_sig',async()=>{
 const calls=[],provider=createProvider(config,async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.includes('stable_token')?{access_token:'fake-token',expires_in:7200}:{errcode:0,order:{}}};});
 await provider.query({openid:'alice',id:'T12345678'});await provider.provide({id:'T12345678'});
 assert.equal(calls.length,3);const query=calls[1],url=new URL(query.url);
 assert.equal(url.searchParams.get('pay_sig'),paySig('/xpay/query_order',query.options.body,config.appKey));
 assert.deepEqual(JSON.parse(query.options.body),{openid:'alice',env:0,order_id:'T12345678'});
 assert.equal(new URL(calls[2].url).searchParams.has('pay_sig'),false);
});
function clientHarness(){
 const stored=new Map(),jobs=[];let state={user:{id:'alice',name:'微信用户'},entitlement:{adFree:false,version:0},catalogue:{ready:true}};
 const api={getAccountInfoSync:()=>({miniProgram:{appId:'wx9caeac69341808c8',envVersion:'release'}}),login:({success})=>success({code:'single-use-code'}),cloud:{init(){},callFunction:async({data})=>{jobs.push(data);return{result:{ok:true,data:structuredClone(state)}};}}};
 const account=createAccount({api:()=>api,storage:{read:(key,fallback)=>stored.has(key)?stored.get(key):fallback,write:(key,value)=>stored.set(key,value)}});
 return{account,api,jobs,stored,setState:value=>{state=value;}};
}
test('客户端不采信本地会员缓存，退出后迟到响应不能恢复登录或免广告',async()=>{
 const h=clientHarness();h.stored.set('isVip',true);assert.equal(h.account.isAdFree(),false);await h.account.login();assert.equal(h.account.isAdFree(),false);
 let complete;h.api.cloud.callFunction=()=>new Promise(resolve=>{complete=resolve;});
 const pending=h.account.refresh();h.account.logout();complete({result:{ok:true,data:{user:{id:'alice'},entitlement:{adFree:true,version:1},catalogue:{}}}});await pending;
 assert.equal(h.account.isReady(),false);assert.equal(h.account.isAdFree(),false);
});
test('旧查单响应不能覆盖新会员状态，云开发登录无需交换code且不返回会话密钥',async()=>{
 const h=clientHarness();await h.account.login();assert.deepEqual(h.jobs,[{action:'login'}]);
 h.setState({user:{id:'alice'},entitlement:{adFree:true,version:2},catalogue:{}});await h.account.refresh();
 h.setState({user:{id:'alice'},entitlement:{adFree:false,version:1},catalogue:{}});await h.account.refresh();assert.equal(h.account.isAdFree(),true);
 assert.doesNotMatch(JSON.stringify([...h.stored]),/session_key|adFree/);
});
test('会员完全绕过Banner、插屏和保存激励，不改变非会员操作概率配置',()=>{
 let member=true;const map=new Map(),manager=createManager({isAdFree:()=>member,storage:{read:(k,f)=>map.get(k)||f,write:(k,v)=>map.set(k,v)},api:()=>({createInterstitialAd(){throw Error('should not instantiate');}}),log(){}});
 assert.equal(manager.choose('banner'),'');for(const entry of ['wheel','truth','coin','passBalloon','numberBomb','sharkTeeth','billiards'])assert.equal(manager.shouldOffer(entry),false);
 assert.equal(manager.shouldOffer('save','rewarded'),false);
 let result;manager.controller(()=>true).play(value=>{result=value;},{placement:'wheel'});assert.equal(result.status,'unavailable');
 member=false;assert.ok(manager.choose('banner'));const config=require('../miniprogram/data/ad-config');assert.equal(config.triggers.wheel.probability,.2);assert.equal(config.policy.pityActions,25);
});
test('iOS最低版本包含等于边界，旧系统和缺少API不能发起支付',()=>{
 assert.equal(compareVersion('8.0.68','8.0.68'),0);assert.equal(compareVersion('8.0.100','8.0.68'),1);
 assert.equal(unavailable({requestVirtualPayment(){},getSystemInfoSync:()=>({platform:'ios',system:'iOS 15.0',version:'8.0.68'})}),'');
 assert.match(unavailable({requestVirtualPayment(){},getSystemInfoSync:()=>({platform:'ios',system:'iOS 14.9',version:'8.0.99'})}),/iOS 15/);
 assert.ok(unavailable({}));
});

test('登录回跳仅允许已注册页面，保留游戏参数且拒绝外部链接',()=>{
 const route=require('../miniprogram/utils/login-route'),manifest=require('../miniprogram/app.json');
 const actual=manifest.pages.concat(manifest.subPackages.flatMap(pkg=>pkg.pages.map(page=>pkg.root+'/'+page))).filter(page=>page!=='pages/login/index');
 assert.deepEqual(route.routes.slice().sort(),actual.sort());
 assert.deepEqual(route.destination('pages/game/index?type=numberBomb'),{url:'/pages/game/index?type=numberBomb',tab:false});
 assert.deepEqual(route.destination('https://example.invalid'),{url:'/pages/index/index',tab:true});
 assert.deepEqual(route.destination('pages/mine/index?ignored=yes'),{url:'/pages/mine/index',tab:true});
});
function mineHarness({paid=false,cancel=false,hideOnCreate=false,paymentError=null,queryError=false}={}){
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');let definition,requests=0,queries=0;
 let state={user:{id:'alice',name:'微信用户'},entitlement:{adFree:false},catalogue:{ready:true}};const stored=new Map();
 const account={isReady:()=>true,isAdFree:()=>state.entitlement.adFree,getState:()=>state,refresh:async()=>state,createOrder:async()=>{if(hideOnCreate)instance._active=false;return{orderId:'T12345678',payData:{signData:'signed-only',signature:'sig',paySig:'sig',mode:'short_series_goods'}};},query:async()=>{queries++;if(queryError)throw Error('query unavailable');if(paid)state={...state,entitlement:{adFree:true}};return{...state,order:{id:'T12345678',state:paid?'delivered':'pending'}};}};
 const api={requestVirtualPayment(options){requests++;if(paymentError)options.fail(paymentError);else if(cancel)options.fail({errMsg:'requestVirtualPayment:fail cancel'});else options.success({});}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/mine/index.js'),'utf8'),{require:name=>name.endsWith('/account')?account:name.endsWith('/storage')?{read:(k,f)=>stored.has(k)?stored.get(k):f,write:(k,v)=>stored.set(k,v)}:require('../miniprogram/utils/member-payment'),Page:value=>{definition=value;},wx:api,setTimeout:fn=>{fn();},Promise});
 const instance={...definition,data:structuredClone(definition.data),_active:true,_destroyed:false,setData(value){Object.assign(this.data,value);}};
 return{instance,account,requests:()=>requests,queries:()=>queries,stored};
}
test('前端支付success本身不发会员，取消支付不发会员；服务端确认才显示已开通',async()=>{
 const pending=mineHarness();await pending.instance.buy();assert.equal(pending.requests(),1);assert.equal(pending.queries(),5);assert.equal(pending.instance.data.adFree,false);assert.match(pending.instance.data.hint,/确认/);
 const cancel=mineHarness({cancel:true});await cancel.instance.buy();assert.equal(cancel.queries(),1);assert.equal(cancel.instance.data.adFree,false);assert.equal(cancel.instance.data.hint,'已取消支付');
 const paid=mineHarness({paid:true});await paid.instance.buy();assert.equal(paid.instance.data.adFree,true);assert.equal(paid.stored.get('account:pendingOrder'),null);
});
test('创建订单时退出页面，不会在其他页面弹出付款',async()=>{
 const h=mineHarness({hideOnCreate:true});await h.instance.buy();assert.equal(h.requests(),0);assert.equal(h.instance.data.busy,false);
});

test('登录采用云端可信身份，无AppSecret或微信接口故障仍能建立账户，支付保持受限',async()=>{
 const h=harness();let exchanges=0;
 const service=createService({repo:h.repo,config:{...config,appSecret:'',appKey:''},provider:{exchange:async()=>{exchanges++;throw Error('offline');}}});
 const state=await service.login('trusted-wx-context-openid');
 assert.equal(state.entitlement.adFree,false);assert.equal(state.catalogue.ready,false);assert.equal(exchanges,0);
 await assert.rejects(service.createOrder('trusted-wx-context-openid','code'),{code:'PAYMENT_NOT_CONFIGURED'});
});
test('云函数支付模块在没有全局fetch的运行时仍可加载和初始化',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module'),file=require.resolve('../cloudfunctions/membership/lib/payment');
 const exported={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),module:exported,Buffer,URLSearchParams,Date,Math,Number,Error,Promise});
 assert.equal(typeof exported.exports.createProvider(config).exchange,'function');
});
test('客户端保留云调用错误码但不记录原始错误中的密钥，界面可判断缺依赖',async()=>{
 const h=clientHarness(),logs=[],original=console.error;
 h.api.cloud.callFunction=async()=>{throw{errCode:-504002,errMsg:'Cannot find module wx-server-sdk secret=do-not-print'};};
 console.error=(...args)=>logs.push(args);
 try{await assert.rejects(h.account.login(),err=>err.code==='-504002'&&/云端安装依赖/.test(err.message));}
 finally{console.error=original;}
 assert.match(JSON.stringify(logs),/-504002/);assert.doesNotMatch(JSON.stringify(logs),/do-not-print/);
});
test('实际AppID与云环境所属项目不一致时，明确提示并不请求云函数',async()=>{
 const h=clientHarness();h.api.getAccountInfoSync=()=>({miniProgram:{appId:'another-app'}});
 await assert.rejects(h.account.login(),/another-app.*wx9caeac69341808c8/);assert.equal(h.jobs.length,0);
});

test('原生HTTPS对所有微信POST发送UTF-8 Content-Length，长度与实际签名请求体一致',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events'),file=require.resolve('../cloudfunctions/membership/lib/payment'),{createRequire}=require('node:module');
 const originalRequire=createRequire(file),calls=[],exported={exports:{}};
 const https={request(url,options,callback){
  const req=new EventEmitter();let body='';
  req.setTimeout=()=>{};req.write=value=>{body+=value;};
  req.end=()=>{calls.push({url,options,body});const response=new EventEmitter();response.statusCode=200;callback(response);const value=url.includes('stable_token')?{access_token:'fake-token',expires_in:7200}:{errcode:0,order:{}};response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');};return req;
 }};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>name==='https'?https:originalRequire(name),module:exported,Buffer,URLSearchParams,Date,Math,Number,Error,Promise});
 const provider=exported.exports.createProvider({...config,appSecret:'测试密钥'});
 await provider.query({openid:'测试用户',id:'T12345678'});await provider.provide({id:'T12345678'});
 assert.equal(calls.length,3);
 for(const call of calls){assert.equal(call.options.method,'POST');assert.equal(call.options.headers['Content-Length'],Buffer.byteLength(call.body,'utf8'));assert.equal(call.options.headers['Transfer-Encoding'],undefined);}
 assert.notEqual(calls[0].body.length,calls[0].options.headers['Content-Length'],'Unicode length must count bytes');
 const query=calls[1];assert.equal(new URL(query.url).searchParams.get('pay_sig'),paySig('/xpay/query_order',query.body,config.appKey));
});
test('凭证与查单HTTP失败保留状态码和阶段，网络与JSON失败可区分且不泄露密钥',async()=>{
 const http=createProvider(config,async()=>({ok:false,status:412}));
 await assert.rejects(http.query({openid:'alice',id:'T12345678'}),err=>err.code==='WECHAT_HTTP_412'&&/支付凭证获取/.test(err.message));
 const query=createProvider(config,async url=>url.includes('stable_token')?{ok:true,json:async()=>({access_token:'private-token',expires_in:7200})}:{ok:false,status:503});
 await assert.rejects(query.query({openid:'alice',id:'T12345678'}),err=>err.code==='WECHAT_HTTP_503'&&/订单查询/.test(err.message)&&!err.message.includes('private-token'));
 const network=createProvider(config,async()=>{throw Object.assign(Error('secret=do-not-print'),{code:'ETIMEDOUT'});});
 await assert.rejects(network.query({openid:'alice',id:'T12345678'}),err=>err.code==='WECHAT_NETWORK_ETIMEDOUT'&&!err.message.includes('do-not-print'));
 const invalid=createProvider(config,async()=>({ok:true,json:async()=>{throw Error('raw response');}}));
 await assert.rejects(invalid.query({openid:'alice',id:'T12345678'}),{code:'WECHAT_INVALID_RESPONSE'});
});

test('未打开收银台的订单status=0且字段为空时可恢复检查，不误判环境错误且不发货',async()=>{
 const h=harness(),result=await h.order();h.platform.set(result.orderId,{status:0,order_id:'',env_type:0,order_type:0});
 const checked=await h.service.query('alice',result.orderId);assert.equal(checked.entitlement.adFree,false);assert.equal(checked.order.state,'pending');
 assert.equal((await h.service.restore('alice')).entitlement.adFree,false);
 const next=await h.service.createOrder('alice','alice');assert.notEqual(next.orderId,result.orderId);assert.equal(h.provideCount(),0);
});
test('恢复购买不把查单失败显示成未购买，已经确认的免广告权益仍保留',async()=>{
 const h=harness(),result=await h.order();h.platform.delete(result.orderId);
 await assert.rejects(h.service.restore('alice'),{code:'ORDER_MISMATCH'});
 const paid={order_id:result.orderId,wx_order_id:'wx'+result.orderId,env_type:1,order_type:0,order_fee:990,paid_fee:990,left_fee:990,status:4};
 h.platform.set(result.orderId,paid);await h.service.query('alice',result.orderId);h.platform.delete(result.orderId);
 assert.equal((await h.service.restore('alice')).entitlement.adFree,true);
});

test('未弹收银台时保留客户端支付错误码，即使补偿查单也失败仍不会覆盖原始阶段',async()=>{
 const h=mineHarness({paymentError:{errCode:-15001,errMsg:'requestVirtualPayment:fail'},queryError:true});
 await h.instance.buy();assert.equal(h.requests(),1);assert.equal(h.queries(),1);assert.equal(h.instance.data.adFree,false);assert.equal(h.instance.data.error,undefined);assert.match(h.instance.data.hint,/购买结果待确认/);assert.doesNotMatch(h.instance.data.hint,/-15001|query unavailable/);
});

test('开发版体验版自动用沙盒函数，正式版仅用现网；未知版本拒绝登录',async()=>{
 for(const [version,name,env]of [['develop','membership_sandbox',1],['trial','membership_sandbox',1],['release','membership',0]]){
  const h=clientHarness(),names=[];h.api.getAccountInfoSync=()=>({miniProgram:{appId:'wx9caeac69341808c8',envVersion:version}});
  h.api.cloud.callFunction=async options=>{names.push(options.name);return{result:{ok:true,data:{user:{id:'alice'},entitlement:{adFree:false,version:0},catalogue:{ready:true,payEnv:env}}}};};
  await h.account.login();assert.deepEqual(names,[name]);assert.equal(h.account.getState().catalogue.payEnv,env);
 }
 const h=clientHarness();h.api.getAccountInfoSync=()=>({miniProgram:{appId:'wx9caeac69341808c8',envVersion:'unknown'}});
 await assert.rejects(h.account.login(),/无法识别/);assert.equal(h.jobs.length,0);
});
test('测试版本拒绝现网账户响应，沙盒签名参数全链路使用env=1和沙盒Key',async()=>{
 const h=clientHarness();h.api.getAccountInfoSync=()=>({miniProgram:{appId:'wx9caeac69341808c8',envVersion:'develop'}});
 await assert.rejects(h.account.login(),/支付环境不一致/);assert.equal(h.account.isReady(),false);
 const sandbox={...config,payEnv:1,appKey:'sandbox-key'},order={id:'S12345678',productId:'1000001',attach:'sandbox',openid:'alice'};
 const pay=paymentData(sandbox,order,'session');assert.equal(JSON.parse(pay.signData).env,1);assert.equal(pay.paySig,paySig('requestVirtualPayment',pay.signData,'sandbox-key'));
 const calls=[],provider=createProvider(sandbox,async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.includes('stable_token')?{access_token:'token',expires_in:7200}:{errcode:0}};});
 await provider.query(order);await provider.provide(order);
 assert.equal(JSON.parse(calls[1].options.body).env,1);assert.equal(JSON.parse(calls[2].options.body).env,undefined);
 assert.equal(new URL(calls[1].url).searchParams.get('pay_sig'),paySig('/xpay/query_order',calls[1].options.body,'sandbox-key'));
});
test('正式与沙盒共用云环境时隔离所有读写、事务、恢复查询与定时补偿集合',async()=>{
 const {createRepository}=require('../cloudfunctions/membership/lib/repository'),names=[];
 const db={command:{in:value=>value},runTransaction:fn=>fn(db),collection(name){names.push(name);return{doc:()=>({get:async()=>({data:null}),set:async()=>{},update:async()=>{}}),where:()=>({orderBy(){return this;},limit(){return this;},get:async()=>({data:[]})})};}};
 const sandbox=createRepository(db,{prefix:'sandbox_'});
 await sandbox.get(USERS,'u');await sandbox.patch(ORDERS,'o',{});await sandbox.transaction(tx=>tx.set(GRANTS,'g',{}));await sandbox.listOrders('alice',5);await sandbox.pendingOrders(10);
 assert.deepEqual(names,['sandbox_member_users','sandbox_member_orders','sandbox_member_grants','sandbox_member_orders','sandbox_member_orders']);
 names.length=0;await createRepository(db).get(USERS,'u');assert.deepEqual(names,['member_users']);
});
test('沙盒发货/恢复/退款只更新沙盒记录，拒绝现网查单结果与通知',async()=>{
 const h=harness(),entries=new Map();
 const scoped={...h.repo,get:(c,id)=>h.repo.get('sandbox_'+c,id),patch:(c,id,v)=>h.repo.patch('sandbox_'+c,id,v),transaction:fn=>h.repo.transaction(tx=>fn({get:(c,id)=>tx.get('sandbox_'+c,id),set:(c,id,v)=>tx.set('sandbox_'+c,id,v)})),listOrders:async()=>[...entries.values()],pendingOrders:async()=>[]};
 const provider={exchange:async()=>({openid:'alice',session_key:'session'}),query:async order=>({order:{order_id:order.id,wx_order_id:'sandbox-platform',status:4,env_type:2,order_type:0,order_fee:990,paid_fee:990,left_fee:990}}),provide:async()=>{}};
 const service=createService({repo:scoped,provider,config:{...config,payEnv:1,appKey:'sandbox-key'}});
 await service.login('alice');const created=await service.createOrder('alice','code');assert.ok(created.orderId.startsWith('S'));
 const order=await scoped.get(ORDERS,created.orderId);entries.set(order.id,order);
 await h.service.login('alice');assert.equal((await h.service.status('alice')).entitlement.adFree,false);
 await service.query('alice',order.id);assert.equal((await service.restore('alice')).entitlement.adFree,true);assert.equal((await h.service.status('alice')).entitlement.adFree,false);
 await assert.rejects(service.notify({Event:'xpay_goods_deliver_notify',OutTradeNo:order.id,OpenId:'alice',Env:0}),{code:'ORDER_ENV_MISMATCH'});
 provider.query=async()=>({order:{order_id:order.id,wx_order_id:'sandbox-platform',status:8,env_type:2,order_type:0,order_fee:990,paid_fee:990,left_fee:0}});
 await service.notify({Event:'xpay_refund_notify',MchOrderId:order.id,OpenId:'alice',RetCode:0});assert.equal((await service.status('alice')).entitlement.adFree,false);
 provider.query=async()=>({order:{order_id:order.id,status:4,env_type:1,order_type:0}});
 await assert.rejects(service.query('alice',order.id),{code:'ORDER_ENV_MISMATCH'});
});
test('微信推送保留原membership入口，沙盒按Env或S单号转发且不会循环',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 async function run(sandbox,event){
  const calls=[],exported={exports:{}},cloud={init(){},DYNAMIC_CURRENT_ENV:'test',database:()=>({}),getWXContext:()=>({}),callFunction:async options=>{calls.push(options);return{result:{ErrCode:0}};}};
  const file=path.join(__dirname,'../cloudfunctions/',sandbox?'membership_sandbox':'membership','index.js');
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:exported,exports:exported.exports,process:{env:{}},console,require:name=>name==='wx-server-sdk'?cloud:name.endsWith('/repository')?{createRepository:(_,options)=>{assert.equal(options.prefix,sandbox?'sandbox_':'');return{};}}:name.endsWith('/payment')?{createProvider:()=>({}),error:(c,m)=>Object.assign(Error(m),{code:c})}:{createService:()=>({notify:async()=>{calls.push('local');return{ErrCode:0};}})}});
  assert.equal((await exported.exports.main({MsgType:'event',...event})).ErrCode,0);return calls;
 }
 assert.equal((await run(false,{Event:'xpay_goods_deliver_notify',Env:1,OutTradeNo:'S12345678'}))[0].name,'membership_sandbox');
 assert.equal((await run(false,{Event:'xpay_refund_notify',MchOrderId:'S12345678'}))[0].name,'membership_sandbox');
 assert.deepEqual(await run(true,{Event:'xpay_goods_deliver_notify',Env:1,OutTradeNo:'S12345678'}),['local']);
 assert.deepEqual(await run(false,{Event:'xpay_goods_deliver_notify',Env:0,OutTradeNo:'T12345678'}),['local']);
});
test('沙盒阻止iOS调用付款并隔离设备待确认订单，生成文件与真值源一致',()=>{
 assert.match(unavailable({requestVirtualPayment(){},getSystemInfoSync:()=>({platform:'ios',system:'iOS 18',version:'8.0.79'})},1),/不支持沙盒/);
 const h=mineHarness();h.instance.savePending('T12345678');h.instance.setData({payEnv:1});assert.equal(h.instance.pending(),null);h.instance.savePending('S12345678');h.instance.clearPending();h.instance.setData({payEnv:0});assert.equal(h.instance.pending().orderId,'T12345678');
 require('node:child_process').execFileSync(process.execPath,[require('node:path').join(__dirname,'../tools/build-membership-sandbox.cjs'),'--check']);
});

test('发货确认使用服务端查到的平台单号，不发送未定义env或同时发送两个单号',async()=>{
 const calls=[],provider=createProvider({...config,payEnv:1},async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.includes('stable_token')?{access_token:'fake-token',expires_in:7200}:{errcode:0}};});
 await provider.provide({id:'S12345678',wxOrderId:'canonical-platform-order'});
 assert.deepEqual(JSON.parse(calls[1].options.body),{wx_order_id:'canonical-platform-order'});
 assert.equal(new URL(calls[1].url).searchParams.has('pay_sig'),false);
});
test('真实查单确认付款后，发货确认参数错误不会把已到账权益显示成购买失败',async()=>{
 const h=harness(),order=await h.order();h.platform.get(order.orderId).status=2;h.failProvide(true);
 const result=await h.service.query('alice',order.orderId);assert.equal(result.entitlement.adFree,true);assert.equal(result.order.state,'delivered_pending_ack');
 assert.equal((await h.service.status('alice')).entitlement.version,1);
 h.failProvide(false);await h.service.reconcilePending();assert.equal((await h.repo.get(ORDERS,order.orderId)).state,'delivered');
});
test('有效发货推送查单并提交权益后直接成功应答，不重复请求发货确认API',async()=>{
 const h=harness(),created=await h.order(),order=await h.repo.get(ORDERS,created.orderId);h.platform.get(order.id).status=2;h.failProvide(true);
 const result=await h.service.notify({MsgType:'event',Event:'xpay_goods_deliver_notify',OutTradeNo:order.id,OpenId:'alice',Env:0,GoodsInfo:{ProductId:'1000001',Quantity:1,OrigPrice:990,ActualPrice:990,Attach:order.attach}});
 assert.equal(result.ErrCode,0);assert.equal(h.provideCount(),0);assert.equal((await h.service.status('alice')).entitlement.adFree,true);
});
test('微信参数错误保留脱敏errmsg和请求阶段，用户标识、单号、签名、密钥不返回客户端',async()=>{
 const secret='private-app-secret',key='private-app-key',token='private-access-token',openid='private-user-openid',id='SPrivateOrder12345678';
 const provider=createProvider({...config,appSecret:secret,appKey:key},async url=>({ok:true,json:async()=>url.includes('stable_token')?{access_token:token,expires_in:7200}:{errcode:268490002,errmsg:'invalid order_id '+id+' openid='+openid+' secret='+secret+' key='+key+' token='+token+' url='+url}}));
 await assert.rejects(provider.query({openid,id}),err=>{
  assert.equal(err.code,'WECHAT_268490002');assert.equal(err.diagnostic.stage,'订单查询');assert.match(err.message,/invalid order_id/);
  for(const value of [secret,key,token,openid,id])assert.equal(JSON.stringify({message:err.message,detail:err.diagnostic}).includes(value),false);
  assert.doesNotMatch(err.message,/https:\/\//);return true;
 });
});

test('前端单行日志包含云函数、支付环境、阶段和脱敏原因，不再只输出错误码',async()=>{
 const h=clientHarness(),logs=[],original=console.error;
 h.api.cloud.callFunction=async()=>({result:{ok:false,error:{code:'WECHAT_268490002',message:'微信订单查询失败：order_id invalid [hidden]',stage:'订单查询',version:'query-detail-20261029'},unusedCredential:'do-not-log-entire-result'}});
 console.error=(...args)=>logs.push(args.join(' '));
 try{await assert.rejects(h.account.login(),/order_id invalid/);}finally{console.error=original;}
 const log=logs.find(line=>line.startsWith('[account] cloud-result '));assert.ok(log);
 const value=JSON.parse(log.slice('[account] cloud-result '.length));
 assert.deepEqual(value,{action:'login',code:'WECHAT_268490002',functionName:'membership',payEnv:0,version:'query-detail-20261029',stage:'订单查询',message:'微信订单查询失败：order_id invalid [hidden]'});
 assert.equal(log.includes('do-not-log-entire-result'),false);
});

const avatarPng=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('profile-test')]).toString('base64');
test('头像昵称云端持久化并绑定当前账户，更新资料不改变已购买权益',async()=>{
 const h=harness(),created=await h.order();h.platform.get(created.orderId).status=4;await h.service.query('alice',created.orderId);await h.service.login('bob');
 const files=[],removed=[],store={save:async(path,bytes)=>{files.push({path,bytes});return 'cloud://test/'+path;},url:async id=>'https://avatar.example.invalid/'+id.split('/').pop(),remove:async id=>{removed.push(id);}};
 const service=createService({repo:h.repo,provider:{},config,avatarStore:store});
 const first=await service.updateProfile('alice',{nickname:' 小决定玩家 ',avatarBase64:avatarPng,openid:'bob',adFree:false});
 assert.equal(first.user.name,'小决定玩家');assert.equal(first.user.profileComplete,true);assert.equal(first.user.profileVersion,1);assert.match(first.user.avatarUrl,/^https:\/\/avatar/);
 assert.equal(first.entitlement.adFree,true);assert.equal(first.entitlement.version,1);assert.ok(files[0].path.startsWith('member-avatars/0/'+first.user.id+'/'));
 const second=await service.updateProfile('alice',{nickname:'新昵称',avatarBase64:avatarPng});assert.equal(second.user.profileVersion,2);assert.equal(removed.length,1);
 assert.equal((await service.login('alice')).user.name,'新昵称');assert.equal((await service.status('bob')).user.profileComplete,false);
});
test('非法头像或昵称不能上传，资料事务失败清理新文件并保留旧资料',async()=>{
 const h=harness();await h.service.login('alice');let saves=0;const removed=[];
 const avatarStore={save:async()=>{saves++;return 'cloud://new-avatar';},remove:async id=>removed.push(id)};
 const service=createService({repo:h.repo,config,provider:{},avatarStore});
 for(const input of [{nickname:'',avatarBase64:avatarPng},{nickname:'a'.repeat(21),avatarBase64:avatarPng},{nickname:'abc\n123',avatarBase64:avatarPng},{nickname:'正常',avatarBase64:Buffer.from('<script>').toString('base64')}])await assert.rejects(service.updateProfile('alice',input));
 assert.equal(saves,0);
 const failing=createService({repo:{...h.repo,transaction:async()=>{throw Error('db unavailable');}},config,provider:{},avatarStore});
 await assert.rejects(failing.updateProfile('alice',{nickname:'正常',avatarBase64:avatarPng}));assert.deepEqual(removed,['cloud://new-avatar']);assert.equal((await service.status('alice')).user.profileComplete,false);
});
test('客户端头像只读取选定文件，上传资料时不携带账户身份或会员字段',async()=>{
 const h=clientHarness();await h.account.login();let readPath,payload;
 h.api.getFileSystemManager=()=>({readFile(options){readPath=options.filePath;assert.equal(options.encoding,'base64');options.success({data:avatarPng});}});
 h.api.cloud.callFunction=async options=>{payload=options.data;return{result:{ok:true,data:{user:{id:'alice',name:'小明',avatarUrl:'cloud://avatar',profileVersion:1,profileComplete:true},entitlement:{adFree:false,version:0},catalogue:{payEnv:0}}}};};
 await h.account.updateProfile('小明','wxfile://chosen-avatar');assert.equal(readPath,'wxfile://chosen-avatar');assert.deepEqual(Object.keys(payload).sort(),['action','avatarBase64','nickname']);assert.equal(h.account.getState().user.name,'小明');
});
test('资料和会员异步回复分别比较版本，昵称更新不回退会员，退款更新不回退昵称',async()=>{
 const h=clientHarness();await h.account.login();
 h.setState({user:{id:'alice',name:'旧昵称',profileVersion:0},entitlement:{adFree:true,version:2},catalogue:{}});await h.account.refresh();
 h.setState({user:{id:'alice',name:'新昵称',profileVersion:1},entitlement:{adFree:false,version:1},catalogue:{}});await h.account.refresh();assert.equal(h.account.isAdFree(),true);assert.equal(h.account.getState().user.name,'新昵称');
 h.setState({user:{id:'alice',name:'旧昵称',profileVersion:0},entitlement:{adFree:false,version:3},catalogue:{}});await h.account.refresh();assert.equal(h.account.isAdFree(),false);assert.equal(h.account.getState().user.name,'新昵称');
});
function loginHarness({fail=false,complete=false}={}){
 const fs=require('node:fs'),vm=require('node:vm'),file=require.resolve('../miniprogram/pages/login/index');let definition,ready=complete;
 const calls=[],toasts=[],nav=[];let state={user:{name:'微信用户',profileComplete:complete}};
 const account={isReady:()=>ready,getState:()=>state,hasConsent:()=>false,login:async()=>{if(fail)throw Error('private-debug-error');ready=true;calls.push('login');return state;},updateProfile:async(name,path)=>{calls.push({name,path});state={user:{name,profileComplete:true}};}};
 const api={canIUse:()=>true,showToast:value=>toasts.push(value),switchTab:value=>nav.push(value),reLaunch:value=>nav.push(value)};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:value=>{definition=value;},require:name=>name.endsWith('/account')?account:require('../miniprogram/utils/login-route'),wx:api,console:{warn(){}}});
 const instance={...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};instance.onLoad({});instance.onShow();
 return{instance,calls,toasts,nav};
}
test('登录使用原生头像和表单昵称，保存后进入首页；已完善资料的账户直接进入',async()=>{
 const h=loginHarness();h.instance.chooseAvatar({detail:{avatarUrl:'wxfile://avatar'}});await h.instance.submitProfile({detail:{value:{nickname:'小明'}}});assert.equal(h.calls[1].name,'小明');assert.equal(h.calls[1].path,'wxfile://avatar');assert.equal(h.nav[0].url,'/pages/index/index');
 const existing=loginHarness({complete:true});assert.equal(existing.nav.length,1);assert.equal(existing.calls.length,0);
});
test('昵称组件清空后的表单值不能被旧值替代，登录失败不显示原始报错',async()=>{
 const h=loginHarness();h.instance.setData({avatarUrl:'wxfile://avatar',nickname:'旧昵称'});await h.instance.submitProfile({detail:{value:{nickname:''}}});assert.equal(h.calls.length,0);assert.equal(h.nav.length,0);
 const failed=loginHarness({fail:true});failed.instance.setData({avatarUrl:'wxfile://avatar'});await failed.instance.submitProfile({detail:{value:{nickname:'小明'}}});assert.equal(failed.instance.data.error,undefined);assert.equal(failed.instance.data.busy,false);assert.doesNotMatch(JSON.stringify(failed.toasts),/private-debug-error/);
});
