# Render Deployment Checklist

## Pre-Deployment ✓

- [x] No hardcoded localhost in source code
- [x] All URLs use environment variables
- [x] Backend uses PORT env var (defaults to 3000)
- [x] Frontend uses VITE_BACKEND_URL env var
- [x] CLI uses SERVER_URL env var
- [x] CORS enabled on backend
- [x] render.yaml configured
- [x] .renderignore configured

## Deployment Steps

### 1. Push to GitHub
```bash
cd "C:\Users\yogit\OneDrive\Desktop\devss\Still_Alive-"
git add -A
git commit -m "Configure for Render deployment"
git push origin main
```

### 2. Create Render Account & Connect
1. Go to https://render.com
2. Sign up / Log in
3. Connect GitHub account

### 3. Deploy Backend
1. Click "Create New" → "Web Service"
2. Select your GitHub repository
3. **Fill in:**
   - Name: `stillalive-backend`
   - Environment: `Node`
   - Region: `us-east`
   - Branch: `main`
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Plan: `Free` (or Starter if needed)

4. **Set Environment Variables:**
   - NODE_ENV: `production`
   - PORT: `3000`

5. Click "Create Web Service"
6. **Wait for deployment** (5-10 minutes)
7. **Note the URL:** e.g., `https://stillalive-backend.onrender.com`

### 4. Update Frontend Configuration
Set the backend URL for your frontend deployment:
```env
VITE_BACKEND_URL=https://stillalive-backend.onrender.com
SERVER_URL=https://stillalive-backend.onrender.com
```

Replace `stillalive-backend.onrender.com` with your actual service name.

### 5. Deploy Frontend (If deploying frontend too)
1. Click "Create New" → "Static Site" (or "Web Service")
2. Select repository
3. **Fill in:**
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - Set VITE_BACKEND_URL env var (see step 4)

4. Click "Create Static Site"

## Verification

After deployment:

1. **Check Backend Health**
   - Visit: `https://your-backend-url/` in browser
   - Should respond (even if blank)

2. **Test Socket Connection**
   - Open browser console
   - You should see connection logs if frontend is connected

3. **Check Logs**
   - Render Dashboard → Select Service → Logs
   - Look for: `🚀 Server running on port 3000`

## Environment URL Changes

If you ever need to change the URL:

1. **Option A: Change Render domain**
   - Render Dashboard → your service → Settings
   - Update custom domain and redeploy

2. **Option B: Update env vars**
   - Render Dashboard → Environment tab
   - Update `VITE_BACKEND_URL` value
   - Redeploy frontend

3. **Redeploy**
   - Render → Settings → "Manual Deploy" → "Deploy latest commit"
   - Or push new commit to GitHub (auto-redeploys)

## Free Tier Limits

- 750 hours/month per service
- Services spin down after 15 min inactivity
- Cold start time: ~30 seconds

**Upgrade to $7/month Starter for:**
- Always-on services
- No inactivity spin-down
- Better performance

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check logs for errors, verify PORT env var is set |
| CORS errors | Backend already allows `*`, check console for actual error |
| Can't connect from CLI | Verify SERVER_URL env var matches backend URL |
| Frontend shows "disconnected" | Check VITE_BACKEND_URL matches actual backend URL |
| Service slow | May be cold start, upgrade to Starter plan if needed |

## Notes

- All environment variables are properly configured
- No localhost references in production code
- Application will automatically adapt to URL changes
- Ready for production deployment
