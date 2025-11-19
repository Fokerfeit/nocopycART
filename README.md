# NocopycART

This repository contains a production-ready anonymous v1 of NocopycART:
- In-browser Procreate-style drawing (WebGL via PixiJS)
- Server (Node/Express) for pending/sold flow and Pi Testnet integration placeholders
- Client-side watermarking viewer
- Simulated payment flow and webhook simulator
- Deployment notes for Vercel (frontend) and Railway/Render (backend)

## Quick start (local)

1. Install dependencies:
   ```
   npm install
   ```

2. (Optional) Set PI API key:
   - Windows PowerShell:
     ```
     $env:PI_API_KEY = "sk_test_xxx"
     ```
   - Linux/macOS:
     ```
     export PI_API_KEY="sk_test_xxx"
     ```

3. Start:
   ```
   npm start
   ```

4. Open:
   http://localhost:3000

5. For webhook testing:
   - Run `ngrok http 3000`
   - Register `https://<ngrok-id>.ngrok.io/webhook/pi-events` in Pi dev console.

## Files
- server.js — main backend
- gallery.json — gallery data store
- public/ — frontend (index.html, viewer.html, style.css, app.js)
- uploads/ — server-side originals (created automatically)
- README.md — this file

## Deployment
Suggested:
- Frontend -> Vercel (serve static `public/`)
- Backend -> Railway / Render / Fly
- Domain: purchase `nocopycart.art` and point to Vercel; set backend API URL in frontend config.

For production, secure webhooks, verify Pi signatures, and use HTTPS.
