// /lib/api-handlers/check-wallet.js
// Análisis de wallets / direcciones cripto con IA (Gemini)
// Compatible con frontend AIESCUDO v9.1

const MODEL = "gemini-2.0-flash";
const apiKey = (process.env.GEMINI_API_KEY || "").trim();

if (!apiKey) {
  console.warn("⚠️ No hay GEMINI_API_KEY definida para /api/check-wallet");
}

// --- Utilidad para limpiar JSON generado ---
function cleanGeminiJson(text) {
  if (!text || typeof text !== "string") return "";

  let t = text.trim();
  // Eliminar ```json y ```
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Recortar solo el objeto JSON
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    t = t.slice(start, end + 1).trim();
  }

  return t.trim();
}

async function analyzeWallet(query, context = "general") {
  const prompt = `
Eres AIESCUDO, un sistema de ciberinteligencia especializado en análisis de ESTAFAS con criptomonedas.

Analiza esta wallet o dirección cripto:
${query}

Devuelve EXCLUSIVAMENTE un JSON con este formato:

{
  "status": "PELIGRO" | "ADVERTENCIA" | "SEGURO",
  "title": "Resumen corto del análisis",
  "summary": "Explicación breve en español (sobre por qué es peligroso / sospechoso / legítimo)",
  "sources": [
    { "name": "Fuente o indicio detectado", "uri": "#" }
  ]
}

Instrucciones importantes:
- NO uses bloques markdown (\`\`\`)
- NO añadas texto fuera del JSON
- Usa "PELIGRO" si hay signos de estafa o fraude
- Usa "ADVERTENCIA" si hay señales sospechosas
- Usa "SEGURO" si no se detecta nada raro
- Si es una wallet típica de phishing, scam o donaciones falsas: marcar PELIGRO

Contexto de usuario: ${context}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    console.error("❌ ERROR HTTP Gemini /check-wallet:", data);
    throw new Error(data?.error?.message || `Error HTTP ${resp.status}`);
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = cleanGeminiJson(raw);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("❌ La IA devolvió JSON inválido en /check-wallet:", raw);
    throw new Error("La IA devolvió JSON inválido:\n" + raw);
  }

  if (!parsed.status || !parsed.title || !parsed.summary) {
    throw new Error("Faltan campos en la respuesta de la IA.");
  }

  if (!Array.isArray(parsed.sources)) parsed.sources = [];

  return parsed;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido. Usa POST" });
  }

  const { query, context = "general" } = req.body || {};

  if (!query || typeof query !== "string") {
    return res.status(400).json({ ok: false, error: 'Campo "query" obligatorio' });
  }

  try {
    const result = await analyzeWallet(query, context);

    return res.status(200).json({
      ok: true,
      status: result.status,
      title: result.title,
      summary: result.summary,
      sources: result.sources,
      query,
    });
  } catch (err) {
    console.error("❌ Error final en /api/check-wallet:", err);
    return res.status(500).json({
      ok: false,
      status: "INCONCLUSO",
      title: "Error interno al analizar la wallet",
      summary: "No se pudo completar el análisis. Puede que el servicio de IA esté caído.",
      sources: [],
      query,
      error: err.message,
    });
  }
};
