import {DispatchSimulation,STATES} from './dispatch-core.mjs';

export const ECONOMY=Object.freeze({delivery:100,truck:200,excavator:500,maxTrucks:4,maxExcavators:2});
export const TUTORIAL_STAGES=['welcome','loading','haul','first-trip','first-reward','second-trip','buy-truck','fleet-ready','expanding','buy-excavator','complete'];
const truckFields=['id','full','state','nodeId','edgeId','progress','cursor','hub','block','temperature','fuelUsed','wait','serviceTime','command','yielding','broken','blockedBy','reason','trips','queueOffset','loaderSlot'];

// Beginner progression reuses the existing graph/FSM without changing shift mode.
export class CareerSimulation extends DispatchSimulation{
  constructor(graph){super(graph,{duration:1e12,target:1e12,fuel:1e12,brakeLimit:1e12,distanceScale:32,loadingSeconds:8,unloadingSeconds:3})}
  reset(){
    super.reset();this.template={...this.trucks[0]};this.trucks=[];this.wallet=0;this.deliveries=0;this.excavators=1;this.loaderSlots=[null];this.stage='welcome';this.nextTruckId=1;this.revision=0;this.lastIncome=0;this.events=[];this.sequence=0;this.mode='auto';
    this.addTruck(true);this.log('Ваш карьер: один самосвал и один экскаватор.');
  }
  addTruck(atFloor=false){
    const t={...this.template,id:'T'+this.nextTruckId++,full:false,state:STATES.IDLE,nodeId:(atFloor?this.graph.hubs.at(-1):this.graph.hubs[0]).mainNode,hub:atFloor?this.graph.hubs.length-1:0,edgeId:null,route:[],cursor:0,progress:0,block:null,tail:null,temperature:28,fuelUsed:0,wait:0,serviceTime:0,command:'GO',yielding:false,broken:false,blockedBy:null,reason:'Готов к работе',trips:0,queueOffset:0,loaderSlot:null};
    this.trucks.push(t);return t;
  }
  tutorialAction(){
    const next={welcome:'loading',haul:'first-trip','first-reward':'second-trip','fleet-ready':'expanding'}[this.stage];
    if(!next)return false;this.stage=next;this.status='running';this.paused=false;this.accumulator=0;this.revision++;return true;
  }
  skipTutorial(){this.stage='complete';this.status='running';this.paused=false;this.accumulator=0;this.revision++}
  buy(kind){
    const price=ECONOMY[kind];if(!['truck','excavator'].includes(kind)||this.wallet<price)return false;
    if(kind==='truck'&&this.trucks.length>=ECONOMY.maxTrucks||kind==='excavator'&&this.excavators>=ECONOMY.maxExcavators)return false;
    this.wallet-=price;this.lastIncome=0;
    if(kind==='truck'){this.addTruck();this.log('Куплен самосвал. Он отправляется к экскаватору.');if(this.stage==='buy-truck'){this.stage='fleet-ready';this.paused=true}}
    else{this.excavators++;this.loaderSlots.push(null);this.config.loadingSeconds=8/this.excavators;this.log('Второй экскаватор: загрузка за 4 секунды, два места погрузки.');if(this.stage==='buy-excavator'||this.stage==='expanding'){this.stage='complete';this.paused=false}}
    this.revision++;return true;
  }
  beginService(t){
    if(t.full)return super.beginService(t);
    let slot=this.loaderSlots.indexOf(t.id);if(slot<0)slot=this.loaderSlots.indexOf(null);
    if(slot<0){this.stop(t,'Ждёт свободный экскаватор',this.loaderSlots[0]);return false}
    this.loaderSlots[slot]=t.id;t.loaderSlot=slot;t.state=STATES.LOADING;t.serviceTime=8/this.excavators;t.reason='Экскаватор '+(slot+1)+' загружает руду';t.blockedBy=null;return true;
  }
  advanceService(t,dt){
    t.serviceTime-=dt;if(t.serviceTime>0)return;
    if(t.full){
      this.services.CRUSHER=null;this.tonnes+=this.config.payload;this.deliveries++;this.wallet+=ECONOMY.delivery;this.score=this.deliveries*100;this.lastIncome=this.elapsed;t.trips++;
      this.log(`+100 монет. ${t.id} доставил руду. Всего рейсов: ${this.deliveries}.`);
      if(this.stage==='first-trip'){this.stage='first-reward';this.paused=true}
      else if(this.stage==='second-trip'&&this.wallet>=ECONOMY.truck){this.stage='buy-truck';this.paused=true}
      else if(this.stage==='expanding'&&this.wallet>=ECONOMY.excavator){this.stage='buy-excavator';this.paused=true}
    }else{
      if(t.loaderSlot!==null)this.loaderSlots[t.loaderSlot]=null;t.loaderSlot=null;
      if(this.stage==='loading'){this.stage='haul';this.paused=true}
    }
    t.full=!t.full;t.state=STATES.IDLE;t.route=[];t.cursor=0;t.serviceTime=0;t.command='GO';t.reason='Готов к рейсу';t.nodeId=(t.full?this.graph.hubs.at(-1):this.graph.hubs[0]).mainNode;this.revision++;
  }
  tick(dt){
    if(this.status!=='running'||this.paused||!Number.isFinite(dt)||dt<=0)return;
    this.accumulator+=dt;
    while(this.accumulator>=.05-1e-8&&!this.paused&&this.status==='running'){this.step(.05);this.accumulator-=.05}
    if(this.paused)this.accumulator=0;
  }
  step(dt){
    this.elapsed+=dt;
    for(const t of [...this.trucks].sort((a,b)=>Number(b.full)-Number(a.full)||a.id.localeCompare(b.id))){
      if(t.state===STATES.LOADING||t.state===STATES.UNLOADING)this.advanceService(t,dt);
      else if(t.edgeId)this.move(t,dt);else this.atNode(t);
      if(t.state===STATES.WAITING||t.state===STATES.IDLE)t.wait+=dt;
    }
    this.deadlock();
  }
  snapshot(){return {version:1,wallet:this.wallet,deliveries:this.deliveries,excavators:this.excavators,stage:this.stage,elapsed:this.elapsed,status:this.status,nextTruckId:this.nextTruckId,trucks:this.trucks.map(t=>({...Object.fromEntries(truckFields.map(k=>[k,t[k]??null])),route:[...t.route],tail:t.tail?{...t.tail}:null}))}}
  static restore(graph,data){
    try{
      if(data?.version!==1||!TUTORIAL_STAGES.includes(data.stage)||!Number.isInteger(data.wallet)||data.wallet<0||!Number.isInteger(data.deliveries)||data.deliveries<0||![1,2].includes(data.excavators)||!Number.isFinite(data.elapsed)||data.elapsed<0||!Array.isArray(data.trucks)||data.trucks.length<1||data.trucks.length>4)return null;
      const s=new CareerSimulation(graph),ids=new Set();
      for(const t of data.trucks){
        if(!/^T[1-4]$/.test(t.id)||ids.has(t.id)||typeof t.full!=='boolean'||!Object.values(STATES).includes(t.state)||!s.nodes.has(t.nodeId)||t.edgeId!==null&&!s.edges.has(t.edgeId)||!Array.isArray(t.route)||!Number.isInteger(t.cursor)||!Number.isInteger(t.hub)||t.hub<0||t.hub>=graph.hubs.length)return null;
        if(!['progress','wait','serviceTime','trips'].every(k=>Number.isFinite(t[k])&&t[k]>=0)||t.block!==null&&(!Number.isInteger(t.block)||t.block<0||t.block>=s.blocks.length))return null;
        const route=t.full?graph.upRoute:graph.downRoute;if(t.route.length&&JSON.stringify(t.route)!==JSON.stringify(route)||t.cursor>t.route.length||t.edgeId&&(t.route[t.cursor]!==t.edgeId||t.progress>s.edges.get(t.edgeId).length+.001))return null;
        if(t.tail&&(!s.edges.has(t.tail.id)||!Number.isFinite(t.tail.distance)||t.tail.distance<0))return null;
        ids.add(t.id);
      }
      Object.assign(s,{wallet:data.wallet,deliveries:data.deliveries,tonnes:data.deliveries*100,score:data.deliveries*100,excavators:data.excavators,stage:data.stage,elapsed:data.elapsed,status:data.stage==='welcome'?'ready':'running',paused:true,nextTruckId:Math.max(...[...ids].map(id=>Number(id.slice(1))))+1});
      s.config.loadingSeconds=8/s.excavators;s.loaderSlots=Array(s.excavators).fill(null);s.trucks=data.trucks.map(t=>({...s.template,...Object.fromEntries(truckFields.map(k=>[k,t[k]])),route:[...t.route],tail:t.tail?{...t.tail}:null,broken:false}));
      for(const t of s.trucks){
        for(const id of [t.edgeId,t.tail?.id].filter(Boolean))if(!s.claim(s.edges.get(id),t))return null;
        if(t.block!==null)s.blocks[t.block].add(t.id);
        if(t.state===STATES.LOADING){if(!Number.isInteger(t.loaderSlot)||t.loaderSlot<0||t.loaderSlot>=s.excavators||s.loaderSlots[t.loaderSlot])return null;s.loaderSlots[t.loaderSlot]=t.id}
        if(t.state===STATES.UNLOADING){if(s.services.CRUSHER)return null;s.services.CRUSHER=t.id}
      }
      s.events=[];s.sequence=0;s.log('Карьер сохранён. Продолжите работу, когда будете готовы.');return s;
    }catch{return null}
  }
}
