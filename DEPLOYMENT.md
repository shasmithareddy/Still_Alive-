# Deployment Guide - Still Alive

## Environment Variables

The application uses environment variables to adapt to different deployment environments without hardcoded URLs.

### Key Environment Variables

| Variable | Used By | Purpose | Example |
|----------|---------|---------|---------|
| `VITE_BACKEND_URL` | Frontend React | Socket.IO server address | `https://your-app.onrender.com` |
| `SERVER_URL` | CLI bridge | WebSocket server address | `https://your-app.onrender.com` |
| `NODE_ENV` | Backend | Application mode | `production` |
| `PORT` | Backend | Server port | `3000` or `3001` |

### Optional PeerJS Variables (for custom PeerJS server)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_PEER_HOST` | undefined (uses cloud) | Custom PeerJS server hostname |
| `VITE_PEER_PORT` | 443 | PeerJS server port |
| `VITE_PEER_PATH` | /peerjs | PeerJS server path |
| `VITE_PEER_SECURE` | false | Use HTTPS/WSS for PeerJS |

---

## Deployment to Render

### Step 1: Connect GitHub Repository

1. Sign in to [render.com](https://render.com)
2. Create new Web Service
3. Connect your GitHub repository: `https://github.com/shasmithareddy/Still_Alive-`
4. Select the repository

### Step 2: Configure the Backend Service

**Basic Settings:**
- **Name**: `stillalive-backend` (or your preference)
- **Environment**: Node
- **Region**: us-east (or closest to you)
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && npm start`
- **Plan**: Free tier (or upgrade as needed)

### Step 3: Set Environment Variables

On the Render dashboard for your service, go to **Environment** tab and add:

```
NODE_ENV=production
PORT=3000
```

### Step 4: Deploy Backend

1. Click "Create Web Service"
2. Render will build and deploy automatically
3. Once deployed, you'll get a URL like: `https://stillalive-backend.onrender.com`
4. Copy this URL (you'll need it for the frontend)

### Step 5: Configure Frontend

After backend is deployed, update your frontend environment:

**In your frontend deployment (or local .env):**

```env
VITE_BACKEND_URL=https://stillalive-backend.onrender.com
SERVER_URL=https://stillalive-backend.onrender.com
```

Replace `stillalive-backend.onrender.com` with your actual Render URL.

---

## Local Development

For local development, use the defaults in `.env`:

```env
VITE_BACKEND_URL=http://localhost:3001
SERVER_URL=http://localhost:3001
```

---

## How It Works (No Hardcoded URLs)

### Frontend (`src/services/communicationService.ts`)
```typescript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
this.socket = io(BACKEND_URL, { /* config */ });
```

### CLI (`cli-chat.js`)
```javascript
const serverUrl = process.env.SERVER_URL || "http://localhost:3001";
webSocket = ClientIO(serverUrl, { /* config */ });
```

### Backend (`backend/server.js`)
```javascript
const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => { /* ... */ });
```

**Key Points:**
- ✅ No hardcoded URLs in source code
- ✅ Environment variables have sensible defaults
- ✅ Works locally and in production
- ✅ Automatically adapts when deployed

---

## Testing Different Environments

### Local Test
```bash
# Terminal 1: Start backend
cd backend
npm install
npm start

# Terminal 2: Start frontend
npm install
npm run dev
```

### Production Test with Render URL (local frontend)
```bash
VITE_BACKEND_URL=https://your-app.onrender.com npm run dev
```

### CLI Client Test
```bash
SERVER_URL=https://your-app.onrender.com node cli-chat.js
```

---

## Troubleshooting

### Backend won't start on Render
- Check backend logs: Render dashboard → Logs
- Ensure `PORT` env var is set (defaults to 3000)
- Check `backend/package.json` has correct start script

### Frontend can't connect to backend
- Verify `VITE_BACKEND_URL` is set correctly
- Check backend is running and accessible
- Check CORS is enabled (it is in `backend/server.js`)

### CORS errors
- Backend already allows all origins: `cors({ origin: "*" })`
- If issues persist, add your frontend URL to CORS policy

---

## Custom Domain (Optional)

If using custom domain instead of Render URL:

1. Configure domain in Render dashboard
2. Update environment variables to use custom domain:
   ```
   VITE_BACKEND_URL=https://yourdomain.com
   SERVER_URL=https://yourdomain.com
   ```
3. Rebuild frontend with new URL

---

## Summary

✅ **Backend**: Uses `PORT` and `NODE_ENV` environment variables  
✅ **Frontend**: Uses `VITE_BACKEND_URL` environment variable  
✅ **CLI**: Uses `SERVER_URL` environment variable  
✅ **No localhost hardcoding**: All configurable via env vars  
✅ **Production ready**: Will adapt to any URL change
