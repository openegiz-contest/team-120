export const QUARRY_MAPS=Object.freeze({
  quarry:Object.freeze({id:'quarry',title:'Мой карьер',subtitle:'Дневная смена',href:'./career.html',saveKey:'quarry-career-v1'}),
  altai:Object.freeze({id:'altai',title:'Алтай',subtitle:'Ночная смена',href:'./altai.html',saveKey:'quarry-career-altai-v1'})
});

export function resolveQuarryMap(pathname){return /(?:^|\/)altai\.html$/.test(pathname)?QUARRY_MAPS.altai:QUARRY_MAPS.quarry}

export function mountQuarryMaps(document,map){
  document.body.dataset.quarryMap=map.id;
  const css=document.createElement('link');css.rel='stylesheet';css.href='./quarry-maps.css?v=1';document.head.append(css);
  const menu=document.createElement('details');menu.className='map-switcher';
  menu.innerHTML='<summary aria-label="Выбрать карту">◈ <span>'+map.title+' · '+map.subtitle+'</span><i>⌄</i></summary><nav aria-label="Карты карьера">'+Object.values(QUARRY_MAPS).map(item=>'<a href="'+item.href+'"'+(item.id===map.id?' aria-current="page"':'')+'><b>'+item.title+'</b><span>'+item.subtitle+'</span><small>'+(item.id==='altai'?'Горная тайга · звёзды · освещённые дороги':'Открытый карьер · дневной свет')+'</small></a>').join('')+'<p>У каждой карты своё сохранение.</p></nav>';
  document.querySelector('header').insertBefore(menu,document.querySelector('.money'));
  if(map.id==='altai'){
    document.title='Алтай — ночная смена | Мой карьер';
    document.querySelector('meta[name="theme-color"]').content='#0a1b24';
    document.querySelector('.brand small').textContent='АЛТАЙ / НОЧНАЯ СМЕНА';
  }
}
