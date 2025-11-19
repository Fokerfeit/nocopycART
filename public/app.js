// app.js - Pixi drawing engine + UI + gallery + export watermarking (anonymous v1)
const PIXI = window.PIXI;
const canvasWrap = document.getElementById('canvas-wrap');
const appPixi = new PIXI.Application({
  width: 1100,
  height: 640,
  backgroundColor: 0xffffff,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
canvasWrap.appendChild(appPixi.view);

const drawTexture = PIXI.RenderTexture.create({ width: appPixi.view.width, height: appPixi.view.height });
const drawSprite = new PIXI.Sprite(drawTexture);
appPixi.stage.addChild(drawSprite);
let gfx = new PIXI.Graphics();
appPixi.stage.addChild(gfx);

let drawing = false;
let brushColor = 0x000000;
let brushSize = 8;
let brushType = 'round';
let undoStack = [], redoStack = [];

const colorInput = document.getElementById('color');
const sizeInput = document.getElementById('size');
const brushSelect = document.getElementById('brushSelect');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const clearBtn = document.getElementById('clear');
const sellBtn = document.getElementById('sell');

function hexToNum(hex){ return Number(hex.replace('#','0x')); }

appPixi.view.style.touchAction = 'none';
appPixi.view.addEventListener('pointerdown', (e) => { drawing = true; saveState(); pointerMove(e); });
appPixi.view.addEventListener('pointerup', () => { drawing = false; gfx.clear(); });
appPixi.view.addEventListener('pointerout', () => { drawing = false; gfx.clear(); });
appPixi.view.addEventListener('pointermove', pointerMove);

function pointerMove(e){
  if (!drawing) return;
  const rect = appPixi.view.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (appPixi.view.width / rect.width);
  const y = (e.clientY - rect.top) * (appPixi.view.height / rect.height);

  gfx.clear();
  if (brushType === 'round') {
    gfx.beginFill(brushColor);
    gfx.drawCircle(x, y, brushSize);
    gfx.endFill();
  } else if (brushType === 'soft') {
    gfx.beginFill(brushColor, 0.65);
    gfx.drawCircle(x, y, brushSize*1.6);
    gfx.endFill();
  } else if (brushType === 'spray') {
    for (let i=0;i<6;i++){
      const rx = x + (Math.random()-0.5)*brushSize*6;
      const ry = y + (Math.random()-0.5)*brushSize*6;
      gfx.beginFill(brushColor, 0.6);
      gfx.drawCircle(rx, ry, Math.max(1, brushSize*0.35));
      gfx.endFill();
    }
  }
  appPixi.renderer.render(gfx, { renderTexture: drawTexture, clear: false, transform: null });
}

function saveState(){
  try {
    const base = appPixi.renderer.extract.base64(drawSprite);
    undoStack.push(base);
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
  } catch(e){ console.warn('saveState error', e); }
}
function restoreBase64(b64){
  const img = new Image();
  img.onload = () => {
    const tex = PIXI.Texture.from(img);
    appPixi.renderer.render(tex, { renderTexture: drawTexture, clear: true });
  };
  img.src = b64;
}
undoBtn.addEventListener('click', () => {
  if (!undoStack.length) return;
  const top = undoStack.pop();
  redoStack.push(appPixi.renderer.extract.base64(drawSprite));
  restoreBase64(top);
});
redoBtn.addEventListener('click', () => {
  if (!redoStack.length) return;
  const top = redoStack.pop();
  undoStack.push(appPixi.renderer.extract.base64(drawSprite));
  restoreBase64(top);
});

clearBtn.addEventListener('click', () => {
  saveState();
  appPixi.renderer.render(new PIXI.Graphics(), { renderTexture: drawTexture, clear: true });
});

colorInput.addEventListener('change', (e) => { brushColor = hexToNum(e.target.value); });
sizeInput.addEventListener('input', (e) => { brushSize = Number(e.target.value); });
brushSelect.addEventListener('change', (e) => { brushType = e.target.value; });

function getCanvasDataURL(){ return appPixi.renderer.extract.base64(drawSprite); }

sellBtn.addEventListener('click', async () => {
  const artist = document.getElementById('artist').value.trim() || 'Anonymous';
  const price = Number(document.getElementById('price').value) || 1;
  const dataURL = getCanvasDataURL();
  const res = await fetch('/sell', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ artist, pricePi: price, dataURL }) });
  const j = await res.json();
  if (j.success) { alert('Artwork uploaded (pending). ArtId: ' + j.artId); loadGallery(); } else { alert('Upload error: ' + (j.error||'unknown')); }
});

const galleryDiv = document.getElementById('gallery');
async function loadGallery(){
  galleryDiv.innerHTML = 'Loading...';
  const res = await fetch('/gallery'); const list = await res.json();
  galleryDiv.innerHTML = '';
  list.forEach(art => {
    const card = document.createElement('div'); card.className='card';
    const img = document.createElement('img'); img.src = `/image/${art.id}`; img.alt = art.id;
    const status = document.createElement('div'); status.innerHTML = `<div style="font-weight:700">${art.creator}</div><div class="small">Price: ${art.pricePi} Pi</div>`;
    const badge = document.createElement('div'); badge.className='badge '+(art.status==='sold'?'sold':'pending'); badge.innerText = art.status.toUpperCase();
    const actions = document.createElement('div'); actions.className='actions';
    const payBtn = document.createElement('button'); payBtn.innerText='Create Payment'; payBtn.onclick = ()=>createPayment(art.id);
    const viewBtn = document.createElement('button'); viewBtn.innerText='View'; viewBtn.onclick = ()=>openViewer(art.id);
    const simBtn = document.createElement('button'); simBtn.innerText='Simulate Pay'; simBtn.onclick = ()=>simulatePay(art.paymentId);
    actions.appendChild(payBtn); actions.appendChild(viewBtn); actions.appendChild(simBtn);
    card.appendChild(img); card.appendChild(status); card.appendChild(badge); card.appendChild(actions);
    galleryDiv.appendChild(card);
  });
}
document.getElementById('refreshBtn').addEventListener('click', loadGallery);
loadGallery();

async function createPayment(artId){
  const res = await fetch('/create-payment', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ artId }) });
  const j = await res.json();
  if (!j.success) return alert('Payment creation failed: ' + (j.error||'unknown'));
  const payment = j.payment;
  if (payment.simulated) {
    alert('Simulated payment created: ' + payment.paymentId + ' — use Simulate Pay.');
  } else if (payment.approvalUrl) {
    window.open(payment.approvalUrl, '_blank');
  } else {
    alert('Payment created. PaymentId: ' + (payment.paymentId || JSON.stringify(payment)));
  }
}
function openViewer(artId){ window.open(`/viewer.html?artId=${artId}`, '_blank'); }
async function simulatePay(paymentId){
  if (!paymentId) return alert('No paymentId — create payment first.');
  const res = await fetch('/simulate-payment', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ paymentId, txId: 'simtx-'+Date.now() }) });
  const j = await res.json();
  if (j.success) { alert('Simulated payment processed'); loadGallery(); } else alert('Sim fail: ' + (j.error||''));
}
document.addEventListener('contextmenu', e => { e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) e.preventDefault();
  if (e.ctrlKey && e.shiftKey && (e.key==='I' || e.key==='i')) e.preventDefault();
});
