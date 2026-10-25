const $ = id => document.getElementById(id);
const examples = {
  voxel_game: ['I want a free block-building game where I can save my world.', 'voxel_engine, world_saving, crafting'],
  cad: ['I want to design objects in 3D for a school project.', 'parametric_modeling, 2d_sketching'],
  video_editor: ['I want to edit a short video without buying an editor.', 'timeline_editing, video_export']
};
const taxonomyResponse=await fetch('../data/taxonomy.json');
if(!taxonomyResponse.ok)throw Error('Capability labels could not be loaded.');
const taxonomy=await taxonomyResponse.json();
const capabilityOptions=Object.fromEntries(taxonomy.categories.map(c=>[c.id,c.features.map(f=>[f.id,f.label])]));
function setCapabilities(category){$('features').replaceChildren();for(const [value,text] of capabilityOptions[category]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=value;input.checked=examples[category][1].split(', ').includes(value);label.append(input,document.createTextNode(text));$('features').append(label);}}
setCapabilities('voxel_game');
const catalogPromise = fetch('../data/alternatives.json').then(r => {if(!r.ok)throw Error('Catalog could not be loaded.');return r.json();});
// Convert to a settled result immediately so a failed catalog fetch never becomes an unhandled rejection.
const catalogReady = catalogPromise.then(data=>({data}), error=>({error}));
export function demoSearch(spec, catalog) {
  const recommendations=[], excluded=[];
  for(const p of catalog.filter(p=>p.category===spec.category)) {
    const reasons=[];
    if(!p.license || p.license_review_status!=='declared_license_only') reasons.push('license_requires_review');
    if(p.pricing_type!=='free_open_source') reasons.push('outside_curated_free_open_source_scope');
    if(!p.supported_platforms.includes(spec.platform)) reasons.push('platform_incompatible');
    if(reasons.length){excluded.push({id:p.id,reasons});continue;}
    const supported=spec.required_features.filter(f=>p.features.includes(f));
    recommendations.push({project:p,supported_features:supported,unknown_features:spec.required_features.filter(f=>!p.features.includes(f)),missing_features:[],feature_coverage:spec.required_features.length?supported.length/spec.required_features.length:null,compatibility_status:'needs_verification',warnings:p.notes});
  }
  recommendations.sort((a,b)=>(b.feature_coverage||0)-(a.feature_coverage||0)||a.project.id.localeCompare(b.project.id));
  return {schema_version:'0.1',status:recommendations.length?'matches':'no_match',recommendations,excluded,limitations:['Catalog demo: no AI model or live backend was called. Hardware and offline compatibility are not checked.']};
}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function link(text,url){const a=el('a',text);try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return el('span',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{return el('span',text);}return a;}
function featureLabel(f){return Object.values(capabilityOptions).flat().find(([id])=>id===f)?.[1]||f.replaceAll('_',' ');}
function render(data,live,spec){
  if(!data || !Array.isArray(data.recommendations) || !Array.isArray(data.excluded) || !Array.isArray(data.limitations))throw Error('The backend returned an unexpected response. Check the API contract.');
  for(const m of data.recommendations){if(!m.project || typeof m.project.name!=='string' || !Array.isArray(m.supported_features)||!Array.isArray(m.unknown_features)||!Array.isArray(m.missing_features)||!Array.isArray(m.warnings))throw Error('A recommendation is incomplete. Check the API contract.');}
  $('results').replaceChildren();$('result-count').textContent=`${data.recommendations.length} POSSIBILIT${data.recommendations.length===1?'Y':'IES'}`;
  const notice=el('p',live?'Live backend response. Review sources and compatibility before installing.':'Catalog demo · real project metadata, local matching. No AI agent was called.','fine');$('results').append(notice);
  const summary=el('div',undefined,'request-summary');summary.append(el('strong','Your brief'),el('p',spec.goal),el('p',`${spec.platform} · $0 budget · ${spec.internet} internet`));$('results').append(summary);
  for(const m of data.recommendations){
    const p=m.project,card=el('article',undefined,'card'),top=el('div',undefined,'card-top');top.append(el('h2',p.name),el('span','FREE & OPEN SOURCE','pill'));card.append(top,el('p',p.category?.replaceAll('_',' ')||'Alternative'));
    const score=m.feature_coverage;card.append(el('p',typeof score==='number'?`${Math.round(score*100)}% of requested features documented`:'No feature coverage requested'));
    for(const f of m.supported_features)card.append(el('div',`✓ Documented: ${featureLabel(f)}`,'feature'));
    for(const f of m.unknown_features)card.append(el('div',`? Needs verification: ${featureLabel(f)}`,'feature unknown'));
    for(const f of m.missing_features)card.append(el('div',`— Missing: ${featureLabel(f)}`,'feature unknown'));
    card.append(el('div','? Hardware fit and offline use: unverified','feature unknown'));
    const sources=el('div',undefined,'sources');sources.append(link('Official project ↗',p.official_url),link('Source code ↗',p.source_repository),link(`License: ${p.license||'unknown'} ↗`,p.license_source_url));card.append(sources);
    const evidence=el('div',undefined,'sources');for(const f of m.supported_features){if(p.feature_evidence?.[f])evidence.append(link(`Evidence: ${featureLabel(f)} ↗`,p.feature_evidence[f]));}card.append(evidence);
    const notes=el('div',undefined,'warning');for(const w of [...m.warnings,'Declared license only; dependency and asset review is incomplete.'])notes.append(el('p',w));card.append(notes);
    const plan=el('div',undefined,'next-steps');plan.append(el('h3','Your next step'));
    if(p.id==='luanti'){plan.append(el('p','Review Luanti with Minetest Game as a basic building/crafting setup. Game licensing and compatibility are separate from the engine; no runtime test has been completed.'),link('Official game setup guide ↗','https://github.com/luanti-org/minetest_game/blob/master/README.md'));}
    else plan.append(el('p','Open the official project, check current installation requirements, and try one small project on your device before relying on this tool.'));
    if(m.unknown_features.length)plan.append(el('p','Verify '+m.unknown_features.map(featureLabel).join(', ')+' before deciding to build an enhancement.'));
    card.append(plan);$('results').append(card);
  }
  if(!data.recommendations.length){const c=el('div',undefined,'card');c.append(el('h2','No confirmed match yet.'),el('p','Try another platform or category. We won’t assume a tool meets your requirements.'));for(const x of data.excluded)c.append(el('p',`${x.id}: ${x.reasons.join(', ').replaceAll('_',' ')}`));$('results').append(c);}
  const exportButton=el('button','Download comparison brief ↓','secondary');exportButton.type='button';exportButton.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({mode:live?'backend':'catalog_demo',request:spec,result:data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rvai-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});$('results').append(exportButton);
  for(const limitation of data.limitations)$('results').append(el('p',limitation,'fine'));
}
for(const b of document.querySelectorAll('[data-example]'))b.addEventListener('click',()=>{const c=b.dataset.example;$('category').value=c;$('goal').value=examples[c][0];setCapabilities(c);});
$('category').addEventListener('change',()=>{setCapabilities($('category').value);});
$('live-mode').addEventListener('change',()=>{$('mode-badge').textContent=$('live-mode').checked?'Live backend selected':'Catalog demo';});
$('request-form').addEventListener('submit',async e=>{
  e.preventDefault();const live=$('live-mode').checked;
  const spec={goal:$('goal').value.trim(),category:$('category').value,platform:$('platform').value,budget:0,required_features:Array.from($('features').querySelectorAll('input:checked'),x=>x.value),hardware_constraints:{ram_gb:$('ram').value?Number($('ram').value):null,dedicated_gpu:null},internet:$('internet').value};
  if(!spec.goal){$('goal').setCustomValidity('Tell us what you want to create.');$('goal').reportValidity();return;}$('goal').setCustomValidity('');
  $('run').disabled=true;$('results').replaceChildren();$('activity').replaceChildren(el('div',live?'Connecting to the backend…':'Searching the local catalog…','activity-row'));$('result-count').textContent='WORKING';
  try{let data;if(live){let url;try{url=new URL($('api-url').value);}catch{throw Error('Enter Anna’s backend endpoint in the connection settings.');}if(!['http:','https:'].includes(url.protocol))throw Error('Use an HTTP or HTTPS endpoint.');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(spec),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`Backend returned ${response.status}. Check that it is running and allows this site to connect.`);data=await response.json();}else{const ready=await catalogReady;if(ready.error)throw ready.error;data=demoSearch(spec,ready.data);}render(data,live,spec);$('activity').replaceChildren(el('div',live?'✓ Backend response received':'✓ Catalog searched · platform checked · feature evidence compared','activity-row'));}
  catch(error){$('result-count').textContent='CONNECTION ISSUE';$('activity').replaceChildren();const c=el('div',undefined,'card error');c.append(el('h2','Let’s try that again.'),el('p',error.name==='TimeoutError'?'The backend took too long. Try again or switch to catalog demo.':error.message));$('results').replaceChildren(c);}
  finally{$('run').disabled=false;}
});
$('goal').addEventListener('input',()=>$('goal').setCustomValidity(''));

$('goal').addEventListener('change',()=>{
  const goal=$('goal').value.toLowerCase();
  const found=taxonomy.categories.filter(c=>c.keywords.some(k=>goal.includes(k)));
  if(found.length===1){$('category').value=found[0].id;setCapabilities(found[0].id);$('category-hint').textContent=`Suggested from your words: ${found[0].label}. Change the type or capabilities below if needed.`;}
  else $('category-hint').textContent='Choose the type and capabilities that fit your goal.';
});
