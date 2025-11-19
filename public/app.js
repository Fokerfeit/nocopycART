
// --- PIXI JS Setup ---
const app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0xffffff
});
document.body.appendChild(app.view);

// Resize canvas on window resize
window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
});

const graphics = new PIXI.Graphics();
app.stage.addChild(graphics);

// --- Brush settings ---
let drawing = false;
let brushColor = 0x000000;
let brushSize = 4;

app.view.addEventListener('pointerdown', (e) => {
    drawing = true;
    const rect = app.view.getBoundingClientRect();
    graphics.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});

app.view.addEventListener('pointerup', () => { drawing = false; });

app.view.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const rect = app.view.getBoundingClientRect();
    graphics.lineStyle(brushSize, brushColor, 1);
    graphics.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    graphics.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});

// --- Color picker ---
const colorInput = document.createElement('input');
colorInput.type = 'color';
colorInput.value = '#000000';
colorInput.style.position = 'fixed';
colorInput.style.top = '10px';
colorInput.style.left = '10px';
colorInput.style.zIndex = 1000;
document.body.appendChild(colorInput);

colorInput.addEventListener('input', (e) => {
    brushColor = parseInt(e.target.value.replace('#','0x'));
});

// --- Brush size slider ---
const sizeInput = document.createElement('input');
sizeInput.type = 'range';
sizeInput.min = 1;
sizeInput.max = 50;
sizeInput.value = 4;
sizeInput.style.position = 'fixed';
sizeInput.style.top = '40px';
sizeInput.style.left = '10px';
sizeInput.style.zIndex = 1000;
document.body.appendChild(sizeInput);

sizeInput.addEventListener('input', (e) => {
    brushSize = parseInt(e.target.value);
});

// --- Save button to send drawing to server ---
const saveButton = document.createElement('button');
saveButton.textContent = 'Save Artwork';
saveButton.style.position = 'fixed';
saveButton.style.top = '70px';
saveButton.style.left = '10px';
saveButton.style.zIndex = 1000;
document.body.appendChild(saveButton);

saveButton.addEventListener('click', async () => {
    const dataURL = app.view.toDataURL("image/png");
    const artistName = prompt("Artist name?", "Anonymous");
    const pricePi = prompt("Price in Pi?", "1");

    const response = await fetch('/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist: artistName, pricePi, dataURL })
    });

    const result = await response.json();
    if (result.success) {
        alert(`Artwork saved! Art ID: ${result.artId}`);
    } else {
        alert(`Error: ${result.error}`);
    }
});
