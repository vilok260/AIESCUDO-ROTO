// lib/api-handlers/chat.js (robusto - demo)
export default async function handler(req, res){
  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Método no permitido', expected:'POST' });
    const body = req.body || {};
    let message = body.message;
    if(!message && typeof req.body === 'string'){
      try{ message = JSON.parse(req.body).message; }catch(e){}
    }
    message = String(message || '').trim();
    if(!message) return res.status(400).json({ error:'Falta campo message' });

    // Demo: respuesta simple. Aquí enlazarías a IA/servicio.
    const reply = `He recibido: "${message.slice(0,100)}" — (demo)`;
    return res.status(200).json({ ok:true, reply });
  } catch(err){
    console.error('chat error:', err && (err.stack || err.message || err));
    return res.status(500).json({ error:'internal_server_error', message: String(err && (err.message||err) || 'unknown') });
  }
}
