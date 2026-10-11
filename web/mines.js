'use strict';
/* Mine investment planner. No assumed game formulas: only API values and operator inputs. */
const MinePlanner = (() => {
  const numeric = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : null;
  const key = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const prop = (obj, names) => {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const name of names) if (obj[name] !== undefined && obj[name] !== null) return obj[name];
    return undefined;
  };
  const rate = obj => numeric(prop(obj, ['productionPerHour','production_per_hour','hourlyProduction','hourlyRate','ratePerHour','rate_per_hour','productionRate']));
  const hours = obj => {
    const hr = numeric(prop(obj,['buildHours','buildTimeHours','durationHours']));
    if (hr !== null) return hr;
    const min = numeric(prop(obj,['buildMinutes','buildTimeMinutes','durationMinutes']));
    if (min !== null) return min / 60;
    const sec = numeric(prop(obj,['buildSeconds','buildTimeSeconds','durationSeconds','buildTime','constructionTime']));
    return sec === null ? null : sec / 3600;
  };
  function parseCosts(text) {
    if (text === '' || text == null) return null;
    if (typeof text === 'object') {
      if (Array.isArray(text)) {
        const result = {};
        for (const entry of text) {
          if (!entry || typeof entry !== 'object') return null;
          const resource = prop(entry,['resource','name','type','id']);
          const amount = numeric(prop(entry,['amount','quantity','value','cost']));
          if (!resource || amount === null || amount < 0) return null;
          result[String(resource).toLowerCase()] = (result[String(resource).toLowerCase()] || 0) + amount;
        }
        return Object.keys(result).length ? result : null;
      }
      const nested = prop(text,['resources','costs','materials']);
      if (nested && nested !== text && typeof nested === 'object') return parseCosts(nested);
      const result = {};
      for (const [resource, raw] of Object.entries(text)) {
        const amount = numeric(raw);
        if (amount === null || amount < 0) return null;
        result[resource.toLowerCase()] = amount;
      }
      return Object.keys(result).length ? result : null;
    }
    if (typeof text !== 'string') return null;
    const result = {};
    for (const segment of text.split(/[,;]+/)) {
      const match = segment.trim().match(/^([^:=]+)\s*[:=]\s*(\d+(?:\.\d+)?)$/);
      if (!match) return null;
      const resource = match[1].trim().toLowerCase();
      if (!resource) return null;
      result[resource] = (result[resource] || 0) + Number(match[2]);
    }
    return Object.keys(result).length ? result : null;
  }
  const costText = value => {
    if (typeof value === 'string') return value;
    const obj = parseCosts(value);
    return obj ? Object.entries(obj).map(([name,n]) => `${name}:${n}`).join(', ') : '';
  };
  function parseWeights(text) {
    if (!text || !text.trim()) return {};
    const costs = parseCosts(text);
    return costs && Object.values(costs).every(x=>x>0) ? costs : null;
  }
  function toList(source, forced=false) {
    if (Array.isArray(source)) return source.map((item,i) => ({label:prop(item,['name','type','code','resource','id']) || String(i+1),item,position:String(i)}));
    if (!source || typeof source !== 'object') return [];
    return Object.entries(source).map(([name,item])=>({label:name,item,position:name}));
  }
  function isMiningName(name) { return /mine|extractor|quarry|drill|harvester|synthesizer/i.test(String(name)); }
  function resourceName(raw, name) {
    const explicit = prop(raw,['resource','outputResource','producedResource','material','outputType']);
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().toLowerCase();
    const cleaned = String(name).replace(/[_-]/g,' ').replace(/\b(mine|extractor|quarry|drill|harvester|synthesizer)\b/ig,'').trim().toLowerCase();
    return cleaned && !/^(?:building|level|unknown)$/.test(cleaned) ? cleaned : '';
  }
  function catalogEntries(ref) {
    if (!ref || typeof ref !== 'object') return [];
    if (Array.isArray(ref)) return ref;
    for (const path of ['buildings','items','data','results']) if (ref[path]) return catalogEntries(ref[path]);
    return Object.entries(ref).map(([code,value])=>value && typeof value==='object'?{code,...value}:null).filter(Boolean);
  }
  function levelOfCatalog(ref, name, target) {
    const match = catalogEntries(ref).find(b => ['name','code','type','id','key'].some(k=>key(b[k]) === key(name)));
    if (!match) return null;
    const levels = prop(match,['levels','levelStats','levelsData','upgrades','statsByLevel','levelCosts']);
    if (!levels) return null;
    if (Array.isArray(levels)) return levels.find(entry => numeric(prop(entry,['level','targetLevel','toLevel'])) === target) || null;
    if (typeof levels === 'object') return levels[String(target)] || null;
    return null;
  }
  function extract(planets, buildingsRef=null) {
    const out=[];
    for (const [planetIndex,planet] of (planets||[]).entries()) {
      if (!planet || typeof planet!=='object') continue;
      const planetName=String(prop(planet,['name','planetName','title','label']) || `Planet ${planetIndex+1}`);
      const planetId=String(prop(planet,['id','planetId','planet_id','uuid']) || planetName);
      for (const bucket of ['mines','buildings']) {
        const source=planet[bucket];
        for (const {label,item,position} of toList(source)) {
          const raw=item&&typeof item==='object'?item:{};
          const name=String(prop(raw,['name','type','code','buildingType','building','resource'])||label);
          if (bucket==='buildings' && !isMiningName(name)) continue;
          if (bucket==='mines' && /^(total|count|capacity|production|rate)$/i.test(name)) continue;
          const level=numeric(typeof item==='object'?prop(raw,['level','lvl','currentLevel','current_level']):item);
          if (level===null || !Number.isInteger(level) || level<0) continue;
          const next = prop(raw,['nextUpgrade','nextLevel','upgradePreview','next_upgrade']);
          const nextEntry = next && typeof next==='object' ? next : {};
          const catalog = levelOfCatalog(buildingsRef,name,level+1)||{};
          const merged={...catalog,...nextEntry};
          const currentRate=rate(raw);
          const nextRate=rate(merged);
          const directDelta=numeric(prop(merged,['productionIncrease','productionDelta','nextProductionDelta','deltaPerHour','additionalPerHour','incrementPerHour']));
          const ownDelta=numeric(prop(raw,['productionIncrease','productionDelta','nextProductionDelta','deltaPerHour','additionalPerHour','incrementPerHour']));
          const delta=directDelta ?? ownDelta ?? (currentRate!==null && nextRate!==null?nextRate-currentRate:null);
          const rawCost=prop(merged,['upgradeCost','nextCost','cost','resources','materials']);
          const plainLevelCost=rawCost===undefined && Object.values(catalog).length && Object.values(catalog).every(v=>numeric(v)!==null)?catalog:undefined;
          const cost=rawCost ?? plainLevelCost ?? prop(raw,['upgradeCost','nextCost','costToUpgrade','nextLevelCost']);
          const buildHours=hours(merged) ?? hours(raw);
          const output=resourceName(raw,name);
          const id=`${planetId}/${bucket}/${position}`;
          const duplicate=out.some(m=>m.planetId===planetId && key(m.name)===key(name) && m.level===level);
          if(duplicate)continue;
          out.push({id,planetId,planetName,name,level,output,cost:costText(cost),delta,buildHours,currentRate,
            stocks:prop(planet,['resources','stocks','stock','resourceStocks','resource_stocks','materials']),source:bucket});
        }
      }
    }
    return out;
  }
  function evaluate(mine,overrides={},weights={},downtime=false) {
    const val=(k,fallback)=>overrides[k]!==undefined&&overrides[k]!==''?overrides[k]:fallback;
    const costString=val('cost',mine.cost);
    const costs=parseCosts(costString);
    const delta=numeric(val('delta',mine.delta));
    const buildHours=numeric(val('hours',mine.buildHours));
    const currentRate=numeric(val('current',mine.currentRate));
    const output=String(val('resource',mine.output)||'').trim().toLowerCase();
    const reasons=[];
    if(!costs)reasons.push('upgrade cost');
    if(!(delta>0))reasons.push('incremental production / hour');
    if(!output)reasons.push('output resource');
    if(buildHours===null || buildHours<0)reasons.push('build duration');
    if(downtime && currentRate===null)reasons.push('current hourly production for downtime');
    if (reasons.length) return {valid:false,reasons,output,costs,delta,buildHours};
    const wt = x => Number(weights[x]??1);
    const capex=Object.entries(costs).reduce((sum,[res,qty])=>sum+qty*wt(res),0);
    const weightedDelta=delta*wt(output);
    const lost=downtime?currentRate*buildHours*wt(output):0;
    const paybackHours=buildHours+(capex+lost)/weightedDelta;
    const revenue30d=weightedDelta*Math.max(0,720-buildHours);
    const roi30=capex>0 ? 100*(revenue30d-capex-lost)/capex : null;
    let affordable=null;
    if(mine.stocks && typeof mine.stocks==='object') {
      const stockMap=Array.isArray(mine.stocks)
       ? Object.fromEntries(mine.stocks.map(x=>[key(prop(x,['name','resource','type'])),numeric(prop(x,['amount','value','quantity']))]).filter(([a,b])=>a&&b!==null))
       : Object.fromEntries(Object.entries(mine.stocks).filter(([,v])=>numeric(v)!==null).map(([k,v])=>[key(k),Number(v)]));
      if(Object.keys(costs).every(k=>Object.hasOwn(stockMap,key(k)))) affordable=Object.entries(costs).every(([k,v])=>stockMap[key(k)]>=v);
    }
    return {valid:true,output,costs,delta,buildHours,capex,lost,paybackHours,roi30,affordable,weightedDelta};
  }
  return {extract,evaluate,parseCosts,parseWeights,costText};
})();

const mineUi = {
 inputs: (()=>{try {const obj=JSON.parse(localStorage.getItem('ue4_mines_v1')||'{}');return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:{};}catch{return {};}})(),
 weights: localStorage.getItem('ue4_mine_weights_v1')||'',
 downtime:localStorage.getItem('ue4_mine_downtime_v1')==='true',
 planet:'all', error:''
};
const mineFormatHours = h => h < 24 ? `${h.toFixed(1)}h` : `${(h/24).toFixed(1)}d`;
const mineFormatPct = x => x===null?'—':`${x.toFixed(1)}%`;
function minesPage(){
 const mines=MinePlanner.extract(getRows('/me/planets'),getData('/reference/buildings'));
 const selected=mines.filter(m=>mineUi.planet==='all'||m.planetId===mineUi.planet);
 const weights=MinePlanner.parseWeights(mineUi.weights) || {};
 const evaluated=selected.map(m=>({m,result:MinePlanner.evaluate(m,mineUi.inputs[`${m.id}:${m.level}`]||{},weights,mineUi.downtime)}));
 const ranked=evaluated.filter(x=>x.result.valid).sort((a,b)=>a.result.paybackHours-b.result.paybackHours);
 const summary=`<div class="mini-stats">${cardNumber('Mines',number(mines.length),'layers','Detected from planet snapshots')}${cardNumber('Comparable upgrades',number(ranked.length),'chart','With costs and additional production')}${cardNumber('Fastest payback',ranked.length?mineFormatHours(ranked[0].result.paybackHours):'—','clock','Weighted cost recovered after build')}</div>`;
 const controls=`<div class="mine-controls"><label>Colony <select id="mine-planet"><option value="all">All colonies</option>${[...new Map(mines.map(m=>[m.planetId,m.planetName])).entries()].map(([id,name])=>`<option value="${esc(id)}" ${mineUi.planet===id?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>Resource value ratios <input id="mine-weights" type="text" value="${esc(mineUi.weights)}" placeholder="ore:1, crystal:2" title="Comma-separated resource value weights" /></label><label class="mine-check"><input id="mine-downtime" type="checkbox" ${mineUi.downtime?'checked':''}> Mines stop production during construction</label></div><p class="mine-muted">Resource ratios default to 1:1 for all resources. Adjust ratios to match your economy, e.g. ore:1, crystal:2. Time values are hours, production increases are units/hour; 30-day ROI assumes steady output. No speculative production or cost formulas are used.</p>${mineUi.error?`<div class="notice warning">${esc(mineUi.error)}</div>`:''}`;
 const recommended=ranked.length?`<div class="mine-recommendations">${ranked.slice(0,5).map(({m,result:r},index)=>`<div class="mine-rec"><div><small>#${index+1} · ${esc(m.planetName)}</small><strong>${esc(m.name)} ${m.level} → ${m.level+1}</strong><span>${esc(r.output)} +${number(r.delta)}/h · ${r.affordable===false?'Insufficient local stock':r.affordable===true?'Affordable with local stock':'Affordability unknown'}</span></div><div><strong>${mineFormatHours(r.paybackHours)}</strong><small>Payback incl. ${mineFormatHours(r.buildHours)} build</small></div></div>`).join('')}</div>`:empty('No comparable upgrades yet','Enter next-level cost and extra hourly production for each mine below. API-provided values are prefilled when available.','chart');
 const cols=['Planet / mine','Now → next','Output resource','Next-level cost','Extra / hour','Current / hour','Build hours','Payback','ROI (30d)','Stock'];
 const rows=selected.map(m=>{
  const o=mineUi.inputs[`${m.id}:${m.level}`]||{};
  const r=MinePlanner.evaluate(m,o,weights,mineUi.downtime);
  const input=(field,type,value,placeholder,extra='')=>`<input class="mine-input" data-mine-id="${esc(`${m.id}:${m.level}`)}" data-mine-field="${field}" type="${type}" value="${esc(value??'')}" placeholder="${esc(placeholder)}" ${extra} aria-label="${esc(field+' for '+m.name+' on '+m.planetName)}">`;
  return `<tr><td><strong>${esc(m.name)}</strong><small>${esc(m.planetName)}</small></td><td class="mine-level">${m.level} → ${m.level+1}</td><td>${input('resource','text',o.resource??m.output,'ore')}</td><td>${input('cost','text',o.cost??m.cost,'ore:100, crystal:20')}</td><td>${input('delta','number',o.delta??m.delta,'+ units/h','min="0" step="any"')}</td><td>${input('current','number',o.current??m.currentRate,'optional','min="0" step="any"')}</td><td>${input('hours','number',o.hours??m.buildHours,'0','min="0" step="any"')}</td><td>${r.valid?`<strong class="mine-payback">${mineFormatHours(r.paybackHours)}</strong>`:`<span class="mine-unranked" title="Missing: ${esc(r.reasons.join(', '))}">Incomplete</span>`}</td><td>${r.valid?mineFormatPct(r.roi30):'—'}</td><td>${r.valid?(r.affordable===true?'Yes':r.affordable===false?'No':'Unknown'):'—'}</td></tr>`;
 }).join('');
 const ledger=selected.length?`<div class="table-wrap mine-ledger"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="mine-muted">Inputs are saved in this browser for each mine and current level. When a mine levels up, its next-upgrade assumptions are kept separate. Edit and leave a field to recalculate. A blank input uses the API value if available.</p>`:empty('No mine levels found','Sync planets and inspect the raw mines/buildings structures. Only numeric mine levels can be parsed.','planet');
 return pageHeading('ECONOMY / INVESTMENTS','Mine upgrade planner','Compare all colonies, calculate amortization, and identify the next economically efficient mine upgrade.',button('navigate',`${icon('planet')} Planet ledger`,'ghost','data-view="planets"')+button('refresh-one',`${icon('refresh')} Sync planets`,'primary','data-path="/me/planets"'))+datasetNotice('/me/planets')+summary+
 panel('Investment assumptions','No additional game API calls are needed. Reference buildings catalog is used when it contains explicit per-level values.',controls)+
 panel('Recommended next upgrades','Sorted by shortest weighted amortization time among fully specified candidates.',recommended)+
 panel('Mine levels and upgrade inputs',`${selected.length} mines shown · current values reflect the latest synced planet snapshot`,ledger)+
 `<div class="notice">${icon('info')} Payback = construction hours + (weighted upgrade cost + optional lost production during construction) ÷ weighted extra hourly production. ROI over 30 days excludes ongoing costs, power/energy constraints, production caps, boosts, subsequent upgrades, and future resource-value changes. Treat results as a planning estimate, not a guaranteed game return.</div>`;
}
if(typeof document!=='undefined'){
 document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='mine-planet'){mineUi.planet=el.value;render();}
  else if(el.id==='mine-downtime'){mineUi.downtime=el.checked;localStorage.setItem('ue4_mine_downtime_v1',String(el.checked));render();}
  else if(el.id==='mine-weights'){
   if(MinePlanner.parseWeights(el.value)===null){mineUi.error='Invalid value ratios. Use e.g. ore:1, crystal:2 with positive numbers.';el.setAttribute('aria-invalid','true');toast(mineUi.error);return;}
   mineUi.error='';mineUi.weights=el.value;localStorage.setItem('ue4_mine_weights_v1',el.value);render();
  }else if(el.dataset.mineId && el.dataset.mineField){
   const id=el.dataset.mineId, f=el.dataset.mineField;
   if(f==='delta'||f==='hours'||f==='current'){
    if(el.value!==''&&(!(Number(el.value)>=0)||!Number.isFinite(Number(el.value)))){toast('Enter a non-negative numeric value.');return;}
   }
   if(f==='cost' && el.value!=='' && MinePlanner.parseCosts(el.value)===null){toast('Invalid cost. Example: ore:1200, crystal:400');return;}
   if(!mineUi.inputs[id])mineUi.inputs[id]={};
   mineUi.inputs[id][f]=el.value;
   localStorage.setItem('ue4_mines_v1',JSON.stringify(mineUi.inputs));
   render();
  }
 });
}
if(typeof module!=='undefined'&&module.exports)module.exports=MinePlanner;