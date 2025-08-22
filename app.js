// Simple IndexedDB helpers
const dbName = 'neumaticosDB';
const dbVersion = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('tires')) {
        const s = d.createObjectStore('tires', { keyPath: 'id' });
        s.createIndex('byUpdated', 'updatedAt');
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode='readonly') {
  return db.transaction(store, mode).objectStore(store);
}

async function put(store, val) {
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').put(val);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function get(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function getAll(store) {
  return new Promise((res, rej) => {
    const r = tx(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
async function del(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store, 'readwrite').delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

// Crypto helpers
async function sha256(str) {
  const enc = new TextEncoder();
  const h = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2,'0')).join('');
}

// State
let ROLE = 'VIEW';
let ADMIN_HASH = null;
let SELECTED = null; // current tire id
let SIG_POINTS = [];
let SIG_DIRTY = false;

// UI refs
const roleSel = document.getElementById('role');
const pinInp = document.getElementById('pin');
const roleChip = document.getElementById('roleChip');
const syncChip = document.getElementById('syncChip');
const btnLogin = document.getElementById('btnLogin');
const btnSetPin = document.getElementById('btnSetPin');
const btnExport = document.getElementById('btnExport');
const importFile = document.getElementById('importFile');

const q = document.getElementById('q');
const fEstado = document.getElementById('fEstado');
const fTipo = document.getElementById('fTipo');
const tbl = document.getElementById('tbl');

const tId = document.getElementById('tId');
const tDot = document.getElementById('tDot');
const tMarca = document.getElementById('tMarca');
const tModelo = document.getElementById('tModelo');
const tMedida = document.getElementById('tMedida');
const tTipo = document.getElementById('tTipo');
const tEstado = document.getElementById('tEstado');
const tUbic = document.getElementById('tUbic');
const tPos = document.getElementById('tPos');
const tNotas = document.getElementById('tNotas');

const btnSave = document.getElementById('btnSave');
const btnMove = document.getElementById('btnMove');
const btnDel = document.getElementById('btnDel');

const photo = document.getElementById('photo');
const photoList = document.getElementById('photoList');
const sig = document.getElementById('sig');
const sigClear = document.getElementById('sigClear');
const sigAttach = document.getElementById('sigAttach');
const hist = document.getElementById('hist');

function setRole(r){ ROLE = r; roleChip.textContent = `Rol: ${r}`; refreshPerms(); }
function refreshPerms(){
  const viewOnly = ROLE==='VIEW';
  const canAdd = ROLE==='ADD' || ROLE==='EDIT' || ROLE==='ADMIN';
  const canEdit = ROLE==='EDIT' || ROLE==='ADMIN';
  tId.disabled = !canAdd && !canEdit;
  [tDot,tMarca,tModelo,tMedida,tTipo,tEstado,tUbic,tPos,tNotas,photo].forEach(el => el.disabled = !(canAdd || canEdit));
  btnSave.disabled = !(canAdd || canEdit);
  btnMove.disabled = !(canEdit || ROLE==='ADMIN');
  btnDel.disabled = !(ROLE==='ADMIN');
  sigAttach.disabled = !(canAdd || canEdit);
}

async function loadSettings(){
  const s = await get('settings','adminHash');
  ADMIN_HASH = s?.value || null;
}

async function saveSettings(){
  await put('settings',{key:'adminHash', value: ADMIN_HASH});
}

btnLogin.onclick = async () => {
  const wanted = roleSel.value;
  if (wanted === 'ADMIN') {
    if (!ADMIN_HASH) {
      alert('No hay PIN admin aún. Pulsa "Definir/Reset PIN" y establece uno.');
      return;
    }
    const hash = await sha256(pinInp.value || '');
    if (hash !== ADMIN_HASH) { alert('PIN incorrecto'); return; }
  }
  if (wanted === 'EDIT') {
    // optional pin for EDIT using same admin pin
    if (ADMIN_HASH) {
      const hash = await sha256(pinInp.value || '');
      if (hash !== ADMIN_HASH) { alert('PIN requerido para editar'); return; }
    }
  }
  setRole(wanted);
};

btnSetPin.onclick = async () => {
  const p1 = prompt('Nuevo PIN Admin (4-8 dígitos):');
  if (!p1) return;
  const p2 = prompt('Repite PIN:');
  if (p1!==p2) return alert('No coinciden');
  ADMIN_HASH = await sha256(p1);
  await saveSettings();
  alert('PIN guardado');
};

btnExport.onclick = async () => {
  const tires = await getAll('tires');
  const blob = new Blob([JSON.stringify({ tires }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'neumaticos_export.json'; a.click();
  URL.revokeObjectURL(url);
};

importFile.onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const txt = await file.text();
  const data = JSON.parse(txt);
  if (Array.isArray(data.tires)) {
    for (const t of data.tires) await put('tires', t);
    await renderList();
    alert('Importado');
  } else {
    alert('Formato no válido');
  }
};

function nowISO(){ return new Date().toISOString(); }

function rowHtml(t){
  const last = t.updatedAt?.slice(0,19).replace('T',' ') || '';
  return `<tr>
    <td>${t.id||''}</td>
    <td>${t.marca||''} ${t.modelo||''}</td>
    <td>${t.medida||''}</td>
    <td><span class="tag">${t.estado||''}</span></td>
    <td>${t.ubic||''} ${t.pos||''}</td>
    <td>${last}</td>
    <td><button data-id="${t.id}" class="pick">Abrir</button></td>
  </tr>`;
}

async function renderList(){
  const qv = (q.value||'').toLowerCase();
  const est = fEstado.value;
  const tip = fTipo.value;
  const items = await getAll('tires');
  const filtered = items.filter(t => {
    const txt = `${t.id} ${t.marca} ${t.modelo} ${t.medida} ${t.ubic} ${t.pos}`.toLowerCase();
    const okQ = !qv || txt.includes(qv);
    const okE = !est || t.estado===est;
    const okT = !tip || t.tipo===tip;
    return okQ && okE && okT;
  }).sort((a,b)=> (b.updatedAt||'').localeCompare(a.updatedAt||''));
  tbl.innerHTML = filtered.map(rowHtml).join('');
  tbl.querySelectorAll('.pick').forEach(btn => btn.onclick = ()=>selectTire(btn.dataset.id));
}

function fillForm(t){
  tId.value = t.id||'';
  tDot.value = t.dot||'';
  tMarca.value = t.marca||'';
  tModelo.value = t.modelo||'';
  tMedida.value = t.medida||'';
  tTipo.value = t.tipo||'verano';
  tEstado.value = t.estado||'nuevo';
  tUbic.value = t.ubic||'';
  tPos.value = t.pos||'';
  tNotas.value = t.notas||'';
  renderPhotos(t.photos||[]);
  renderHist(t.hist||[]);
}

function renderPhotos(photos){
  photoList.innerHTML = '';
  photos.forEach((p,i)=>{
    const img = document.createElement('img');
    img.src = p; img.style.width='72px'; img.style.height='72px'; img.style.objectFit='cover'; img.style.borderRadius='8px';
    photoList.appendChild(img);
  });
}

function renderHist(h){
  hist.innerHTML = '';
  h.slice().reverse().forEach(ev=>{
    const li = document.createElement('li');
    const when = (ev.ts||'').slice(0,19).replace('T',' ');
    li.innerHTML = `<div class="row" style="gap:8px;align-items:center">
      <span class="tag">${ev.kind||'upd'}</span>
      <span style="color:#9aa3b2">${when}</span>
      <span>${ev.note||''}</span>
    </div>`;
    if (ev.sig) {
      const img = document.createElement('img');
      img.src = ev.sig; img.style.width='120px'; img.style.height='60px'; img.style.objectFit='contain'; img.style.border='1px solid #2a2f4d'; img.style.borderRadius='6px'; img.style.display='block'; img.style.margin='6px 0';
      li.appendChild(img);
    }
    hist.appendChild(li);
  });
}

async function selectTire(id){
  const t = await get('tires', id);
  if (!t) return;
  SELECTED = id;
  fillForm(t);
}

btnAdd.onclick = ()=>{
  SELECTED = null;
  fillForm({tipo:'verano', estado:'nuevo', photos:[], hist:[]});
};

btnSave.onclick = async ()=>{
  const canAdd = ROLE==='ADD' || ROLE==='EDIT' || ROLE==='ADMIN';
  const canEdit = ROLE==='EDIT' || ROLE==='ADMIN';
  if (!(canAdd || canEdit)) return alert('Sin permisos');
  const id = tId.value.trim();
  if (!id) return alert('ID requerido');
  let t = await get('tires', id);
  if (!t) {
    if (!canAdd) return alert('No puedes crear');
    t = { id, photos:[], hist:[], createdAt: nowISO() };
  } else {
    if (!canEdit && SELECTED) return alert('No puedes modificar');
  }
  Object.assign(t, {
    dot: tDot.value.trim(),
    marca: tMarca.value.trim(),
    modelo: tModelo.value.trim(),
    medida: tMedida.value.trim(),
    tipo: tTipo.value,
    estado: tEstado.value,
    ubic: tUbic.value.trim(),
    pos: tPos.value.trim(),
    notas: tNotas.value.trim(),
    updatedAt: nowISO()
  });
  t.hist = t.hist || [];
  t.hist.push({ kind: SELECTED? 'upd':'new', ts: nowISO(), note: `${ROLE} guardó ficha` });
  await put('tires', t);
  SELECTED = id;
  await renderList();
  alert('Guardado');
};

btnMove.onclick = async ()=>{
  const canEdit = ROLE==='EDIT' || ROLE==='ADMIN';
  if (!canEdit) return alert('Sólo EDIT/ADMIN');
  const id = tId.value.trim();
  if (!id) return alert('Abre una ficha');
  const t = await get('tires', id);
  const nuevaUbic = prompt('Nueva ubicación (vehículo/almacén):', t.ubic || '');
  if (nuevaUbic==null) return;
  const nuevaPos = prompt('Nueva posición (ej. T1-Izq / Est1):', t.pos || '');
  t.ubic = (nuevaUbic||'').trim();
  t.pos = (nuevaPos||'').trim();
  t.updatedAt = nowISO();
  t.hist = t.hist || [];
  t.hist.push({ kind:'move', ts: nowISO(), note:`Movido a ${t.ubic} ${t.pos}` });
  await put('tires', t);
  await renderList();
  fillForm(t);
};

btnDel.onclick = async ()=>{
  if (ROLE!=='ADMIN') return alert('Sólo ADMIN');
  const id = tId.value.trim();
  if (!id) return;
  if (!confirm('Eliminar neumático?')) return;
  await del('tires', id);
  SELECTED = null;
  await renderList();
  btnAdd.click();
};

photo.onchange = async (e)=>{
  const id = tId.value.trim();
  if (!id) { alert('Guarda primero la ficha con un ID'); photo.value=''; return; }
  const file = e.target.files[0];
  if (!file) return;
  const img = await fileToDataUrl(file, 1280, 1280);
  const t = await get('tires', id);
  t.photos = t.photos || [];
  t.photos.push(img);
  t.updatedAt = nowISO();
  t.hist = t.hist || [];
  t.hist.push({ kind:'photo', ts: nowISO(), note:`Foto añadida (${ROLE})` });
  await put('tires', t);
  renderPhotos(t.photos);
  await renderList();
  photo.value='';
};

function fileToDataUrl(file, maxW, maxH){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        let {width:w, height:h} = img;
        const scale = Math.min(1, maxW/w, maxH/h);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w*scale);
        canvas.height = Math.round(h*scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Signature pad
(function(){
  const ctx = sig.getContext('2d');
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function redraw(){
    ctx.clearRect(0,0,sig.width,sig.height);
    ctx.beginPath();
    SIG_POINTS.forEach((p,i)=>{
      if (i===0) ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    });
    ctx.stroke();
  }
  function addPoint(x,y){ SIG_POINTS.push({x,y}); SIG_DIRTY=true; redraw(); }
  function evtPos(e){
    const rect = sig.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    } else {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
  }
  sig.addEventListener('mousedown', e=>{ addPoint(evtPos(e).x, evtPos(e).y); sig.onmousemove = e=>addPoint(evtPos(e).x, evtPos(e).y); });
  sig.addEventListener('mouseup', ()=> sig.onmousemove = null);
  sig.addEventListener('mouseleave', ()=> sig.onmousemove = null);
  sig.addEventListener('touchstart', e=>{ e.preventDefault(); addPoint(evtPos(e).x, evtPos(e).y); });
  sig.addEventListener('touchmove', e=>{ e.preventDefault(); addPoint(evtPos(e).x, evtPos(e).y); });

  sigClear.onclick = ()=>{ SIG_POINTS = []; SIG_DIRTY=false; redraw(); };
})();

sigAttach.onclick = async ()=>{
  if (!SIG_DIRTY) return alert('Dibuja una firma primero');
  const id = tId.value.trim();
  if (!id) return alert('Abre una ficha');
  const t = await get('tires', id);
  t.hist = t.hist || [];
  t.hist.push({ kind:'sign', ts: nowISO(), note:`Firma adjunta (${ROLE})`, sig: sig.toDataURL() });
  await put('tires', t);
  renderHist(t.hist);
  SIG_DIRTY=false;
  alert('Firma añadida al historial');
};

[q,fEstado,fTipo].forEach(el => el.oninput = renderList);

// SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
  window.addEventListener('beforeinstallprompt', ()=>{
    syncChip.textContent = 'Instalable';
  });
}

// Init
(async function init(){
  await openDB();
  await loadSettings();
  setRole('VIEW');
  refreshPerms();
  await renderList();
})();