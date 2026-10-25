import {buildGraph,DispatchSimulation,STATES} from '../dist/dispatch-core.mjs';

export const SCENARIOS=Object.freeze([
  {id:'baseline',speed:36,delay:0}, {id:'speed24',speed:24,delay:0},
  {id:'speed48',speed:48,delay:0}, {id:'delay60',speed:36,delay:60}
]);

// Uses the game's original graph/FSM. This is an independent server control run.
export function createCollector(route,design){
  const graph=buildGraph(route,design);
  const create=config=>{const sim=new DispatchSimulation(graph,{speedKmh:config.speed});if(config.delay)sim.setMode('manual');sim.start();return sim};
  const runs=SCENARIOS.map(config=>({config,sim:create(config),hold:0,cycle:1}));
  const reference=SCENARIOS.map(config=>{
    const sim=create(config);for(let i=0;i<6100&&sim.status==='running';i++){if(config.delay&&sim.elapsed>=config.delay&&sim.mode==='manual')sim.setMode('auto');sim.tick(.05)}
    return {config,tonnes:sim.tonnes,seconds:sim.elapsed,fuelUsed:sim.config.fuel-sim.fuel,success:sim.status==='won'?1:0};
  });
  let lastTick=Date.now()/1000;
  return {runs,reference,tick(dt=1){
    if(!Number.isFinite(dt)||dt<=0)return;
    for(const run of runs){
      if(run.sim.status!=='running'){run.hold+=dt;if(run.hold>=15){run.sim=create(run.config);run.hold=0;run.cycle++}continue}
      if(run.config.delay&&run.sim.elapsed>=run.config.delay&&run.sim.mode==='manual')run.sim.setMode('auto');run.sim.tick(Math.min(dt,1));
    }lastTick=Date.now()/1000;
  },metrics(){
    const lines=[],emit=(name,labels,value)=>{if(Number.isFinite(value))lines.push(name+(labels?'{'+Object.entries(labels).map(([k,v])=>k+'='+JSON.stringify(String(v))).join(',')+'}':'')+' '+value)};
    emit('quarry_exporter_last_tick_seconds',null,lastTick);
    for(const {config,sim,cycle} of runs){
      const s={scenario:config.id};
      for(const [name,value] of Object.entries({tonnes:sim.tonnes,target_tonnes:sim.config.target,fuel_litres:sim.fuel,fuel_used_litres:sim.config.fuel-sim.fuel,elapsed_seconds:sim.elapsed,remaining_seconds:Math.max(0,sim.config.duration-sim.elapsed),plan_percent:100*sim.tonnes/sim.config.target,waiting_trucks:sim.trucks.filter(t=>t.state===STATES.WAITING).length,occupied_edges:[...sim.edges.values()].filter(e=>e.isOccupied).length,emergency_stops:sim.emergencyStops,cycle,won:sim.status==='won'?1:0,lost:sim.status==='lost'?1:0}))emit('quarry_shift_'+name,s,value);
      for(const t of sim.trucks){
        const labels={...s,truck:t.id},moving=[STATES.MOVING_EMPTY,STATES.MOVING_FULL].includes(t.state),edge=sim.edges.get(t.edgeId);
        for(const [name,value] of Object.entries({state:Object.values(STATES).indexOf(t.state),loaded:t.full?1:0,load_tonnes:t.full?sim.config.payload:0,speed_kmh:moving?Math.min(sim.config.speedKmh,sim.restrictions[edge?.block]||48)*(t.full?sim.config.fullSpeedFactor:1):0,brake_temperature_celsius:t.temperature,waiting_seconds:t.wait,fuel_used_litres:t.fuelUsed,deliveries:t.trips}))emit('quarry_truck_'+name,labels,value);
      }
    }
    for(const r of reference)for(const name of ['tonnes','seconds','fuelUsed','success'])emit('quarry_reference_'+name,{scenario:r.config.id},r[name]);
    return '# Independent QUARRY server simulation; not browser-player telemetry.\n'+lines.join('\n')+'\n';
  }};
}
