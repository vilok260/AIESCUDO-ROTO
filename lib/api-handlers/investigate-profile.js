// /lib/api-handlers/investigate-profile.js
// Análisis de perfiles sospechosos (redes sociales, dating, etc.) con Gemini

const MODEL = "gemini-2.0-flash";
const apiKey = (process.env.GEMINI_API_KEY || "").trim();

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY no está definida en el entorno (investigate-profile).");
}

// Reutilizamos un limpiador de JSON similar al de analyze-link
function cleanGeminiJson(text) {
  if (!text || typeof text !== "string") return "";

  let t = text.trim();

  // Quitar bloques ```json ... ```
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Recortar solo lo que haya entre el primer { y el último }
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }

  return t.trim();
}

async function analyzeProfile(query, context = "general") {
  const prompt = `
Eres AIESCUDO, un experto en OSINT y detección de perfiles falsos en redes sociales.

Analiza el siguiente perfil o enlace (puede ser URL de Instagram, Facebook, TikTok, Telegram, etc. o un @usuario) y evalúa si puede tratarse de:
- perfil falso romántico (romance scam),
- clon de cuenta real,
- suplantación para estafas de inversión/cripto,
- perfil aparentemente normal.

Devuelve EXCLUSIVAMENTE un JSON VÁLIDO con este formato:

{
  "status": "PELIGRO" | "ADVERTENCIA" | "SEGURO",
  "title": "Resumen corto del análisis",
  "summary": "Explicación breve en español (máx. 150 palabras) sobre por qué parece estafa, sospechoso o normal.",
  "sources": [
    { "name": "Motivo o pista detectada", "uri": "#" }
  ]
}

Reglas:
- NO uses bloques de markdown (\`\`\`).
- NO escribas nada fuera del JSON.
- Si hay señales claras de estafa (petición de dinero, inversiones, criptos, regalos sospechosos, erotismo + dinero, etc.), usa "PELIGRO".
- Si hay señales raras pero no concluyentes, usa "ADVERTENCIA".
- Si no ves nada raro, usa "SEGURO".

PERFIL / CONTENIDO A ANALIZAR:
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
    console.error("❌ Error HTTP de Gemini (investigate-profile):", data);
    throw new Error(data?.error?.message || `Error HTTP ${resp.status}`);
  }

  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  const cleaned = cleanGeminiJson(rawText);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("❌ La IA devolvió texto no JSON (investigate-profile):", rawText);
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

// Handler serverless (estilo analyze-link / verify-email)
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Método no permitido. Usa POST." });
  }

  const { query, context = "perfil" } = req.body || {};

  if (!query || typeof query !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: 'El campo "query" es obligatorio.' });
  }

  try {
    const ia = await analyzeProfile(query, context);

    return res.status(200).json({
      ok: true,
      status: ia.status,
      title: ia.title,
      summary: ia.summary,
      sources: ia.sources,
      query,
    });
  } catch (error) {
    console.error("❌ Error general en /api/investigate-profile:", error);
    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error interno al analizar el perfil sospechoso con IA.",
    });
  }
};
