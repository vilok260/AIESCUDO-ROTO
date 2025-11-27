// /lib/api-handlers/detect-scam.js
// Análisis de QR / texto sospechoso con Gemini

const MODEL = "gemini-2.0-flash";
const apiKey = (process.env.GEMINI_API_KEY || "").trim();

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY no está definida en el entorno (detect-scam).");
}

function cleanGeminiJson(text) {
  if (!text || typeof text !== "string") return "";
  let t = text.trim();

  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();

  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }

  return t.trim();
}

async function analyzeScamText(query, context = "qr/texto") {
  const prompt = `
Eres AIESCUDO, experto en análisis de estafas digitales.

El usuario te envía el CONTENIDO al que apunta un código QR o un texto recibido por SMS/WhatsApp/Telegram (por ejemplo, enlaces de pago, supuestas webs de bancos, enlaces acortados, etc.).

Tu tarea:
- Detectar si puede ser phishing, smishing (SMS), enlace de pago falso, QR pegado encima de otro, etc.
- Clasificar el riesgo y dar recomendaciones claras.

Devuelve EXCLUSIVAMENTE un JSON VÁLIDO con este formato:

{
  "status": "PELIGRO" | "ADVERTENCIA" | "SEGURO",
  "title": "Resumen corto del análisis",
  "summary": "Explicación breve en español (máx. 150 palabras) sobre por qué es peligroso / sospechoso / parece seguro.",
  "sources": [
    { "name": "Motivo o pista detectada", "uri": "#" }
  ]
}

Reglas:
- NO uses markdown ni bloques \`\`\`.
- NO escribas nada fuera del JSON.
- Si ves algo muy típico de estafa de pago, banca o robos de credenciales, usa "PELIGRO".
- Si es raro pero no tan claro, usa "ADVERTENCIA".
- Si parece normal y sin riesgo especial, usa "SEGURO".

CONTENIDO (TEXTO / URL / DATOS) A ANALIZAR:
${query}

CONTEXTO: ${context}
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
    console.error("❌ Error HTTP de Gemini (detect-scam):", data);
    throw new Error(data?.error?.message || `Error HTTP ${resp.status}`);
  }

  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  const cleaned = cleanGeminiJson(rawText);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("❌ La IA devolvió texto no JSON (detect-scam):", rawText);
    throw new Error("La IA devolvió texto no JSON:\n" + rawText);
  }

  if (!parsed.status || !parsed.title || !parsed.summary) {
    throw new Error("La respuesta de la IA no contenía todos los campos requeridos.");
  }

  if (!Array.isArray(parsed.sources)) {
    parsed.sources = [];
  }

  return parsed;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Método no permitido. Usa POST." });
  }

  const { query, context } = req.body || {};

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: 'El campo "query" es obligatorio.' });
  }

  try {
    const ia = await analyzeScamText(query, context || "qr/texto");

    return res.status(200).json({
      ok: true,
      status: ia.status,
      title: ia.title,
      summary: ia.summary,
      sources: ia.sources,
      query,
    });
  } catch (error) {
    console.error("❌ Error general en /api/detect-scam:", error);
    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error interno al analizar el contenido sospechoso con IA.",
    });
  }
};
