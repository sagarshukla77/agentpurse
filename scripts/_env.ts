// Loads .env for scripts run outside Next.js (Node 20.12+).
try { (process as any).loadEnvFile?.('.env'); } catch { /* no .env file */ }
