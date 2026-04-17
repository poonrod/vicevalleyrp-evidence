# Evidence web portal

Next.js 14 (App Router) + Tailwind. Dark, table-first UI for evidence, incidents, and admin pages.

## Setup

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev
```

Open `http://localhost:3000`. Use **Login** → Discord OAuth on the API (session cookie is set on the API origin; ensure browser allows third-party cookies in dev or use same-site deployment patterns in production).

## Production

- Set `NEXT_PUBLIC_API_URL` to your public API (e.g. `https://api.yourdomain.com`).
- Set `NEXT_PUBLIC_WEB_APP_URL` to the portal origin where users open the site (e.g. `https://evidence.yourdomain.com`). The root layout emits a `<base href="…">` for that origin so relative RSC requests (e.g. `/evidence/index.txt`) resolve on **evidence**, not the API host. A `beforeInteractive` script still redirects if someone opens the bundle on the API domain.  
- Deploy behind HTTPS; align cookie `Secure` with API `NODE_ENV=production`.  
- Consider putting **Next** and **API** on sibling subdomains with correct CORS.

## Pages

- `/login` — redirects to API Discord login  
- `/dashboard` — summary  
- `/evidence`, `/evidence/[id]` — list + detail (presigned media link)  
- `/incidents`  
- `/admin/*` — users, retention, deletion queue, video policy  
