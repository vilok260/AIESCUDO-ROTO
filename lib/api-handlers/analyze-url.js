// lib/api-handlers/analyze-url.js (robusto - captura errores y siempre responde JSON)
function isValidUrl(s){
  try { new URL(s); return true; } catch(e){ return false; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido', expected: 'POST' });
    }

    // intentar leer body
    const body = req.body || {};
    // Si por alguna razón Vercel no parsea, intentamos parsear manualmente
    let url = body.url;
    if (!url && typeof req.body === 'string') {
      try { const p = JSON.parse(req.body); url = p.url; } catch(e) {}
    }

    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'URL inválida o no enviada', received: body });
    }

    // Heurísticas simples (puedes ampliar)
    const lower = String(url).toLowerCase();
    const suspiciousWords = ['login','confirm','secure','bank','verify','update','account','transfer','password','client','security','urgent','paypal'];
    let score = 0;
    if (url.length > 75) score += 15;
    suspiciousWords.forEach(w => { if (lower.includes(w)) score += 10; });
    const newTlds = ['.icu', '.xyz', '.top', '.club', '.vip', '.rest'];
    if (newTlds.some(t => lower.endsWith(t))) score += 15;
    const verdict = score >= 40 ? 'sospechoso' : 'probable-seguro';

    // Respuesta JSON (siempre)
    return res.status(200).json({
      ok: true,
      url,
      verdict,
      score,
      details: {
        length: url.length,
        matchedWords: suspiciousWords.filter(w => lower.includes(w)),
        tldFlagged: newTlds.some(t => lower.endsWith(t))
      }
    });
  } catch (err) {
    // LOG para que lo veas en Vercel (consola)
    console.error('analyze-url error:', err && (err.stack || err.message || err));
    // responder JSON aunque haya error interno
    return res.status(500).json({ error: 'internal_server_error', message: String(err && (err.message || err) || 'unknown') });
  }
}


