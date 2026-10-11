'use strict';

const ICONS = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c6 5 6 13 0 18M12 3c-6 5-6 13 0 18"/>',
  planet:'<circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-26 12 12)"/>',
  rocket:'<path d="M4 16c0-5 7-12 16-12 0 9-7 16-12 16l-4-4Z"/><path d="m9 15-3 5-2-2 5-3ZM14 9h.01M4 20l-1 2 2-1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  atom:'<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5v1"/>',
  chart:'<path d="M3 3v18h18M7 16l4-5 4 3 5-8"/>',
  box:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  shield:'<path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
  terminal:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 9 3 3-3 3m6 0h6"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2 7M20 4v7h-7"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  logout:'<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5m4-14 5 5-5 5m-9-5h14"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  alert:'<path d="m12 2 10 19H2L12 2Zm0 7v5m0 3h.01"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  cross:'<path d="M5 5l14 14M19 5 5 19"/>',
  layers:'<path d="m12 2 10 5-10 5L2 7l10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
  filter:'<path d="M4 7h16M7 12h10m-7 5h4"/>'
};
const icon = (name, size=18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.box}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const $ = sel => document.querySelector(sel);
const compact = x => Number.isFinite(Number(x)) ? new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(x)) : '—';
const number = x => Number.isFinite(Number(x)) ? new Intl.NumberFormat('en').format(Number(x)) : '—';
const datetime = ts => ts ? new Date(ts * 1000).toLocaleString() : 'Never';
const relative = ts => { if (!ts) return 'Not synced'; const n=Math.round((Date.now()/1000-ts)/60);return n<1?'Just now':n<60?`${n}m ago`:n<1440?`${Math.floor(n/60)}h ago`:`${Math.floor(n/1440)}d ago`; };
const safeJSON = v => JSON.stringify(v,null,2);
const state = { view:'overview', payload:{}, status:null, history:[], busy:false, modal:null, query:'', sort:'', desc:false, explorer:'/me', catalog:'/reference/ships', targets:loadTargets(), notice:'', page:0 };
const navigation = [
 ['overview','Command center','grid','COMMAND'],
 ['planets','Planets','planet','EMPIRE'],['fleets','Fleets','rocket'],['tasks','Production queue','clock'],
 ['research','Research','atom'],['commanders','Personnel','people'],['pa','Construction budget','box'],
 ['vision','Exploration','globe','INTELLIGENCE'],['relations','Diplomacy','shield'],
 ['analytics','Historical analytics','chart','TOOLS'],['catalog','Reference library','layers'],
 ['explorer','API explorer','terminal'],['settings','Settings & data','settings']
];
const pathByView={planets:'/me/planets',fleets:'/me/fleets',tasks:'/me/tasks',research:'/me/research',commanders:'/me/commanders',pa:'/me/pa',vision:'/me/vision',relations:'/me/relations'};
const aliases={planets:['planets','colonies'],fleets:['fleets'],tasks:['tasks','queue','queues'],research:['research','technologies'],commanders:['commanders','personnel','scientists'],pa:['pa','budget'],vision:['vision','systems'],relations:['relations','empires'],ships:['ships'],modules:['modules'],buildings:['buildings'],constants:['constants']};

function loadTargets(){try{const a=JSON.parse(localStorage.getItem('ue4_targets')||'{}');return a&&typeof a==='object'&&!Array.isArray(a)?a:{};}catch{return {};}}
function unwrap(data, hints=[]){
 if(data==null)return [];
 if(Array.isArray(data))return data;
 if(typeof data!=='object')return [{value:data}];
 for(const key of [...hints,'items','data','results','result','list','rows','values']){
   if(Array.isArray(data[key]))return data[key];
   if(data[key]&&typeof data[key]==='object'&&!Array.isArray(data[key])){
     const obj=data[key];
     if(Object.values(obj).length && Object.values(obj).every(v=>v&&typeof v==='object'&&!Array.isArray(v)))return Object.entries(obj).map(([id,v])=>({id,...v}));
   }
 }
 if(Object.values(data).length>1 && Object.values(data).every(v=>v&&typeof v==='object'&&!Array.isArray(v)))return Object.entries(data).map(([id,v])=>({id,...v}));
 return [data];
}
const getData=path=>state.payload[path]?.data ?? null;
const getRows=path=>unwrap(getData(path),aliases[path.slice(path.lastIndexOf('/')+1)]||[]);
const str = v => v == null ? '—' : typeof v==='object'? (Array.isArray(v)?`${v.length} items`:Object.keys(v).length?`${Object.keys(v).length} fields`:'—') : String(v);
const nval=v=>typeof v==='number'&&Number.isFinite(v)?v: typeof v==='string'&&v.trim()&&/^\d+(\.\d+)?$/.test(v)?Number(v):null;
function resourcePairs(x){
 if(!x||typeof x!=='object')return [];
 if(Array.isArray(x))return x.flatMap(o=>o&&typeof o==='object'?[[o.name||o.resource||o.type||o.id,o.amount??o.quantity??o.value??o.stock]]:[]).filter(([k,v])=>k!=null&&nval(v)!=null);
 return Object.entries(x).filter(([k,v])=>nval(v)!==null).map(([k,v])=>[k,Number(v)]);
}
function planetResources(row){
 if(!row||typeof row!=='object')return [];
 for(const key of ['resources','stocks','stock','resourceStocks','resource_stocks','ressources','materials','storage'])if(row[key]&&typeof row[key]==='object')return resourcePairs(row[key]);
 return [];
}
function resourceTotals(rows){const sum={};for(const row of rows)for(const [name,count] of planetResources(row)){const k=String(name);sum[k]=(sum[k]||0)+Number(count);}return Object.entries(sum).sort((a,b)=>b[1]-a[1]);}
function tasksRows(){const d=getData('/me/tasks');let rows=unwrap(d,['tasks']);if(rows.length===1&&rows[0]===d&&d&&!Array.isArray(d)&&typeof d==='object'){
  rows=Object.entries(d).flatMap(([category,val])=>Array.isArray(val)?val.map(item=>({category,...item})):[]);if(!rows.length)rows=unwrap(d);
 }return rows;
}
function activeTaskCount(){return tasksRows().length;}
function field(row, keys){for(const key of keys)if(row&&row[key]!==undefined&&row[key]!==null)return row[key];return null;}
function rowName(row,i){return str(field(row,['name','title','label','planetName','fleetName','type','username','code','id'])??`Record ${i+1}`);}
function completion(task){const v=field(task,['endsAt','endAt','finishAt','completedAt','completionAt','finish_at','end_at','ends_at','completion_time','eta','endTime']);if(v==null)return null;const num=nval(v);if(num!=null)return num>1e12?num/1000:num>1e9?num:null;const d=Date.parse(v);return Number.isFinite(d)?d/1000:null;}
function countdown(ts){if(!ts)return 'Unknown';let sec=Math.round(ts-Date.now()/1000);if(sec<=0)return 'Due';const days=Math.floor(sec/86400);sec%=86400;const hours=Math.floor(sec/3600);const mins=Math.floor((sec%3600)/60);return days?`${days}d ${hours}h`:hours?`${hours}h ${mins}m`:`${mins}m`;}
function cardNumber(label,value,ico,detail,accent=''){return `<div class="stat-card ${accent}"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(ico,19)}</span></div><div class="stat-number">${esc(value)}</div><div class="stat-detail">${esc(detail)}</div></div>`;}
function panel(title,subtitle,contents,extra=''){return `<section class="panel"><div class="panel-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${extra}</div>${contents}</section>`;}
function empty(title,detail,ico='database'){return `<div class="empty">${icon(ico,34)}<h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;}
function chips(values){return `<div class="chips">${values.map(v=>`<span class="chip">${esc(v)}</span>`).join('')}</div>`;}
function button(action,label,style='ghost',attr=''){return `<button class="btn ${style}" data-action="${esc(action)}" ${attr}>${label}</button>`;}
function pageHeading(kicker,title,desc,actions=''){return `<header class="page-heading"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="page-actions">${actions}</div></header>`;}
function datasetNotice(path){const d=state.payload[path];if(!d)return `<div class="notice">${icon('info')} No data cached for <code>${esc(path)}</code>. Use Sync this section to retrieve it.</div>`;return `<div class="sync-label">${icon('check',14)} Snapshot ${relative(d.updatedAt)} · ${datetime(d.updatedAt)}</div>`;}
function listTable(rows,{columns=null,limit=80}={}){
 if(!rows?.length)return empty('No records available','Sync the relevant endpoint to load actual game data.');
 const objects=rows.map(row=>row&&typeof row==='object'&&!Array.isArray(row)?row:{value:row});
 const keys=columns||Array.from(new Set(objects.flatMap(o=>Object.keys(o)))).sort((a,b)=>{
    const priorities=['name','id','type','status','level','coordinates','resources','ships','progress'];const pa=priorities.indexOf(a),pb=priorities.indexOf(b);return (pa<0?100:pa)-(pb<0?100:pb);
 }).slice(0,7);
 const q=state.query.toLowerCase().trim();let items=objects.map((row,i)=>({row,i})).filter(({row})=>!q||JSON.stringify(row).toLowerCase().includes(q));
 if(state.sort&&keys.includes(state.sort))items.sort((a,b)=>{
  const x=a.row[state.sort],y=b.row[state.sort],xn=nval(x),yn=nval(y);
  const c=xn!==null&&yn!==null?xn-yn:String(x??'').localeCompare(String(y??''),undefined,{numeric:true});return state.desc?-c:c;
 });
 const pageSize=limit,pages=Math.max(1,Math.ceil(items.length/pageSize));state.page=Math.min(state.page,pages-1);
 const displayed=items.slice(state.page*pageSize,(state.page+1)*pageSize);
 return `<div class="table-wrap"><table><thead><tr>${keys.map(k=>`<th><button class="column-sort" data-action="sort" data-key="${esc(k)}">${esc(k.replace(/_/g,' '))}${state.sort===k?(state.desc?' ↓':' ↑'):''}</button></th>`).join('')}<th></th></tr></thead><tbody>${displayed.map(({row,i})=>`<tr>${keys.map(k=>`<td title="${esc(typeof row[k]==='object'?JSON.stringify(row[k]):str(row[k]))}">${k==='status'?`<span class="status-pill">${esc(str(row[k]))}</span>`:`<span class="cell-clip">${esc(str(row[k]))}</span>`}</td>`).join('')}<td class="view-cell">${button('detail',icon('arrow',15),'icon-btn',`data-row="${i}"`)}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>${number(items.length)} matching · ${number(rows.length)} total</span><div class="pager">${button('previous','Previous','ghost',`${state.page===0?'disabled':''}`)}<span>${state.page+1} / ${pages}</span>${button('next','Next','ghost',`${state.page>=pages-1?'disabled':''}`)}</div></div>`;
}
let detailRows=[];
function dataSection(title,path,description,columns){
 const rows=getRows(path);detailRows=rows.map(r=>r&&typeof r==='object'?r:{value:r});
 return pageHeading('EMPIRE DATA',title,description,button('refresh-one',`${icon('refresh',15)} Sync this section`,'primary',`data-path="${esc(path)}"`)+button('export-path',`${icon('download',15)} Export JSON`,'ghost',`data-path="${esc(path)}"`))+
 datasetNotice(path)+panel(`${title} records`,`${number(rows.length)} records from the latest API snapshot`,tableSearch()+listTable(rows,{columns}));
}
function tableSearch(){return `<div class="table-toolbar"><label class="search-input">${icon('search',16)}<input id="table-search" autocomplete="off" placeholder="Search all fields…" value="${esc(state.query)}" aria-label="Search records"></label></div>`;}
function overview(){
 const planets=getRows('/me/planets'),fleets=getRows('/me/fleets'),tasks=tasksRows(),resources=resourceTotals(planets);
 const who=getData('/me');const account=who&&typeof who==='object'?who:{};
 const totalResources=resources.reduce((s,[,v])=>s+v,0);
 const chartRows=resources.slice(0,6),max=Math.max(1,...chartRows.map(x=>x[1]));
 const accountLabel=account.username||account.name||'Commander';
 const recent=Object.entries(state.status?.cache||{}).sort((a,b)=>b[1]-a[1]).slice(0,6);
 return pageHeading('EMPIRE INTELLIGENCE',`Welcome, ${accountLabel}`,'Your operational picture, consolidated from the public read-only API.',button('refresh-core',`${icon('refresh',17)} Sync empire`,'primary')+button('refresh-reference',`${icon('layers',16)} Sync catalogs`,'ghost'))+
 `<div class="stat-grid">${cardNumber('Colonies',number(planets.length),'planet','Owned planets in your empire')}${cardNumber('Fleet groups',number(fleets.length),'rocket','Current fleet records')}${cardNumber('Queue entries',number(tasks.length),'clock','Active and reported tasks')}${cardNumber('Resource stock',resources.length?compact(totalResources):'—','database',resources.length?`${resources.length} resource types`:'Not exposed in planet snapshots')}</div>`+
 `<div class="two-col">${panel('Resource distribution','Aggregate holdings across owned planets',chartRows.length?`<div class="bar-list">${chartRows.map(([k,v])=>`<div class="bar-row"><div class="bar-label"><span>${esc(k)}</span><strong>${number(v)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,v/max*100)}%"></div></div></div>`).join('')}</div>`:empty('No resource inventory','Sync planets to populate resource holdings.','planet'),button('navigate','View planet ledger →','text-btn','data-view="planets"'))+
 panel('Production watch','Upcoming completion times from your task feed',tasks.length?`<div class="queue-list">${tasks.map((t,i)=>({t,i,finish:completion(t)})).sort((a,b)=>(a.finish||Infinity)-(b.finish||Infinity)).slice(0,6).map(({t,i,finish})=>`<div class="queue-row"><span class="queue-icon">${icon('clock')}</span><div><strong>${esc(rowName(t,i))}</strong><small>${esc(str(field(t,['category','type','status','planet','kind'])||'Task'))}</small></div><span class="countdown">${finish?countdown(finish):'In progress'}</span></div>`).join('')}</div>`:empty('No queued tasks','Sync your production queue to see timers.','clock'),button('navigate','Open production queue →','text-btn','data-view="tasks"'))}</div>`+
 `<div class="two-col">${panel('Data freshness','Most recently received API snapshots',recent.length?`<div class="endpoint-list">${recent.map(([k,v])=>`<div class="endpoint-row"><code>${esc(k)}</code><span>${relative(v)}</span></div>`).join('')}</div>`:empty('Your first sync is ready','Use Sync empire to retrieve game data.','refresh'))}${panel('Operational shortcuts','Common workflows',`<div class="quick-grid">${[['planets','Resource planner','planet'],['fleets','Fleet inventory','rocket'],['research','Technology progress','atom'],['analytics','Growth charts','chart'],['catalog','Game catalogs','layers'],['explorer','Raw API data','terminal']].map(([id,label,ico])=>`<button class="quick" data-action="navigate" data-view="${id}">${icon(ico,21)}<span>${esc(label)}</span>${icon('chevron',15)}</button>`).join('')}</div>`)}</div>`;
}
function planetsPage(){
 const rows=getRows('/me/planets'),resources=resourceTotals(rows);
 const targets=resources.map(([k,v])=>[k,v,Math.max(0,Number(state.targets[k]||0)-v)]);
 const planner=panel('Resource target planner','Set your own desired stock quantities; gaps are calculated locally and saved in this browser.',resources.length?`<div class="target-table"><div class="target-head"><span>Resource</span><span>Current stock</span><span>Target</span><span>Still needed</span></div>${targets.map(([k,v,gap])=>`<div class="target-row"><strong>${esc(k)}</strong><span>${number(v)}</span><input type="number" min="0" step="1" data-target="${esc(k)}" value="${esc(state.targets[k]??'')}" placeholder="0" aria-label="Target for ${esc(k)}"><span class="${gap>0?'negative':'positive'}">${gap?number(gap):'Covered'}</span></div>`).join('')}</div>`:empty('Resource fields not found','Resource planning appears once the planet endpoint exposes inventory fields.'));
 detailRows=rows;
 return pageHeading('ECONOMY & COLONIZATION','Planets','Compare colonies, review buildings, and plan resource stock targets.',button('refresh-one',`${icon('refresh')} Sync planets`,'primary','data-path="/me/planets"')+button('export-path',`${icon('download')} Export`,'ghost','data-path="/me/planets"'))+datasetNotice('/me/planets')+
 `<div class="mini-stats">${cardNumber('Owned planets',number(rows.length),'planet','Colonies in API')}${cardNumber('Resource types',number(resources.length),'database','Distinct inventory keys')}${cardNumber('Aggregate stock',resources.length?compact(resources.reduce((s,r)=>s+r[1],0)):'—','chart','Available inventory totals')}</div>`+
 planner+panel('Colony ledger','Click any row to inspect all fields, including mines, buildings and stored modules.',tableSearch()+listTable(rows));
}
function fleetsPage(){
 const rows=getRows('/me/fleets');detailRows=rows;
 let ships=0,cargo=0;for(const f of rows){const fleetShips=field(f,['ships','units']);if(Array.isArray(fleetShips))ships+=fleetShips.length;else if(nval(fleetShips)!=null)ships+=Number(fleetShips);const amount=field(f,['cargo','cargoAmount']);if(nval(amount)!=null)cargo+=Number(amount);}
 return pageHeading('MILITARY OPERATIONS','Fleets','Inspect owned fleet compositions, ships, progression, fuel, cargo and current status.',button('refresh-one',`${icon('refresh')} Sync fleets`,'primary','data-path="/me/fleets"')+button('export-path',`${icon('download')} Export`,'ghost','data-path="/me/fleets"'))+datasetNotice('/me/fleets')+
 `<div class="mini-stats">${cardNumber('Fleet records',number(rows.length),'rocket','Currently reported')}${cardNumber('Identifiable ships',number(ships),'layers','From explicit ship arrays or counts')}${cardNumber('Numeric cargo',cargo?number(cargo):'—','database','Where exposed as a scalar')}</div>`+
 panel('Fleet ledger','Open the details of any fleet to inspect full ship and module structure.',tableSearch()+listTable(rows));
}
function tasksPage(){
 const rows=tasksRows();detailRows=rows;
 const withDate=rows.map((t,i)=>({t,i,ts:completion(t)})).sort((a,b)=>(a.ts||Infinity)-(b.ts||Infinity));
 return pageHeading('OPERATIONS','Production queue','Construction, recruitment, research, shipbuilding and module production timelines.',button('refresh-one',`${icon('refresh')} Sync queue`,'primary','data-path="/me/tasks"'))+datasetNotice('/me/tasks')+
 `<div class="mini-stats">${cardNumber('Total entries',number(rows.length),'clock','From task endpoint')}${cardNumber('With completion ETA',number(withDate.filter(x=>x.ts).length),'check','Recognized timestamp fields')}${cardNumber('Due or past due',number(withDate.filter(x=>x.ts&&x.ts<Date.now()/1000).length),'alert','Based on reported timestamps')}</div>`+
 panel('Completion timeline','Times shown in your browser timezone',rows.length?`<div class="timeline">${withDate.slice(0,60).map(({t,i,ts})=>`<div class="timeline-entry"><div class="timeline-dot"></div><div class="timeline-entry-main"><strong>${esc(rowName(t,i))}</strong><small>${esc(str(field(t,['category','type','status','planetName','kind'])||'Task'))}</small></div><div class="timeline-date"><strong>${ts?countdown(ts):'ETA unavailable'}</strong><small>${ts?new Date(ts*1000).toLocaleString():'No time field'}</small></div>${button('detail',icon('arrow',15),'icon-btn',`data-row="${i}"`)}</div>`).join('')}</div>`:empty('Queue is empty','There are no queued entries in the latest snapshot.'))+
 panel('All tasks','Search and inspect every reported task field',tableSearch()+listTable(rows));
}
function researchPage(){const path='/me/research',d=getData(path),rows=getRows(path);detailRows=rows;
 return pageHeading('SCIENCE & TECHNOLOGY','Research','Review unlocked technologies, active research and the research reference catalog.',button('refresh-one',`${icon('refresh')} Sync research`,'primary',`data-path="${path}"`)+button('navigate',`${icon('layers')} Research catalog`,'ghost','data-view="catalog" data-catalog="/reference/research"'))+datasetNotice(path)+
 panel('Research progress','The complete current technology tree data, if exposed by the API.',tableSearch()+listTable(rows))+
 panel('Research payload','Unmodified API response for advanced technology analysis',rawBox(d,path));}
function commandersPage(){return dataSection('Personnel','/me/commanders','Commanders, scientists, assignments, skills and specialization points.');}
function paPage(){return dataSection('Construction budget','/me/pa','Review available and used construction capacity and budget allocations.');}
function relationsPage(){return dataSection('Diplomacy','/me/relations','Your empire membership, roles, alliances and relationship data.');}
function visionPage(){const rows=getRows('/me/vision');detailRows=rows;
 const points=rows.map((r,i)=>{const loc=r.coordinates||r.position||r;const x=nval(loc?.x??loc?.X),y=nval(loc?.y??loc?.Y);return x!==null&&y!==null?{x,y,label:rowName(r,i)}:null;}).filter(Boolean);
 let map='';if(points.length){const minx=Math.min(...points.map(p=>p.x)),maxx=Math.max(...points.map(p=>p.x)),miny=Math.min(...points.map(p=>p.y)),maxy=Math.max(...points.map(p=>p.y));const dx=maxx-minx||1,dy=maxy-miny||1;
 map=`<div class="galaxy-map"><svg viewBox="0 0 820 340" role="img" aria-label="Known systems coordinate scatter plot"><defs><pattern id="grid" width="41" height="34" patternUnits="userSpaceOnUse"><path d="M41 0H0V34" stroke="#254052" stroke-width="0.7" fill="none"/></pattern></defs><rect width="820" height="340" fill="url(#grid)"/>${points.slice(0,500).map(p=>`<circle cx="${30+(p.x-minx)/dx*760}" cy="${20+(p.y-miny)/dy*300}" r="4" fill="#5ce1c7" opacity=".8"><title>${esc(p.label)}</title></circle>`).join('')}</svg><p>Relative XY positions based only on coordinates returned by the API. Not a complete galaxy map.</p></div>`;
 }
 return pageHeading('EXPLORATION','Explored space','Visible and discovered systems from your empire perspective.',button('refresh-one',`${icon('refresh')} Sync exploration`,'primary','data-path="/me/vision"'))+datasetNotice('/me/vision')+
 panel('Known systems map',`${points.length} records have usable XY coordinates`,map||empty('No mappable coordinates','The latest vision data does not expose per-system x/y coordinates.','globe'))+
 panel('Exploration records','Search discovered and visible systems',tableSearch()+listTable(rows));
}
function sparkChart(data,label,formatter=number){
 if(!data.length)return empty('Not enough historical data','Sync the dashboard on multiple occasions to collect a time series.','chart');
 const w=800,h=255,p=42,min=Math.min(...data.map(v=>v.y)),max=Math.max(...data.map(v=>v.y)),diff=max-min||1;
 const pts=data.map((v,i)=>[p+(data.length===1?.5:i/(data.length-1))*(w-2*p),h-p-(v.y-min)/diff*(h-2*p)]);
 const line=pts.map(p=>p.join(',')).join(' '),area=`${p},${h-p} ${line} ${w-p},${h-p}`;
 return `<div class="chart"><div class="chart-meta"><strong>${esc(label)}</strong><span>Latest ${esc(formatter(data.at(-1).y))} · ${data.length} samples</span></div><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)} historical line chart"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#294051"/><line x1="${p}" y1="${p}" x2="${w-p}" y2="${p}" stroke="#294051" stroke-dasharray="4 6"/><polygon points="${area}" fill="#5ce1c7" opacity=".07"/><polyline points="${line}" fill="none" stroke="#5ce1c7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#5ce1c7"><title>${esc(datetime(data[i].at))}: ${esc(formatter(data[i].y))}</title></circle>`).join('')}<text x="5" y="${p+5}" fill="#98adbb" font-size="13">${esc(formatter(max))}</text><text x="5" y="${h-p}" fill="#98adbb" font-size="13">${esc(formatter(min))}</text></svg><div class="chart-range"><span>${esc(datetime(data[0].at))}</span><span>${esc(datetime(data.at(-1).at))}</span></div></div>`;
}
function analyticsPage(){const groups={'/me/planets':[],'/me/fleets':[],'/me/tasks':[]};for(const entry of state.history)if(groups[entry.path])groups[entry.path].push(entry);
 const timeSeries=(path,fn)=>groups[path].map(x=>({at:x.at,y:fn(x.data)}));
 const rowsFor=(data,path)=>unwrap(data,aliases[path.split('/').at(-1)]||[]);
 const p=timeSeries('/me/planets',d=>rowsFor(d,'/me/planets').length),f=timeSeries('/me/fleets',d=>rowsFor(d,'/me/fleets').length),t=timeSeries('/me/tasks',d=>rowsFor(d,'/me/tasks').length),r=timeSeries('/me/planets',d=>resourceTotals(rowsFor(d,'/me/planets')).reduce((s,[,v])=>s+v,0));
 return pageHeading('LONGITUDINAL INSIGHTS','Historical analytics','Charts are calculated from real local snapshots. No invented or simulated data.',button('refresh-core',`${icon('refresh')} Record new snapshot`,'primary')+button('export-history',`${icon('download')} Export history`,'ghost'))+
 `<div class="two-col">${panel('Colonies over time','Owned planet records',sparkChart(p,'Colony count'))}${panel('Fleets over time','Owned fleet records',sparkChart(f,'Fleet count'))}${panel('Resource stock trend','Sum of available numeric resource inventories',sparkChart(r,'Aggregated inventory'))}${panel('Queue load trend','Reported task entries',sparkChart(t,'Task count'))}</div>`+
 `<div class="notice">${icon('info')} Snapshots are recorded only when you manually sync data. Values missing from upstream responses cannot be reconstructed.</div>`;
}
function catalogPage(){const choices=state.status?.reference||['/reference','/reference/ships','/reference/modules','/reference/buildings','/reference/research','/reference/constants'];const p=state.catalog;const rows=getRows(p);detailRows=rows;
 return pageHeading('GAME KNOWLEDGE BASE','Reference library','Browse ships, equipment, structures, research and public game constants.',button('refresh-reference',`${icon('refresh')} Sync all catalogs`,'primary')+button('export-path',`${icon('download')} Export selection`,'ghost',`data-path="${esc(p)}"`))+
 `<div class="tab-strip">${choices.map(path=>button('catalog',esc(path.split('/').at(-1)).replace(/^reference$/,'Overview'),path===p?'tab active':'tab',`data-path="${esc(path)}"`)).join('')}</div>`+datasetNotice(p)+
 panel('Catalog browser',`${rows.length} entries · ${p}`,tableSearch()+listTable(rows))+
 panel('Unmodified catalog payload','Useful when a reference dataset is an object rather than a simple record list.',rawBox(getData(p),p));
}
function rawBox(data,path){return data==null?empty('No cached response','Sync this endpoint to inspect its original JSON.'): `<div class="raw-head">${button('copy-json',`${icon('box',15)} Copy JSON`,'ghost',`data-path="${esc(path)}"`)}</div><pre class="json-view">${esc(safeJSON(data))}</pre>`;}
function explorerPage(){const choices=state.status?.endpoints||[];const p=state.explorer;const d=getData(p);detailRows=getRows(p);
 return pageHeading('DEVELOPER TOOLKIT','API explorer','Inspect complete raw responses and individual cache timestamps.',button('refresh-one',`${icon('refresh')} Sync endpoint`,'primary',`data-path="${esc(p)}"`)+button('export-path',`${icon('download')} Export JSON`,'ghost',`data-path="${esc(p)}"`))+
 `<div class="endpoint-selector"><label for="endpoint-select">Endpoint</label><select id="endpoint-select">${choices.map(v=>`<option value="${esc(v)}" ${v===p?'selected':''}>GET /api/v1${esc(v)}</option>`).join('')}</select></div>`+
 datasetNotice(p)+panel(`GET /api/v1${p}`,'Exact response from the most recent successful sync',rawBox(d,p));
}
function settingsPage(){const u=state.status?.usage||{},data=state.status?.cache||{};const pct=Math.min(100,(u.used||0)/(u.limit||50)*100);
 return pageHeading('CONFIGURATION','Settings & data','Monitor your local API budget, manage exports and secure your installation.',button('logout',`${icon('logout')} Sign out`,'ghost'))+
 `<div class="two-col">${panel('API request budget','Conservative count of requests made by this application',`<div class="budget-big">${number(u.remaining??50)} <span>remaining / ${u.limit??50}</span></div><div class="bar-track large"><div class="bar-fill ${pct>=80?'warning':''}" style="width:${pct}%"></div></div><div class="budget-foot"><span>${u.used??0} requests in rolling 24h</span><span>Oldest slot frees: ${u.nextSlotAt?datetime(u.nextSlotAt):'—'}</span></div>${u.blockedUntil>Date.now()/1000?`<div class="notice warning">Upstream rate-limited until ${datetime(u.blockedUntil)}</div>`:''}`)}
 ${panel('Connection status','Server-side credentials are never exposed to the browser',`<div class="settings-list"><div><span>Empire Universe token</span><strong>${state.status?.configured?'Configured':'Not configured'}</strong></div><div><span>API access</span><strong>Read only</strong></div><div><span>Public hostname</span><strong>${esc(location.host)}</strong></div><div><span>Endpoint coverage</span><strong>${Object.keys(data).length} / ${(state.status?.endpoints||[]).length} cached</strong></div></div>`)}</div>`+
 panel('Data management','Download portable copies of your personal API snapshots and history.',`<div class="settings-actions">${button('export-all',`${icon('download')} Export all current snapshots`,'primary')}${button('export-history',`${icon('download')} Export historical snapshots`,'ghost')}${button('refresh-core',`${icon('refresh')} Sync 9 empire endpoints`,'ghost')}${button('refresh-reference',`${icon('layers')} Sync 6 reference endpoints`,'ghost')}</div>`)+
 panel('Cached endpoints','Data is held in persistent SQLite storage on your server.',`<div class="endpoint-list">${(state.status?.endpoints||[]).map(p=>`<div class="endpoint-row"><code>${esc(p)}</code><span>${data[p]?relative(data[p]):'Not synced'}</span>${button('refresh-one',icon('refresh',15),'icon-btn',`data-path="${esc(p)}"`)}</div>`).join('')}</div>`)+
 `<div class="notice">${icon('lock')} Protect the site with HTTPS. Keep <code>.env</code>, the SQLite database and server backups private. Never publish the API token in Git or a browser bundle.</div>`;
}
function page(){switch(state.view){case 'overview':return overview();case 'planets':return planetsPage();case 'fleets':return fleetsPage();case 'tasks':return tasksPage();case 'research':return researchPage();case 'commanders':return commandersPage();case 'pa':return paPage();case 'vision':return visionPage();case 'relations':return relationsPage();case 'analytics':return analyticsPage();case 'catalog':return catalogPage();case 'explorer':return explorerPage();case 'settings':return settingsPage();default:return overview();}}
function render(){const u=state.status?.usage||{};const nav=navigation.map(([id,name,ico,group])=>`${group?`<div class="nav-group">${esc(group)}</div>`:''}<button class="nav-link ${state.view===id?'selected':''}" data-action="navigate" data-view="${id}">${icon(ico,18)}<span>${esc(name)}</span>${state.view===id?'<span class="nav-indicator"></span>':''}</button>`).join('');
 $('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-logo">${icon('planet',25)}</div><div><strong>UE4 <span>MANAGER</span></strong><small>EMPIRE INTELLIGENCE</small></div></div><div class="nav-content">${nav}</div><div class="sidebar-bottom"><div class="quota-mini"><span>API DAILY BUDGET</span><strong>${u.remaining??50}<small> / ${u.limit??50} left</small></strong><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,(u.used||0)/50*100)}%"></div></div></div><button class="profile" data-action="navigate" data-view="settings"><div class="avatar">${icon('shield',19)}</div><span>Private instance<small>Authenticated session</small></span>${icon('chevron',16)}</button></div></aside><div class="workspace"><div class="topbar"><div class="breadcrumb"><span>UE4 MANAGER</span>${icon('chevron',13)}<strong>${esc(navigation.find(n=>n[0]===state.view)?.[1]||'Dashboard')}</strong></div><div class="top-controls"><span class="live-dot"></span><span class="connection-status">${state.status?.configured?'API token configured':'API token missing'}</span><button class="btn icon-btn" data-action="refresh-core" aria-label="Sync empire" title="Sync empire">${icon('refresh',17)}</button></div></div><main class="main-content">${state.notice?`<div class="notice ${state.notice.startsWith('Error:')?'warning':''}">${icon('info')}${esc(state.notice)}<button class="close-notice" data-action="dismiss">${icon('cross',14)}</button></div>`:''}${page()}<footer class="footer">UE4 MANAGER · PRIVATE EMPIRE OPERATIONS CENTER <span>READ-ONLY GAME INTEGRATION · ${(state.status?.endpoints||[]).length} ENDPOINTS</span></footer></main></div></div>${state.busy?'<div class="busy-overlay"><div class="busy-dialog"><div class="spinner"></div><strong>Synchronizing with Empire Universe</strong><span>Using your limited API request budget. Existing data remains available.</span></div></div>':''}${state.modal?`<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="Record details"><div class="modal-head"><div><span class="eyebrow">RECORD DETAILS</span><h2>${esc(state.modal.name)}</h2></div><button class="btn icon-btn" data-action="close-modal">${icon('cross')}</button></div><pre class="json-view">${esc(safeJSON(state.modal.data))}</pre><div class="modal-footer">${button('copy-detail',`${icon('box')} Copy record`,'primary')}${button('close-modal','Close','ghost')}</div></div></div>`:''}`;
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>el.classList.remove('visible'),3500);}
async function request(path,options={}){const res=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});let data;try{data=await res.json();}catch{throw new Error(`Invalid server response (HTTP ${res.status})`);}if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;}
async function hydrate(){const [status,snapshot,history]=await Promise.all([request('/api/status'),request('/api/snapshot'),request('/api/history')]);state.status=status;state.payload=snapshot.endpoints||{};state.history=history.snapshots||[];}
async function doSync(scope,paths){if(state.busy)return;state.busy=true;state.notice='';render();try{const body=paths?{scope:'selected',paths}:{scope};const result=await request('/api/refresh',{method:'POST',body:JSON.stringify(body)});await hydrate();const errors=result.results.filter(x=>!x.ok);const done=result.results.filter(x=>x.ok);state.notice=errors.length?`Error: ${done.length} endpoint(s) synced; ${errors.map(x=>`${x.path}: ${x.error}`).join('; ')}`:`Synced ${done.length} endpoint(s) successfully.`;toast(state.notice);}catch(e){state.notice=`Error: ${e.message}`;toast(state.notice);}finally{state.busy=false;render();}}
function downloadJSON(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function loginView(error=''){ $('#app').innerHTML=`<div class="login-page"><div class="login-glow"></div><div class="login-panel"><div class="login-mark">${icon('planet',32)}</div><div class="eyebrow">PRIVATE COMMAND INTERFACE</div><h1>Empire Intelligence</h1><p>Manage your empire's operational picture from one secure dashboard.</p><form id="login-form"><label for="password">Dashboard password</label><input id="password" type="password" autocomplete="current-password" required minlength="12" placeholder="Enter your password" autofocus><button type="submit" class="btn primary wide">${icon('lock',17)} Unlock command center ${icon('arrow',17)}</button>${error?`<div class="login-error">${esc(error)}</div>`:''}</form><div class="login-foot">UE4 MANAGER <span>PROTECTED ACCESS · READ ONLY</span></div></div></div>`;
 $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const pass=$('#password').value;const b=e.target.querySelector('button');b.disabled=true;b.textContent='Authenticating…';try{await request('/auth/login',{method:'POST',body:JSON.stringify({password:pass})});await hydrate();state.notice='';render();}catch(e){loginView(e.message);}});
}
async function init(){try{await hydrate();render();}catch(e){if(e.message==='Authentication required.')loginView();else loginView(e.message);}}

document.addEventListener('click',e=>{const element=e.target.closest('[data-action]');if(!element)return;const a=element.dataset.action;
 if(a==='close-modal'&&e.target.closest('.modal')&&!element.matches('button'))return;
 if(a==='navigate'){state.view=element.dataset.view;if(element.dataset.catalog)state.catalog=element.dataset.catalog;state.query='';state.sort='';state.page=0;state.notice='';state.modal=null;render();window.scrollTo(0,0);}
 else if(a==='refresh-core')doSync('core');else if(a==='refresh-reference')doSync('reference');else if(a==='refresh-one')doSync(null,[element.dataset.path]);
 else if(a==='catalog'){state.catalog=element.dataset.path;state.query='';state.sort='';state.page=0;render();}
 else if(a==='detail'){const item=detailRows[Number(element.dataset.row)];if(item!==undefined){state.modal={name:rowName(item,Number(element.dataset.row)),data:item};render();}}
 else if(a==='close-modal'){state.modal=null;render();}
 else if(a==='sort'){const k=element.dataset.key;state.desc=state.sort===k?!state.desc:false;state.sort=k;state.page=0;render();}
 else if(a==='previous'){state.page=Math.max(0,state.page-1);render();}else if(a==='next'){state.page++;render();}
 else if(a==='dismiss'){state.notice='';render();}
 else if(a==='export-path'){const p=element.dataset.path;downloadJSON(`ue4-${p.replace(/\W+/g,'-')}-${new Date().toISOString().slice(0,10)}.json`,getData(p));}
 else if(a==='export-all')downloadJSON('ue4-latest.json',state.payload);
 else if(a==='export-history')downloadJSON('ue4-history.json',state.history);
 else if(a==='copy-json')navigator.clipboard.writeText(safeJSON(getData(element.dataset.path||state.explorer))).then(()=>toast('Copied to clipboard.')).catch(()=>toast('Could not copy.'));
 else if(a==='copy-detail')navigator.clipboard.writeText(safeJSON(state.modal?.data)).then(()=>toast('Record copied.')).catch(()=>toast('Could not copy.'));
 else if(a==='logout')request('/auth/logout',{method:'POST',body:'{}'}).then(()=>{state.payload={};state.history=[];loginView();}).catch(ex=>toast(ex.message));
});
document.addEventListener('change',e=>{if(e.target.id==='endpoint-select'){state.explorer=e.target.value;state.query='';render();}else if(e.target.matches('[data-target]')){const v=e.target.value;const key=e.target.dataset.target;if(!v)delete state.targets[key];else if(Number.isFinite(Number(v))&&Number(v)>=0)state.targets[key]=Math.floor(Number(v));localStorage.setItem('ue4_targets',JSON.stringify(state.targets));render();}});
document.addEventListener('input',e=>{if(e.target.id==='table-search'){const input=e.target;state.query=input.value;state.page=0;const pos=input.selectionStart;const parent=input.closest('.panel');if(parent){const table=parent.querySelector('.table-wrap');if(table){const rows=detailRows;const temp=document.createElement('div');temp.innerHTML=listTable(rows);table.outerHTML=temp.querySelector('.table-wrap').outerHTML;const oldFooter=parent.querySelector('.table-footer');if(oldFooter)oldFooter.outerHTML=temp.querySelector('.table-footer')?.outerHTML||'';}}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal){state.modal=null;render();}});
init();
