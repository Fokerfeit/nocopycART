
import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';

const app = express();
const START_PORT = Number(process.env.PORT || 3000);
const UPLOADS = path.join('.', 'uploads');
const GALLERY_FILE = path.join('.', 'gallery.json');
const PI_API_KEY = process.env.PI_API_KEY || '';

fs.ensureDirSync(UPLOADS);
if (!fs.existsSync(GALLERY_FILE)) fs.writeFileSync(GALLERY_FILE, JSON.stringify([]));

app.use(express.static('public'));
app.use(bodyParser.json({ limit: '30mb' }));

function loadGallery(){ return fs.readJsonSync(GALLERY_FILE); }
function saveGallery(g){ fs.writeJsonSync(GALLERY_FILE, g, { spaces: 2 }); }
function sha256(buffer){ return crypto.createHash('sha256').update(buffer).digest('hex'); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/sell', async (req, res) => {
  try {
    const { artist = 'Anonymous', pricePi = 1, dataURL } = req.body;
    if (!dataURL) return res.status(400).json({ error: 'No image data' });

    const matches = dataURL.match(/^data:(image\/(png|jpeg));base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid dataURL' });
    const mime = matches[1];
    const b64 = matches[3];
    const buf = Buffer.from(b64, 'base64');

    const id = uuidv4();
    const ext = mime === 'image/jpeg' ? '.jpg' : '.png';
    const filename = `${id}${ext}`;
    const filepath = path.join(UPLOADS, filename);

    await fs.writeFile(filepath, buf);

    const entry = {
      id,
      filename,
      hash: sha256(buf),
      status: 'pending',
      paymentId: null,
      pricePi: Number(pricePi),
      timestamp: Date.now(),
      creator: artist,
      currentOwner: null,
      history: []
    };

    const gallery = loadGallery();
    gallery.unshift(entry);
    saveGallery(gallery);

    res.json({ success: true, artId: id });
  } catch (e) {
    console.error('sell error', e);
    res.status(500).json({ error: e.message });
  }
});

async function createPiPayment({ amount, memo = '', metadata = {} }) {
  if (!PI_API_KEY) {
    const paymentId = `sim-${uuidv4()}`;
    return { simulated: true, paymentId, amount, memo, metadata };
  }
  const url = 'https://api.minepi.com/v2/payments';
  const body = { amount, memo, metadata };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pi createPayment failed: ${res.status} ${t}`);
  }
  return res.json();
}

app.post('/create-payment', async (req, res) => {
  try {
    const { artId } = req.body;
    const gallery = loadGallery();
    const art = gallery.find(a => a.id === artId);
    if (!art) return res.status(404).json({ error: 'Artwork not found' });
    if (!['pending','resale'].includes(art.status)) return res.status(400).json({ error: 'Artwork not available' });

    const metadata = { artId, creator: art.creator };
    const payment = await createPiPayment({ amount: art.pricePi, memo: `Payment for art ${artId}`, metadata });

    const paymentId = payment.paymentId || payment.id || payment.data?.id || null;
    art.paymentId = paymentId || art.paymentId;
    art.paymentMeta = payment;
    saveGallery(gallery);

    res.json({ success: true, payment });
  } catch (e) {
    console.error('create-payment error', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/webhook/pi-events', async (req, res) => {
  try {
    const evt = req.body;
    console.log('PI WEBHOOK', JSON.stringify(evt).slice(0,800));
    const paymentId = evt?.data?.paymentId || evt?.data?.id || evt?.paymentId || null;
    const status = evt?.data?.status || evt?.data?.state || evt?.status || evt?.type || null;

    if (!paymentId) {
      console.warn('Webhook missing paymentId');
      return res.status(200).send('no paymentId');
    }

    const gallery = loadGallery();
    const art = gallery.find(a => a.paymentId && a.paymentId === paymentId);
    if (!art) {
      console.warn('No art matching paymentId', paymentId);
      return res.status(200).send('not found');
    }

    if (['COMPLETED','completed','CONFIRMED','confirmed','success'].includes(String(status))) {
      art.status = 'sold';
      art.currentOwner = evt.data?.payer || evt.data?.buyer || evt.data?.from || art.currentOwner || 'unknown';
      art.timestamp = Date.now();
      art.history = art.history || [];
      art.history.push({ type: 'sold', at: Date.now(), tx: evt.data?.txId || evt.data?.transactionId || null, price: art.pricePi });
      saveGallery(gallery);
      console.log(`Art ${art.id} marked sold via webhook`);
    } else {
      console.log(`Payment ${paymentId} status: ${status}`);
    }

    res.status(200).send('ok');
  } catch (e) {
    console.error('webhook handling error', e);
    res.status(500).send('error');
  }
});

app.post('/simulate-payment', express.json(), (req, res) => {
  try {
    const { paymentId, txId } = req.body;
    if (!paymentId) return res.status(400).json({ error: 'paymentId required' });
    const gallery = loadGallery();
    const art = gallery.find(a => a.paymentId && a.paymentId === paymentId);
    if (!art) return res.status(404).json({ error: 'art not found' });

    art.status = 'sold';
    art.currentOwner = 'sim-buyer';
    art.timestamp = Date.now();
    art.history = art.history || [];
    art.history.push({ type: 'sold', at: Date.now(), tx: txId || `tx-${uuidv4()}`, price: art.pricePi });
    saveGallery(gallery);
    res.json({ success: true, artId: art.id });
  } catch (e) {
    console.error('simulate error', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/resell', express.json(), (req, res) => {
  try {
    const { artId, owner, newPricePi } = req.body;
    const gallery = loadGallery();
    const art = gallery.find(a => a.id === artId);
    if (!art) return res.status(404).json({ error: 'not found' });
    if (art.currentOwner !== owner) return res.status(403).json({ error: 'not owner' });

    art.status = 'resale';
    art.pricePi = Number(newPricePi);
    art.paymentId = null;
    art.history = art.history || [];
    art.history.push({ type: 'resell', at: Date.now(), by: owner, price: art.pricePi });
    saveGallery(gallery);
    res.json({ success: true });
  } catch (e) {
    console.error('resell error', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/gallery', (req, res) => {
  res.json(loadGallery());
});

app.get('/image/:artId', (req, res) => {
  const artId = req.params.artId;
  const gallery = loadGallery();
  const art = gallery.find(a => a.id === artId);
  if (!art) return res.status(404).send('Not found');
  const p = path.join(UPLOADS, art.filename);
  if (!fs.existsSync(p)) return res.status(404).send('missing');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.resolve(p));
});

app.get('/health', (req, res) => res.json({ ok: true }));

function startServer(port) {
  const server = app.listen(port, () => console.log(`NocopycART running at http://localhost:${port}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < START_PORT + 10) {
      console.log(`Port ${port} busy — trying ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}
startServer(START_PORT);
