# Beyond Hosting Evaluation

## Project Requirements Summary

Based on `BEYOND_IMPLEMENTATION_PLAN.md`, the project consists of:

| Component | Technology | Key Requirements |
|-----------|------------|------------------|
| **Backend** | Express.js/Node.js + TypeScript | Persistent simulation running every 4 hours, REST API |
| **Database** | PostgreSQL | Pets, users, journals, friendships tables |
| **Frontend** | Next.js | Pet status pages, user dashboard |

**Critical Backend Requirement**: The simulation tick runs every 4 hours and must persist state. This means the backend needs to be "always on" or have reliable scheduled job support.

---

## Your Proposed Stack: Vercel + Render

### Vercel (Frontend) - RECOMMENDED

| Aspect | Details |
|--------|---------|
| **Free Tier** | 100 GB bandwidth, 6,000 build minutes, 150K serverless function calls |
| **GitHub Auto-Deploy** | Native integration, automatic preview deployments on PRs |
| **Next.js Support** | Best-in-class (Vercel created Next.js) |
| **Cold Starts** | Minimal for Edge functions |
| **Commercial Use** | Not allowed on free tier (hobby/personal only) |

**Verdict**: Excellent choice for the Next.js frontend.

### Render (Backend) - CONCERNS

| Aspect | Details |
|--------|---------|
| **Free Tier** | 750 hours, 100 GB bandwidth |
| **GitHub Auto-Deploy** | Native integration |
| **Sleep Behavior** | Spins down after 15 minutes of inactivity |
| **Cold Start** | 25-30 seconds to wake up |
| **Free PostgreSQL** | **Expires after 30 days** |

**Critical Issues for Your Project**:

1. **Sleep/Wake Problem**: The simulation needs to run a tick every 4 hours. On free tier, the service will sleep between ticks, causing:
   - 25-30 second cold starts when users visit
   - Potential missed ticks if no wake-up mechanism exists

2. **Database Expiration**: Free PostgreSQL databases expire after 30 days. Your pet data would be lost.

3. **Workaround**: Use [UptimeRobot](https://uptimerobot.com/) to ping your `/health` endpoint every 10-14 minutes to prevent sleep. This works but feels hacky.

---

## Comprehensive Comparison

### Backend Hosting Options

| Platform | Free Tier | Sleep Behavior | PostgreSQL | GitHub Deploy | Best For |
|----------|-----------|----------------|------------|---------------|----------|
| **Render** | 750 hrs | Sleeps @ 15min | 30-day expiry | Yes | Quick prototypes |
| **Railway** | $5 trial only | No free tier | Included | Yes | Pay-as-you-go |
| **Fly.io** | None (new users) | Pay per second | ~$2/mo self-managed | Yes | Global edge |
| **Koyeb** | 2 services free | Sleeps @ idle | No | Yes | Serverless |

### Database Options (Separate from Backend)

| Platform | Free Tier | Expiration | Sleep/Pause | Best For |
|----------|-----------|------------|-------------|----------|
| **Render PostgreSQL** | 1 GB | **30 days** | N/A | Testing only |
| **Supabase** | 500 MB, 2 projects | **Pauses after 7 days inactive** | Yes | MVPs with auth needs |
| **Neon** | 3 GB, 100 CU-hours | **No expiration** | Sleeps @ 5min, auto-wakes | Serverless workloads |
| **PlanetScale** | (MySQL only) | N/A | N/A | N/A |

### Frontend Hosting Options

| Platform | Free Tier | Next.js Support | Commercial Use |
|----------|-----------|-----------------|----------------|
| **Vercel** | 100 GB BW, 6K build mins | Best (created it) | No on free tier |
| **Netlify** | 100 GB BW, 300 build mins | Good (needs config) | Yes on free tier |
| **Cloudflare Pages** | Unlimited BW | Good | Yes |

---

## Recommended Stack for MVP

### Option A: Vercel + Render + Neon (Best Free Tier)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Vercel         │────▶│  Render         │────▶│  Neon           │
│  (Frontend)     │     │  (Backend)      │     │  (PostgreSQL)   │
│  Next.js        │     │  Express.js     │     │  Serverless     │
│  FREE           │     │  FREE*          │     │  FREE           │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              │ Ping every 10 min
                              ▼
                        ┌─────────────────┐
                        │  UptimeRobot    │
                        │  (Keep Alive)   │
                        │  FREE           │
                        └─────────────────┘
```

**Pros**:
- Completely free
- Neon DB doesn't expire
- Auto-deploy from GitHub on all services

**Cons**:
- Requires UptimeRobot workaround to prevent Render sleep
- Cold starts still possible if ping fails
- Neon sleeps after 5 min idle (but auto-wakes on connection)

### Option B: Vercel + Render Paid ($7/mo)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Vercel         │────▶│  Render         │────▶│  Render         │
│  (Frontend)     │     │  (Backend)      │     │  (PostgreSQL)   │
│  Next.js        │     │  Starter $7/mo  │     │  Starter $7/mo  │
│  FREE           │     │  No sleep       │     │  No expiry      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Cost**: ~$14/month
**Pros**:
- No workarounds needed
- Reliable, always-on backend
- Simple architecture

### Option C: Vercel + Railway ($5/mo minimum)

```
┌─────────────────┐     ┌─────────────────────────────────────────┐
│  Vercel         │────▶│  Railway                                │
│  (Frontend)     │     │  (Backend + PostgreSQL)                 │
│  FREE           │     │  $5/mo includes $5 usage credit         │
└─────────────────┘     └─────────────────────────────────────────┘
```

**Cost**: $5/month
**Pros**:
- One platform for backend + DB
- No sleep on paid tier
- Excellent DX

---

## Recommendation for Your Priorities

| Priority | Weight | Best Option |
|----------|--------|-------------|
| **Auto-deploy from GitHub** | High | All options support this |
| **Free tier for MVP** | High | Option A (Vercel + Render + Neon) |
| **Reliability** | Medium | Option B or C (paid) |

### Final Recommendation

**Start with Option A** (Vercel + Render + Neon + UptimeRobot):

1. **Frontend**: Vercel (free) - Your choice is correct
2. **Backend**: Render (free) - Your choice works with workaround
3. **Database**: Neon instead of Render PostgreSQL (no 30-day expiry)
4. **Keep-alive**: UptimeRobot (free) pinging every 10 minutes

**Migration path**: When you get traction, upgrade Render to the $7/mo Starter plan to eliminate sleep behavior.

---

## Implementation Notes

### Environment Variables

```env
# Backend (.env)
DATABASE_URL=postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/beyond
PORT=3000
NODE_ENV=production
BASE_URL=https://your-app.onrender.com

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://your-app.onrender.com
```

### Render Configuration (render.yaml)

```yaml
services:
  - type: web
    name: beyond-api
    runtime: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: NODE_ENV
        value: production
    healthCheckPath: /health
```

### Vercel Configuration (vercel.json)

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
```

### Health Endpoint for Keep-Alive

```typescript
// Already in your plan: src/api/router.ts
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

---

## Sources

### Vercel
- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Hobby Plan Limits](https://vercel.com/docs/plans/hobby)
- [Vercel vs Netlify Comparison](https://northflank.com/blog/vercel-vs-netlify-choosing-the-deployment-platform-in-2025)

### Render
- [Render Pricing](https://render.com/pricing)
- [Render Free Tier Limits](https://www.freetiers.com/directory/render)
- [Render Sleep Behavior](https://community.render.com/t/do-web-services-on-a-free-tier-go-to-sleep-after-some-time-inactive/3303)

### Database
- [Neon Pricing](https://neon.com/pricing)
- [Neon Free Tier](https://www.freetiers.com/directory/neon)
- [Supabase Pricing](https://supabase.com/pricing)

### Alternatives
- [Railway Pricing](https://railway.com/pricing)
- [Fly.io Pricing](https://fly.io/pricing/)
