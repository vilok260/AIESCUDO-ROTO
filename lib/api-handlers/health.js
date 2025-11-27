// lib/api-handlers/health.js
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    env: process.env.VERCEL ? 'vercel' : 'local'
  });
}

