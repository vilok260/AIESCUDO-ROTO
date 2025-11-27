// lib/api-handlers/analyze-link.js
// Analiza un enlace con Gemini y opcionalmente genera un extendedReport usando safe-analyze

const MODEL = "gemini-2.0-flash";
const apiKey = (process.env.GEMINI_API_KEY || "").trim();

const safeAnalyze = require("./safe-analyze"); // usa el helper que ya creaste
const path = require("path");
const fs = require("fs");

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY no está definida en el entorno.");
}

// Función auxiliar para limpiar el texto que devuelve Gemini y sacar el JSON
function extractJsonFromText(text) {
  if (!text) throw new Error("Gemini devolvió una respuesta vacía.");

  let cleaned = text.trim();
  cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "").trim();

  if (cleaned.toLowerCase().startsWith("json")) {
    cleaned = cleaned.slice(4).trim();
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

async function analyzeWithGemini(query, context) {
  const prompt = `
Eres AIESCUDO, un experto en ciberseguridad y detección de fraude.
Analiza el texto enviado y devuelve ÚNICAMENTE un JSON válido, sin explicaciones ni formato markdown, con este esquema:

{
  "status": "PELIGRO" | "ADVERTENCIA" | "SEGURO",
  "title": "Resumen corto",
  "summary": "Explicación breve",
  "sources": []
}

NO añadas nada más fuera del JSON. No uses \`\`\` ni la palabra "json" fuera del objeto.

ENLACE / TEXTO A ANALIZAR:
${query}
CONTEXTO: ${context}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    console.error("❌ Error HTTP de Gemini:", data);
    throw new Error(data?.error?.message || "Error inesperado en Gemini");
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  console.log("🧠 Gemini raw:", text);

  const json = extractJsonFromText(text);

  if (!json.status || !json.title || !json.summary) {
    throw new Error("JSON incompleto devuelto por Gemini.");
  }

  return json;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Método no permitido. Usa POST." });
  }

  // Body flexible: soporta POST con JSON desde front o llamadas internas
  const body = req.body || {};
  const { query, context = "general", generateExtended } = body;

  if (!query) {
    return res.status(400).json({ ok: false, error: "El campo 'query' es obligatorio." });
  }

  try {
    // Resultado principal con Gemini (tu lógica existente)
    const result = await analyzeWithGemini(query, context);

    // Preparar la respuesta base
    const response = {
      ok: true,
      ...result,
      query,
    };

    // Si piden informe extendido, invocamos safeAnalyze de forma segura
    if (generateExtended) {
      try {
        // payload para safeAnalyze: incluir text/url y metadatos
        const payload = { query, text: query, rawInput: query, source: "analyze-link" };

        // safeAnalyze puede devolver el extendedReport normalizado o null
        const ext = await safeAnalyze(payload);
        if (ext && typeof ext === "object") {
          response.extendedReport = ext;
        } else {
          // si safeAnalyze devuelve null, no rompemos: dejamos extendedReport como null
          response.extendedReport = null;
        }
      } catch (err) {
        console.warn("analyze-link: safeAnalyze failed:", err && err.message);
        response.extendedReport = null;
      }
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("❌ ERROR EN /api/analyze-link:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Error interno del servidor.",
    });
  }
};
