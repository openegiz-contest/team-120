export const QUARRY_MAPS=Object.freeze({
  quarry:Object.freeze({id:'quarry',title:'Мой карьер',subtitle:'Дневная смена',href:'./career.html',saveKey:'quarry-career-v1'}),
  altai:Object.freeze({id:'altai',title:'Алтай',subtitle:'Ночная смена',href:'./altai.html',saveKey:'quarry-career-altai-v1'}),
  sarbay:Object.freeze({id:'sarbay',title:'Сарбайский',subtitle:'Рудный · день',href:'./sarbay.html',saveKey:'quarry-career-sarbay-v1',rudny:true}),
  sokolov:Object.freeze({id:'sokolov',title:'Соколовский',subtitle:'Рудный · день',href:'./sokolov.html',saveKey:'quarry-career-sokolov-v1',rudny:true})
});

export function resolveQuarryMap(pathname){const rudny=/(?:^|\/)(sarbay|sokolov)\.html$/.exec(pathname);if(rudny)return QUARRY_MAPS[rudny[1]];return /(?:^|\/)altai\.html$/.test(pathname)?QUARRY_MAPS.altai:QUARRY_MAPS.quarry}

export function mountQuarryMaps(document,map){
  document.body.dataset.quarryMap=map.id;
  const css=document.createElement('link');css.rel='stylesheet';css.href='./quarry-maps.css?v=rudny-1';document.head.append(css);
  const menu=document.createElement('details');menu.className='map-switcher';
  const choices=[QUARRY_MAPS.sarbay,QUARRY_MAPS.sokolov,QUARRY_MAPS.altai,QUARRY_MAPS.quarry];
  const descriptions={sarbay:'Вытянутая чаша · 10 уступов · охра',sokolov:'Асимметричная чаша · 12 уступов · серый камень',altai:'Дополнительная карта · горная тайга · ночь',quarry:'Исходная учебная карта · ваш прежний прогресс'};
  menu.innerHTML='<summary aria-label="Выбрать карту">◈ <em>Карты</em><span>'+map.title+' · '+map.subtitle+'</span><i>⌄</i></summary><nav aria-label="Карты карьера">'+choices.map(item=>'<a href="'+item.href+'"'+(item.id===map.id?' aria-current="page"':'')+'><b>'+item.title+'</b><span>'+item.subtitle+'</span><small>'+descriptions[item.id]+'</small></a>').join('')+'<p>У каждой карты своё сохранение. Карты Рудного — игровые интерпретации.</p></nav>';
  document.querySelector('header').insertBefore(menu,document.querySelector('.money'));
  if(map.rudny){document.title=map.title+' карьер | Мой карьер';document.querySelector('.brand small').textContent='РУДНЫЙ / '+map.title.toUpperCase()+' КАРЬЕР'}
  if(map.id==='altai'){
    document.title='Алтай — ночная смена | Мой карьер';
    document.querySelector('meta[name="theme-color"]').content='#0a1b24';
    document.querySelector('.brand small').textContent='АЛТАЙ / НОЧНАЯ СМЕНА';
  }
}
