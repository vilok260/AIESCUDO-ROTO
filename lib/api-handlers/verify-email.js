// /lib/api-handlers/analyze-email.js
// Función serverless para analizar e-mails sospechosos con Gemini

const MODEL = "gemini-2.0-flash";
const apiKey = (process.env.GEMINI_API_KEY || "").trim();

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY no está definida en el entorno.");
}

/**
 * Limpia el texto que devuelve Gemini para quedarnos solo con el JSON.
 * - Quita bloques ```json ... ```
 * - Quita texto basura antes del primer '{' o '['
 */
function cleanGeminiText(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text
    .replace(/```json/i, "") // quita ```json
    .replace(/```/g, "")      // quita ```
    .trim();

  // Si hay texto antes del primer { o [, lo eliminamos
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let cutIndex = -1;

  if (firstBrace === -1 && firstBracket === -1) {
    // No parece JSON
    return cleaned;
  } else if (firstBrace === -1) {
    cutIndex = firstBracket;
  } else if (firstBracket === -1) {
    cutIndex = firstBrace;
  } else {
    cutIndex = Math.min(firstBrace, firstBracket);
  }

  if (cutIndex > 0) {
    cleaned = cleaned.slice(cutIndex);
  }

  return cleaned.trim();
}

/**
 * Llama a Gemini para analizar un e-mail
 */
async function analyzeWithGemini(query, context = "email") {
  const prompt = `
Eres AIESCUDO, un experto en ciberseguridad y detección de fraude especializado en phishing por e-mail.

Analiza el e-mail o la dirección proporcionada (puede incluir asunto y cuerpo del mensaje) y clasifica el nivel de riesgo.

Debes devolver EXCLUSIVAMENTE un JSON VÁLIDO con este formato (sin texto adicional):

{
  "status": "PELIGRO" | "ADVERTENCIA" | "SEGURO",
  "title": "Resumen corto del análisis",
  "summary": "Explicación breve del riesgo o por qué parece seguro (máx. 120 palabras)",
  "sources": [
    { "name": "Motivo o pista detectada", "uri": "URL o '#'" }
  ]
}

Reglas importantes:
- No añadas bloques de markdown (\`\`\`json, \`\`\`, etc.).
- No escribas texto fuera del JSON.
- Si el e-mail parece muy peligroso (phishing claro, suplantación bancaria, etc.), usa "PELIGRO".
- Si hay señales sospechosas pero no 100% claras, usa "ADVERTENCIA".
- Si no ves nada raro, usa "SEGURO".

E-MAIL / CONTENIDO A ANALIZAR:
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
    console.error("❌ Error HTTP de Gemini (email):", data);
    throw new Error(data?.error?.message || `Error HTTP ${resp.status}`);
  }

  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  const cleaned = cleanGeminiText(rawText);

  let iaResponse;
  try {
    iaResponse = JSON.parse(cleaned);
  } catch (e) {
    console.error("❌ La IA devolvió texto no JSON (email):", cleaned);
    throw new Error("La IA devolvió texto no JSON:\n" + cleaned);
  }

  // Validación mínima de campos
  if (!iaResponse.status || !iaResponse.title || !iaResponse.summary) {
    throw new Error(
      "La respuesta de la IA no contenía todos los campos requeridos."
    );
  }

  if (!Array.isArray(iaResponse.sources)) {
    iaResponse.sources = [];
  }

  return iaResponse;
}

// Handler serverless de Vercel
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
    const iaResponse = await analyzeWithGemini(query, context || "email");

    // Misma forma que en analyze-link, para que el front no cambie
    return res.status(200).json({
      ok: true,
      status: iaResponse.status,
      title: iaResponse.title,
      summary: iaResponse.summary,
      sources: iaResponse.sources,
      query,
    });
  } catch (error) {
    console.error("❌ Error general en /api/analyze-email:", error);
    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error interno al analizar el e-mail con la inteligencia artificial.",
    });
  }
};
