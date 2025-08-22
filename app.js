// Navegación simple entre pantallas
const screens = {
  login: document.getElementById('screen-login'),
  list: document.getElementById('screen-list'),
  detail: document.getElementById('screen-detail')
};
const title = document.getElementById('title');
const backBtn = document.getElementById('backBtn');
function show(screen){
  Object.values(screens).forEach(s=>s.classList.add('hidden'));
  if (screen==='login'){ title.textContent='Inicio'; backBtn.classList.add('hidden'); }
  if (screen==='list'){ title.textContent='Listado'; backBtn.classList.remove('hidden'); }
  if (screen==='detail'){ title.textContent='Ficha'; backBtn.classList.remove('hidden'); }
  screens[screen].classList.remove('hidden');
  window.scrollTo(0,0);
}
backBtn.onclick = ()=>{
  if (!screens.list.classList.contains('hidden')) show('login');
  else if (!screens.detail.classList.contains('hidden')) show('list');
};

// IndexedDB
const dbName = 'neumaticosDB'; const dbVersion = 1; let db;
function openDB(){ return new Promise((resolve,reject)=>{
  const req = indexedDB.open(dbName, dbVersion);
  req.onupgradeneeded = (e)=>{
    const d = e.target.result;
    if (!d.objectStoreNames.contains('tires')){
      const s = d.createObjectStore('tires',{keyPath:'id'});
      s.createIndex('byUpdated','updatedAt');
    }
    if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings',{keyPath:'key'});
  };
  req.onsuccess=()=>{ db=req.result; resolve(db); };
  req.onerror=()=>reject(req.error);
});}
function tx(store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); }
function put(store,val){ return new Promise((res,rej)=>{ const r=tx(store,'readwrite').put(val); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
function get(store,key){ return new Promise((res,rej)=>{ const r=tx(store).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function getAll(store){ return new Promise((res,rej)=>{ const r=tx(store).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }); }
function del(store,key){ return new Promise((res,rej)=>{ const r=tx(store,'readwrite').delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

// Crypto
async function sha256(str){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join(''); }

// Estado y refs
let ROLE='VIEW', ADMIN_HASH=null, SELECTED=null, SIG_POINTS=[], SIG_DIRTY=false;
const roleSel=document.getElementById('role'), pinInp=document.getElementById('pin'), roleChip=document.getElementById('roleChip'), syncChip=document.getElementById('syncChip');
const btnLogin=document.getElementById('btnLogin'), btnSetPin=document.getElementById('btnSetPin'), btnExport=document.getElementById('btnExport'), importFile=document.getElementById('importFile');
const q=document.getElementById('q'), fEstado=document.getElementById('fEstado'), fTipo=document.getElementById('fTipo'), tbl=document.getElementById('tbl');
const tId=document.getElementById('tId'), tDot=document.getElementById('tDot'), tMarca=document.getElementById('tMarca'), tModelo=document.getElementById('tModelo'), tMedida=document.getElementById('tMedida'), tTipo=document.getElementById('tTipo'), tEstado=document.getElementById('tEstado'), tUbic=document.getElementById('tUbic'), tPos=document.getElementById('tPos'), tNotas=document.getElementById('tNotas');
const btnSave=document.getElementById('btnSave'), btnMove=document.getElementById('btnMove'), btnDel=document.getElementById('btnDel');
const photo=document.getElementById('photo'), photoList=document.getElementById('photoList');
const sig=document.getElementById('sig'), sigClear=document.getElementById('sigClear'), sigAttach=document.getElementById('sigAttach'), hist=document.getElementById('hist');

function setRole(r){ ROLE=r; roleChip.textContent=`Rol: ${r}`; refreshPerms(); }
function refreshPerms(){
  const canAdd = ROLE==='ADD'||ROLE==='EDIT'||ROLE==='ADMIN';
  const canEdit = ROLE==='EDIT'||ROLE==='ADMIN';
  [tId,tDot,tMarca,tModelo,tMedida,tTipo,tEstado,tUbic,tPos,tNotas,photo,btnSave,btnMove].forEach(el=>el.disabled=!(canAdd||canEdit));
  btnDel.disabled = !(ROLE==='ADMIN');
  sigAttach.disabled = !(canAdd || canEdit);
}

async function loadSettings(){ const s=await get('settings','adminHash'); ADMIN_HASH=s?.value||null; }
async function saveSettings(){ await put('settings',{key:'adminHash', value:ADMIN_HASH}); }

btnLogin.onclick = async ()=>{
  const wanted = roleSel.value;
  if (wanted==='ADMIN'){ if(!ADMIN_HASH){ alert('No hay PIN admin aún. Pulsa "Definir/Reset PIN".'); return; } const hash=await sha256(pinInp.value||''); if (hash!==ADMIN_HASH){ alert('PIN incorrecto'); return; } }
  if (wanted==='EDIT' && ADMIN_HASH){ const hash=await sha256(pinInp.value||''); if (hash!==ADMIN_HASH){ alert('PIN requerido para editar'); return; } }
  setRole(wanted); show('list'); renderList();
};

btnSetPin.onclick = async ()=>{ const p1=prompt('Nuevo PIN Admin (4-8 dígitos):'); if(!p1) return; const p2=prompt('Repite PIN:'); if(p1!==p2) return alert('No coinciden'); ADMIN_HASH=await sha256(p1); await saveSettings(); alert('PIN guardado'); };
btnExport.onclick = async ()=>{ const tires=await getAll('tires'); const blob=new Blob([JSON.stringify({tires},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='neumaticos_export.json'; a.click(); URL.revokeObjectURL(url); };
importFile.onchange = async (e)=>{ const f=e.target.files[0]; if(!f) return; const data=JSON.parse(await f.text()); if(Array.isArray(data.tires)){ for(const t of data.tires) await put('tires', t); await renderList(); alert('Importado'); } else alert('Formato no válido'); };

function nowISO(){ return new Date().toISOString(); }
function rowHtml(t){ const last = t.updatedAt?.slice(0,19).replace('T',' ')||''; return `<tr><td>${t.id||''}</td><td>${t.marca||''} ${t.modelo||''}</td><td>${t.medida||''}</td><td><span class="tag">${t.estado||''}</span></td><td>${t.ubic||''} ${t.pos||''}</td><td>${last}</td><td><button data-id="${t.id}" class="pick">Abrir</button></td></tr>`; }

async function renderList(){
  const qv=(q.value||'').toLowerCase(), est=fEstado.value, tip=fTipo.value;
  const items=(await getAll('tires')).filter(t=>{
    const txt=`${t.id} ${t.marca} ${t.modelo} ${t.medida} ${t.ubic} ${t.pos}`.toLowerCase();
    const okQ=!qv || txt.includes(qv); const okE=!est || t.estado===est; const okT=!tip || t.tipo===tip; return okQ&&okE&&okT;
  }).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  tbl.innerHTML = items.map(rowHtml).join('');
  tbl.querySelectorAll('.pick').forEach(btn=>btn.onclick=()=>selectTire(btn.dataset.id));
}

function fillForm(t){
  tId.value=t.id||''; tDot.value=t.dot||''; tMarca.value=t.marca||''; tModelo.value=t.modelo||''; tMedida.value=t.medida||''; tTipo.value=t.tipo||'verano'; tEstado.value=t.estado||'nuevo'; tUbic.value=t.ubic||''; tPos.value=t.pos||''; tNotas.value=t.notas||'';
  renderPhotos(t.photos||[]); renderHist(t.hist||[]);
}
function renderPhotos(photos){ photoList.innerHTML=''; photos.forEach(p=>{ const img=document.createElement('img'); img.src=p; img.style.width='72px'; img.style.height='72px'; img.style.objectFit='cover'; img.style.borderRadius='8px'; photoList.appendChild(img); }); }
function renderHist(h){ hist.innerHTML=''; h.slice().reverse().forEach(ev=>{ const li=document.createElement('li'); const when=(ev.ts||'').slice(0,19).replace('T',' '); li.innerHTML=`<div class="row" style="gap:8px;align-items:center"><span class="tag">${ev.kind||'upd'}</span><span style="color:#6b7280">${when}</span><span>${ev.note||''}</span></div>`; if(ev.sig){ const img=document.createElement('img'); img.src=ev.sig; img.style.width='120px'; img.style.height='60px'; img.style.objectFit='contain'; img.style.border='1px solid #e5e7eb'; img.style.borderRadius='6px'; img.style.display='block'; img.style.margin='6px 0'; li.appendChild(img);} hist.appendChild(li); }); }

async function selectTire(id){ const t=await get('tires', id); if(!t) return; SELECTED=id; fillForm(t); show('detail'); }
document.getElementById('btnAdd').onclick=()=>{ SELECTED=null; fillForm({tipo:'verano', estado:'nuevo', photos:[], hist:[]}); show('detail'); };

btnSave.onclick = async ()=>{
  const canAdd=ROLE==='ADD'||ROLE==='EDIT'||ROLE==='ADMIN', canEdit=ROLE==='EDIT'||ROLE==='ADMIN';
  if(!(canAdd||canEdit)) return alert('Sin permisos');
  const id=tId.value.trim(); if(!id) return alert('ID requerido');
  let t=await get('tires', id);
  if(!t){ if(!canAdd) return alert('No puedes crear'); t={id, photos:[], hist:[], createdAt:nowISO()}; }
  else { if(!canEdit && SELECTED) return alert('No puedes modificar'); }
  Object.assign(t,{ dot:tDot.value.trim(), marca:tMarca.value.trim(), modelo:tModelo.value.trim(), medida:tMedida.value.trim(), tipo:tTipo.value, estado:tEstado.value, ubic:tUbic.value.trim(), pos:tPos.value.trim(), notas:tNotas.value.trim(), updatedAt:nowISO() });
  t.hist=t.hist||[]; t.hist.push({kind: SELECTED?'upd':'new', ts:nowISO(), note:`${ROLE} guardó ficha`});
  await put('tires', t); SELECTED=id; await renderList(); alert('Guardado'); show('list');
};

btnMove.onclick = async ()=>{
  const canEdit=ROLE==='EDIT'||ROLE==='ADMIN'; if(!canEdit) return alert('Sólo EDIT/ADMIN');
  const id=tId.value.trim(); if(!id) return alert('Abre una ficha');
  const t=await get('tires', id);
  const nuevaUbic=prompt('Nueva ubicación (vehículo/almacén):', t.ubic||''); if(nuevaUbic==null) return;
  const nuevaPos=prompt('Nueva posición (ej. T1-Izq / Est1):', t.pos||'');
  t.ubic=(nuevaUbic||'').trim(); t.pos=(nuevaPos||'').trim(); t.updatedAt=nowISO();
  t.hist=t.hist||[]; t.hist.push({kind:'move', ts:nowISO(), note:`Movido a ${t.ubic} ${t.pos}`});
  await put('tires', t); await renderList(); fillForm(t);
};

btnDel.onclick = async ()=>{
  if(ROLE!=='ADMIN') return alert('Sólo ADMIN');
  const id=tId.value.trim(); if(!id) return;
  if(!confirm('Eliminar neumático?')) return;
  await del('tires', id); SELECTED=null; await renderList(); show('list');
};

photo.onchange = async (e)=>{
  const id=tId.value.trim(); if(!id){ alert('Guarda primero la ficha con un ID'); photo.value=''; return; }
  const file=e.target.files[0]; if(!file) return;
  const img=await fileToDataUrl(file,1280,1280);
  const t=await get('tires', id); t.photos=t.photos||[]; t.photos.push(img); t.updatedAt=nowISO(); t.hist=t.hist||[]; t.hist.push({kind:'photo', ts:nowISO(), note:`Foto añadida (${ROLE})`});
  await put('tires', t); renderPhotos(t.photos); await renderList(); photo.value='';
};
function fileToDataUrl(file, maxW, maxH){ return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>{ const img=new Image(); img.onload=()=>{ let w=img.width, h=img.height; const scale=Math.min(1, maxW/w, maxH/h); const c=document.createElement('canvas'); c.width=Math.round(w*scale); c.height=Math.round(h*scale); c.getContext('2d').drawImage(img,0,0,c.width,c.height); resolve(c.toDataURL('image/jpeg', 0.85)); }; img.src=reader.result; }; reader.onerror=reject; reader.readAsDataURL(file); }); }

// Firma
(function(){ const ctx=sig.getContext('2d'); ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round';
  function redraw(){ ctx.clearRect(0,0,sig.width,sig.height); ctx.beginPath(); SIG_POINTS.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); }
  function addPoint(x,y){ SIG_POINTS.push({x,y}); SIG_DIRTY=true; redraw(); }
  function pos(e){ const r=sig.getBoundingClientRect(); if(e.touches&&e.touches[0]) return {x:e.touches[0].clientX-r.left, y:e.touches[0].clientY-r.top}; return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  sig.addEventListener('mousedown', e=>{ addPoint(pos(e).x,pos(e).y); sig.onmousemove=e=>addPoint(pos(e).x,pos(e).y); });
  sig.addEventListener('mouseup', ()=> sig.onmousemove=null);
  sig.addEventListener('mouseleave', ()=> sig.onmousemove=null);
  sig.addEventListener('touchstart', e=>{ e.preventDefault(); addPoint(pos(e).x,pos(e).y); });
  sig.addEventListener('touchmove', e=>{ e.preventDefault(); addPoint(pos(e).x,pos(e).y); });
  document.getElementById('sigClear').onclick=()=>{ SIG_POINTS=[]; SIG_DIRTY=false; redraw(); };
})(); 
document.getElementById('sigAttach').onclick = async ()=>{
  if(!SIG_DIRTY) return alert('Dibuja una firma primero');
  const id=tId.value.trim(); if(!id) return alert('Abre una ficha');
  const t=await get('tires', id); t.hist=t.hist||[]; t.hist.push({kind:'sign', ts:nowISO(), note:`Firma adjunta (${ROLE})`, sig:sig.toDataURL()});
  await put('tires', t); renderHist(t.hist); SIG_DIRTY=false; alert('Firma añadida');
};

[q,fEstado,fTipo].forEach(el=>el.oninput=renderList);

// SW
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>navigator.serviceWorker.register('./service-worker.js')); window.addEventListener('beforeinstallprompt', ()=>{ syncChip.textContent='Instalable'; }); }

// Init
(async function init(){ await openDB(); await loadSettings(); setRole('VIEW'); refreshPerms(); show('login'); })();