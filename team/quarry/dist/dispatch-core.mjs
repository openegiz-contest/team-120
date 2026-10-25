// Pure deterministic simulation. Metres, Y-up. No renderer or wheel physics.
export const STATES = Object.freeze({IDLE:'IDLE',MOVING_EMPTY:'MOVING_EMPTY',LOADING:'LOADING',MOVING_FULL:'MOVING_FULL',UNLOADING:'UNLOADING',WAITING:'WAITING'});
export const DEFAULTS = Object.freeze({duration:300,target:500,payload:100,fuel:260,loadingSeconds:7,unloadingSeconds:4,speedKmh:36,distanceScale:8,fullSpeedFactor:.6,truckLength:9.5,brakeLimit:115});
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

export function buildGraph(route,design){
  const access=[[235,168,-365],[340,168,-365],[397,168,-340],[440,168,-285],[465,168,-220],[475,168,-115],route.samples[0].slice(1)];
  let offset=0;const samples=[[0,...access[0]]];
  for(let i=1;i<access.length;i++){offset+=distance(access[i-1],access[i]);samples.push([offset,...access[i]])}
  samples.push(...route.samples.slice(1).map(r=>[r[0]+offset,...r.slice(1)]));
  const roadEnd=samples.at(-1)[0];
  // A level service apron on the verified loading floor.
  for(const point of [[45,0,43],[-10,0,30]])samples.push([samples.at(-1)[0]+distance(samples.at(-1).slice(1),point),...point]);
  const length=samples.at(-1)[0];
  function sample(s,lateral=0){
    s=Math.max(0,Math.min(length,s));let lo=0,hi=samples.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m][0]<=s)lo=m;else hi=m}
    const a=samples[lo],b=samples[hi],t=(s-a[0])/(b[0]-a[0]||1);
    const p=a.slice(1).map((v,i)=>mix(v,b[i+1],t));
    const dx=b[1]-a[1],dz=b[3]-a[3],n=Math.hypot(dx,dz)||1;
    // Negative Blender left-normal = outward, widened side of the bay.
    p[0]-=dz/n*lateral;p[2]+=dx/n*lateral;return p;
  }
  const bays=design.passing_bays.map((b,i)=>({...b,index:i+1,s:b.station_m+offset,type:'PASSING_BAY'}));
  const hubs=[{id:'CRUSHER',index:0,s:0,type:'CRUSHER'},...bays,{id:'LOADER',index:bays.length+1,s:length,type:'LOADER'}];
  const stations=[0,length,...hubs.map(b=>b.s),...bays.flatMap(b=>[b.s-57.5,b.s-27.5,b.s+27.5,b.s+57.5])];
  for(let s=18;s<length;s+=18)if(!stations.some(v=>Math.abs(v-s)<6))stations.push(s);
  stations.sort((a,b)=>a-b);
  const unique=stations.filter((s,i)=>!i||s-stations[i-1]>.001);
  const nodes=[],edges=[],main=[],down=[],byId=new Map();
  const node=(id,s,lateral=0,type='WAYPOINT',hub=null)=>{const n={id,s,position:sample(s,lateral),lateral,type,hub};nodes.push(n);byId.set(id,n);return id};
  for(let i=0;i<unique.length;i++){
    const s=unique[i],hub=hubs.find(b=>Math.abs(b.s-s)<.001);
    const id=node('W'+i,s,0,hub?.type==='PASSING_BAY'?'WAYPOINT':hub?.type||'WAYPOINT',hub?.index??null);main.push(id);
    const bay=bays.find(b=>Math.abs(s-b.s)<57.5-.001);
    if(bay){const lateral=9.5*smooth((57.5-Math.abs(s-bay.s))/30);down.push(node('P'+i,s,lateral,hub?'PASSING_BAY':'WAYPOINT',hub?.index??null))}else down.push(id);
  }
  const edgeMap=new Map();
  function chain(ids){return ids.slice(1).map((b,i)=>{const a=ids[i],key=a+':'+b;
    if(edgeMap.has(key))return edgeMap.get(key);
    const na=byId.get(a),nb=byId.get(b);const mid=(na.s+nb.s)/2;
    const block=hubs.findIndex((h,j)=>j<hubs.length-1&&mid>=h.s&&mid<hubs[j+1].s);
    const e={id:'E'+edges.length,from:a,to:b,length:distance(na.position,nb.position),isOccupied:false,direction:null,owner:null,block};edges.push(e);edgeMap.set(key,e.id);return e.id;
  })}
  const mainEdges=chain(main),downEdges=chain(down);
  for(const h of hubs){h.mainNode=main[unique.findIndex(s=>Math.abs(s-h.s)<.001)];h.pocketNode=down[unique.findIndex(s=>Math.abs(s-h.s)<.001)];h.position=byId.get(h.pocketNode).position}
  return {nodes,edges,hubs,bays,length,offset,roadEnd,samples,sample,downRoute:downEdges,upRoute:mainEdges.slice().reverse()};
}

export class DispatchSimulation{
  constructor(graph,options={}){this.graph=graph;this.config={...DEFAULTS,...options};this.nodes=new Map(graph.nodes.map(n=>[n.id,n]));this.edges=new Map(graph.edges.map(e=>[e.id,{...e}]));this.mode='auto';this.reset()}
  reset(){
    this.elapsed=0;this.accumulator=0;this.fuel=this.config.fuel;this.tonnes=0;this.score=0;this.status='ready';this.reason='';this.stars=0;this.paused=false;this.events=[];this.sequence=0;this.serviceQueueWait=0;this.emergencyStops=0;this.restrictions={};
    this.services={CRUSHER:null,LOADER:null};this.blocks=this.graph.hubs.slice(1).map(()=>new Set());this.signals=this.graph.hubs.map(()=>({up:false,down:false}));
    for(const e of this.edges.values())Object.assign(e,{owner:null,isOccupied:false,direction:null});
    this.trucks=Array.from({length:4},(_,i)=>({id:'T'+(i+1),full:i>=2,state:STATES.IDLE,nodeId:i<2?this.graph.hubs[0].mainNode:this.graph.hubs.at(-1).mainNode,edgeId:null,progress:0,route:[],cursor:0,hub:i<2?0:this.graph.hubs.length-1,block:null,tail:null,temperature:28,fuelUsed:0,wait:0,serviceTime:0,command:'STOP',yielding:false,broken:false,blockedBy:null,reason:'Готов к смене',trips:0,queueOffset:(i%2)*14}));
    this.log('Смена готова: две машины с грузом внизу, две пустые наверху.');
  }
  log(message){this.events.unshift({id:++this.sequence,time:this.elapsed,message});this.events.length=Math.min(this.events.length,60)}
  start(){if(this.status==='ready'){this.status='running';this.log(this.mode==='auto'?'Автодиспетчер принял смену.':'Ручной режим: разрешите отправление машин.')}}
  setMode(mode){if(!['auto','manual'].includes(mode))return;this.mode=mode;for(const t of this.trucks){t.command='STOP';t.yielding=false}this.log(mode==='auto'?'Включён автодиспетчер.':'Ручной режим: машины остановятся в ближайших безопасных узлах.')}
  command(id,command){const t=this.trucks.find(t=>t.id===id);if(!t||!['STOP','GO','YIELD'].includes(command)||t.broken)return;
    t.command=command;t.yielding=command==='YIELD';this.log(`${id}: ${command==='GO'?'ехать до следующего узла':command==='YIELD'?'занять карман и пропустить груз':'остановиться в ближайшем безопасном узле'}.`);
  }
  setSignal(hub,direction,open){if(this.signals[hub]&&['up','down'].includes(direction))this.signals[hub][direction]=!!open}
  setLimit(block,kmh){if(Number.isFinite(kmh)&&kmh>=20&&kmh<=48)this.restrictions[block]=kmh}
  position(t){if(!t.edgeId)return this.nodes.get(t.nodeId).position.slice();const e=this.edges.get(t.edgeId),a=this.nodes.get(e.from),b=this.nodes.get(e.to);const u=t.progress/e.length;return (t.full?b.position:a.position).map((v,i)=>mix(v,(t.full?a.position:b.position)[i],u))}
  station(t){if(!t.edgeId)return this.nodes.get(t.nodeId).s;const e=this.edges.get(t.edgeId),a=this.nodes.get(e.from).s,b=this.nodes.get(e.to).s;return t.full?mix(b,a,t.progress/e.length):mix(a,b,t.progress/e.length)}
  lateral(t){if(!t.edgeId)return this.nodes.get(t.nodeId).lateral;const e=this.edges.get(t.edgeId),a=this.nodes.get(e.from).lateral,b=this.nodes.get(e.to).lateral;return t.full?mix(b,a,t.progress/e.length):mix(a,b,t.progress/e.length)}
  heading(t){const route=t.full?this.graph.upRoute:this.graph.downRoute;const e=this.edges.get(t.edgeId||t.route[t.cursor]||route[0]);const a=this.nodes.get(t.full?e.to:e.from).position,b=this.nodes.get(t.full?e.from:e.to).position;return b.map((v,i)=>v-a[i])}
  claim(e,t){if(e.owner&&e.owner!==t.id)return false;Object.assign(e,{owner:t.id,isOccupied:true,direction:t.full?'up':'down'});return true}
  release(id,t){const e=this.edges.get(id);if(e?.owner===t.id)Object.assign(e,{owner:null,isOccupied:false,direction:null})}
  releaseBlock(t){if(t.block!==null)this.blocks[t.block].delete(t.id);t.block=null}
  stop(t,reason,by=null){t.state=STATES.WAITING;t.reason=reason;t.blockedBy=by}
  movingState(t){return t.full?STATES.MOVING_FULL:STATES.MOVING_EMPTY}
  plan(t){t.route=(t.full?this.graph.upRoute:this.graph.downRoute).slice();t.cursor=0;t.queueOffset=0}
  // Prediction is measured on the graph, not by Euclidean distance across benches.
  meeting(t){const s=this.station(t),ve=this.config.speedKmh/3.6*this.config.distanceScale,vf=ve*this.config.fullSpeedFactor;
    const full=this.trucks.filter(v=>v.full&&!v.broken&&this.station(v)>s).sort((a,b)=>this.station(a)-this.station(b))[0];
    if(!full)return null;return {truck:full.id,station:s+(this.station(full)-s)*ve/(ve+vf),seconds:(this.station(full)-s)/(ve+vf)};
  }
  canDepart(t){
    const dir=t.full?-1:1,block=t.full?t.hub-1:t.hub;
    if(block<0||block>=this.blocks.length)return false;
    const targetHub=t.hub+dir,otherSlot=this.trucks.find(v=>v!==t&&v.hub===targetHub&&!v.edgeId&&v.full===t.full&&!['LOADING','UNLOADING'].includes(v.state));
    if(targetHub>0&&targetHub<this.graph.hubs.length-1&&otherSlot){this.stop(t,'Следующий карман занят',otherSlot.id);return false}
    const direction=t.full?'up':'down';
    if(this.mode==='manual'&&t.command==='STOP'&&!this.signals[t.hub][direction]){t.state=t.hub===0||t.hub===this.graph.hubs.length-1?STATES.IDLE:STATES.WAITING;t.reason='Ожидает сигнала диспетчера';return false}
    if(this.mode==='auto'||t.yielding){
      const convoy=[...this.blocks[block]].find(id=>id!==t.id);
      if(convoy){this.stop(t,'Участок зарезервирован: '+convoy,convoy);return false}
      const opposing=[...this.blocks[block]].map(id=>this.trucks.find(v=>v.id===id)).find(v=>v.full!==t.full);
      if(opposing){this.stop(t,t.full?'Участок ещё освобождается':'Пропускает гружёный '+opposing.id,opposing.id);return false}
      if(!t.full){
        const lower=this.graph.hubs[targetHub].s;
        const approaching=this.trucks.filter(v=>v.full&&this.station(v)>=this.station(t)-1).find(v=>{
          const speed=this.config.speedKmh/3.6*this.config.distanceScale;
          const emptySpeed=Math.min(this.config.speedKmh,this.restrictions[block]||48)/3.6*this.config.distanceScale;
          const emptyETA=(lower-this.station(t))/emptySpeed;
          const fullETA=Math.max(0,this.station(v)-lower)/(speed*this.config.fullSpeedFactor);
          return this.station(v)<=lower||fullETA<=emptyETA+3;
        });
        if(approaching){this.stop(t,'Приоритет груза: '+approaching.id,approaching.id);return false}
      }
    }
    this.blocks[block].add(t.id);t.block=block;return true;
  }
  beginService(t){const service=t.full?'CRUSHER':'LOADER';const owner=this.services[service];
    if(owner&&owner!==t.id){this.stop(t,'Очередь: '+(t.full?'разгрузка':'загрузка'),owner);return false}
    this.services[service]=t.id;t.state=t.full?STATES.UNLOADING:STATES.LOADING;t.serviceTime=t.full?this.config.unloadingSeconds:this.config.loadingSeconds;t.reason=t.full?'Разгрузка руды':'Загрузка экскаватором';t.blockedBy=null;return true;
  }
  advanceService(t,dt){t.serviceTime-=dt;if(t.serviceTime>0)return;
    this.services[t.full?'CRUSHER':'LOADER']=null;
    if(t.full){this.tonnes+=this.config.payload;this.score+=this.config.payload*10;t.trips++;this.log(`${t.id}: доставлено ${this.config.payload} т. План ${this.tonnes}/${this.config.target} т.`)}
    t.full=!t.full;t.state=STATES.IDLE;t.route=[];t.command=this.mode==='auto'?'GO':'STOP';t.reason='Готов к рейсу';t.nodeId=(t.full?this.graph.hubs.at(-1):this.graph.hubs[0]).mainNode;
  }
  atNode(t){
    const terminal=t.full?t.hub===0:t.hub===this.graph.hubs.length-1;
    if(terminal){this.beginService(t);return}
    if(!t.route.length)this.plan(t);
    if(!this.canDepart(t))return;
    const e=this.edges.get(t.route[t.cursor]);
    if(!e||!this.claim(e,t)){this.releaseBlock(t);this.stop(t,'Въезд занят',e?.owner);return}
    t.edgeId=e.id;t.progress=0;t.state=this.movingState(t);t.reason='';t.blockedBy=null;
  }
  move(t,dt){
    const e=this.edges.get(t.edgeId);const kmh=Math.min(this.config.speedKmh,this.restrictions[e.block]||48);
    const speed=kmh/3.6*this.config.distanceScale*(t.full?this.config.fullSpeedFactor:1);
    let travel=speed*dt;
    // Follow spacing is also checked across an edge boundary and at bay merges.
    const ahead=this.trucks.find(v=>v!==t&&v.full===t.full&&Math.abs(this.lateral(v)-this.lateral(t))<6&&((this.station(v)-this.station(t))*(t.full?-1:1))>0&&((this.station(v)-this.station(t))*(t.full?-1:1))<this.config.truckLength+8);
    if(ahead){this.stop(t,'Дистанция до '+ahead.id,ahead.id);return}
    const remaining=e.length-t.progress;const endNode=this.nodes.get(t.full?e.from:e.to);
    const next=this.edges.get(t.route[t.cursor+1]);
    const nextOccupied=next?.owner&&next.owner!==t.id;
    if(endNode.hub===null&&nextOccupied&&remaining<=travel+6){travel=Math.max(0,remaining-6);this.stop(t,'Занят следующий сегмент',next.owner)}else{t.state=this.movingState(t);t.blockedBy=null;t.reason=''}
    t.progress+=Math.min(travel,remaining);
    if(t.tail){t.tail.distance+=travel;if(t.tail.distance>=6){this.release(t.tail.id,t);t.tail=null}}
    if(t.progress<e.length-1e-7)return;
    t.nodeId=endNode.id;t.cursor++;
    if(endNode.hub!==null){
      this.release(e.id,t);if(t.tail){this.release(t.tail.id,t);t.tail=null}
      t.edgeId=null;t.hub=endNode.hub;this.releaseBlock(t);t.state=STATES.IDLE;t.blockedBy=null;
      if(this.mode==='manual')t.command=t.yielding?'YIELD':'STOP';
      // Yield is a hold instruction only until the conflicting loaded convoy clears.
      return;
    }
    if(next&&this.claim(next,t)){
      if(t.tail)this.release(t.tail.id,t);
      t.tail={id:e.id,distance:0};t.edgeId=next.id;t.progress=0;
    }else this.stop(t,'Занят следующий сегмент',next?.owner);
  }
  deadlock(){
    // A cycle of opposing committed trucks inside a one-lane block has no exit.
    for(const t of this.trucks){if(!t.edgeId||!t.blockedBy)continue;
      const chain=new Set([t.id]);let other=this.trucks.find(v=>v.id===t.blockedBy);
      while(other?.edgeId&&other.blockedBy){if(chain.has(other.id)){if([...chain].some(id=>this.trucks.find(v=>v.id===id).full!==t.full)){this.emergencyStops++;this.finish(false,'Неразрешимый встречный затор между карманами');return true}break}chain.add(other.id);other=this.trucks.find(v=>v.id===other.blockedBy)}
    }return false;
  }
  finish(won,reason){if(this.status!=='running')return;this.status=won?'won':'lost';this.reason=reason;
    const efficient=this.fuel>this.config.fuel*.2&&this.emergencyStops===0;
    this.stars=won?1+(efficient?1:0)+(efficient&&this.serviceQueueWait<.5?1:0):0;this.log(reason);
  }
  tick(dt){if(this.status!=='running'||this.paused||!Number.isFinite(dt)||dt<=0)return;
    // Fixed substeps keep edge ownership and resource use independent of FPS.
    this.accumulator+=dt;while(this.accumulator>=.05-1e-8&&this.status==='running'){this.step(.05);this.accumulator-=.05}
  }
  step(dt){
    const available=Math.max(0,this.config.duration-this.elapsed);dt=Math.min(dt,available);this.elapsed+=dt;
    // Loaded requests are processed before empty departures on the same tick.
    const order=[...this.trucks].sort((a,b)=>Number(b.full)-Number(a.full)||a.id.localeCompare(b.id));
    for(const t of order){
      const moving=t.state===STATES.MOVING_EMPTY||t.state===STATES.MOVING_FULL;
      const rate=moving?(t.full?.28:.15):.045;const used=rate*dt;t.fuelUsed+=used;this.fuel=Math.max(0,this.fuel-used);
      if(t.broken){t.wait+=dt;continue}
      const descending=moving&&!t.full&&this.station(t)>this.graph.offset&&this.station(t)<this.graph.roadEnd;
      const edge=t.edgeId&&this.edges.get(t.edgeId);const kmh=Math.min(this.config.speedKmh,this.restrictions[edge?.block]||48);
      t.temperature=Math.max(28,t.temperature+(descending?1.15*(kmh/36)**2:-.7)*dt);
      if(t.temperature>=this.config.brakeLimit){t.broken=true;this.emergencyStops++;this.stop(t,'Перегрев тормозов — участок заблокирован');this.log(t.id+': отказ тормозов. Машина блокирует дорогу.');continue}
      if(t.state===STATES.LOADING||t.state===STATES.UNLOADING)this.advanceService(t,dt);
      else if(t.edgeId)this.move(t,dt);else this.atNode(t);
      if(t.state===STATES.WAITING||t.state===STATES.IDLE){t.wait+=dt;if(t.reason.startsWith('Очередь:'))this.serviceQueueWait+=dt}
    }
    if(this.deadlock())return;
    if(this.fuel<=0){this.finish(false,'Топливо парка закончилось');return}
    if(this.tonnes>=this.config.target){this.finish(true,'План выполнен вовремя');return}
    if(this.elapsed>=this.config.duration-1e-8)this.finish(false,'Смена закончилась: план по руде не выполнен');
  }
}
