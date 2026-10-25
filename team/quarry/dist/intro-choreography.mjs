// Metres and seconds. The same deterministic pose is used on every screen size.
export const INTRO_DURATION=9.6;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
const poses=[
  [0,.22,-.35,-.20],
  [3.7,.22,-.35,-.20],
  [5.6,-.035,.04,.07],
  [6.55,-.11,.10,.35],
  [7.45,-.04,.02,-.35],
  [8.55,.12,-.18,-.40],
  [INTRO_DURATION,.12,-.18,-.40]
];
export function introPose(time,entryX=-23){
  const t=Math.max(0,time),drive=smooth((t-.55)/2.9);
  let a=poses[0],b=poses.at(-1);
  for(let i=1;i<poses.length;i++)if(t<=poses[i][0]){a=poses[i-1];b=poses[i];break}
  const k=smooth((t-a[0])/(b[0]-a[0]));
  const phase=t<.55?'blank':t<3.7?'arrive':t<5.6?'lower':t<6.55?'dig':t<8.55?'lift':'reveal';
  return {x:entryX+(-1.4-entryX)*drive,boom:a[1]+(b[1]-a[1])*k,stick:a[2]+(b[2]-a[2])*k,bucket:a[3]+(b[3]-a[3])*k,
    cut:smooth((t-5.55)/1.0),fade:smooth((t-8.65)/.95),progress:clamp(t/INTRO_DURATION),phase,done:t>=INTRO_DURATION};
}
