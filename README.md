# Panel PR · Next.js + Supabase

## Setup în 5 pași

### 1. Instalare
```bash
cd panel-pr
npm install
```

### 2. Supabase
1. Mergi la [supabase.com](https://supabase.com) → proiectul tău
2. **SQL Editor** → copiază și rulează `supabase-schema.sql`
3. Editează ultimul `INSERT` cu Discord ID-ul, numele și gradul tău
4. Din **Settings → API** copiază:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Discord Developer Portal
1. [discord.com/developers](https://discord.com/developers) → aplicația ta
2. OAuth2 → Redirects → adaugă:
   - `http://localhost:3000/auth/callback` (dev)
   - `https://panel-pr.vercel.app/auth/callback` (prod)
3. Copiază Client ID și Client Secret

### 4. Environment Variables
Editează `.env.local` cu valorile tale.

Pe **Vercel**: Settings → Environment Variables → adaugă toate variabilele din `.env.local`.

### 5. Run
```bash
npm run dev        # development
npm run build      # build producție
```

## Structura proiectului
```
panel-pr/
├── app/
│   ├── page.js              # Login page
│   ├── page.module.css      # Stiluri login
│   ├── layout.js            # Root layout + fonturi
│   ├── globals.css          # CSS global + variabile
│   ├── auth/callback/
│   │   └── page.js          # Callback Discord OAuth
│   ├── dashboard/
│   │   └── page.js          # Dashboard (de extins)
│   └── api/auth/
│       └── route.js         # API route Discord OAuth
├── lib/
│   └── supabase.js          # Client Supabase
├── supabase-schema.sql      # Schema baza de date
└── .env.local               # Environment variables
```

## Urmează
- Dashboard complet cu statistici
- Gestionare membri
- Sistem activități
- Whitelist management (admin)
