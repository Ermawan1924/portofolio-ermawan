# Ermawan portfolio (Vercel + admin)
1. Push this folder to GitHub and import it in Vercel (Framework: Other, no build command).
2. Storage tab > Create > Upstash for Redis > connect to the project.
3. Settings > Environment Variables: ADMIN_PASSWORD, SESSION_SECRET (openssl rand -hex 32).
4. Redeploy. Open /admin.
