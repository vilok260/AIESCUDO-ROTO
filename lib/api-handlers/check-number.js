// /lib/api-handlers/check-number.js
// Análisis avanzado de números de teléfono con Gemini (sin tocar el front)

// Modelo de Gemini
const MODEL = "gemini-2.0-flash";
const apiKey = (process.env.GEMINI_API_KEY || "").trim();

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY no está definida en el entorno.");
}

/**
 * Limpia el texto devuelto por Gemini y trata de extraer solo el JSON.
 */
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

/**
 * Llama a Gemini para analizar el número de teléfono.
 * - originalNumber: tal como lo escribe el usuario (con espacios o no)
 * - context: opcional, por si quieres especificar "whatsapp", "llamada", etc.
 */
async function analyzePhoneNumber(originalNumber, context = "general") {
  const inputStr = String(originalNumber || "").trim();
  if (!inputStr) {
    throw new Error('El campo "number" es obligatorio.');
  }

  // Versión limpia sin espacios ni guiones para análisis
  const cleanedNumber = inputStr.replace(/[\s\-().]/g, "");

  const prompt = `
Eres AIESCUDO, un asistente experto en ciberseguridad y fraude telefónico.

Analiza el siguiente número de teléfono y devuelve SIEMPRE SOLO un JSON válido.

Debes:
- Detectar el país (si se puede) usando el prefijo (+34, +351, +1, etc.).
- Deducir si es móvil, fijo, VoIP, número especial (tarificación adicional), etc.
- Estimar el nivel de riesgo: "PELIGRO", "ADVERTENCIA" o "SEGURO".
- Asignar un "risk_score" del 0 al 100 (0 = muy seguro, 100 = extremadamente peligroso).
- Proponer una o varias sugerencias de seguridad para el usuario (lista de frases cortas).

Formato EXACTO de respuesta (no añadas nada fuera de este JSON):

{
  "status": "PELIGRO" | "ADVERTENCIA" | "SEGURO",
  "title": "Título corto del análisis",
  "summary": "Explicación clara y breve en español (máx. 150 palabras).",
  "country": "Código ISO-2 del país si se conoce (por ejemplo: ES, FR, US, MX) o null",
  "region": "Región / ciudad aproximada si se puede inferir, o null",
  "type": "movil" | "fijo" | "voip" | "numero_especial" | "desconocido",
  "risk_score": 0,
  "suggestions": [
    "Consejo breve para el usuario",
    "Otro consejo breve si es necesario"
  ],
  "sources": [
    { "name": "Patrón o fuente utilizada (por ejemplo: 'prefijo +34 España')", "uri": "#" }
  ]
}

NO uses comillas simples, NO uses Markdown, NO uses bloques \`\`\`.
Número a analizar (original): "${inputStr}"
Número limpio para análisis: "${cleanedNumber}"
Contexto del usuario: "${context}"
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    console.error("❌ Error HTTP de Gemini (check-number):", data);
    throw new Error(
      data?.error?.message ||
        `Error HTTP ${resp.status} al llamar a Gemini en check-number`
    );
  }

  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  const cleanedJsonText = cleanGeminiJson(rawText);

  let parsed;
  try {
    parsed = JSON.parse(cleanedJsonText);
  } catch (e) {
    console.error("⛔ La IA devolvió texto no JSON en check-number:", rawText);
    throw new Error(
      "La IA devolvió texto no JSON:\n```json\n" + rawText + "\n```"
    );
  }

  // Valores por defecto por si faltan campos
  const status = parsed.status || "ADVERTENCIA";
  const title =
    parsed.title || "Resultado del análisis del número de teléfono";
  const summary =
    parsed.summary ||
    "No se pudo obtener un resumen detallado, pero no se detectaron patrones claros de fraude.";
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];

  const country = parsed.country || null;
  const region = parsed.region || null;
  const type = parsed.type || "desconocido";
  const risk_score =
    typeof parsed.risk_score === "number" ? parsed.risk_score : null;
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
    : [];

  // Esto es lo que devolveremos al front
  return {
    status,
    title,
    summary,
    sources,
    input: inputStr, // <- lo que verá el usuario en "Contenido analizado"
    country,
    region,
    type,
    risk_score,
    suggestions,
  };
}

// Handler para Vercel
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ ok: false, error: "Método no permitido. Usa POST." });
  }

  const { query, number, context = "general" } = req.body || {};

  // El front actual te manda "query", pero dejamos "number" por compatibilidad futura
  const rawInput = number || query;

  if (!rawInput) {
    return res.status(400).json({
      ok: false,
      error: 'El campo "number" (o "query") es obligatorio.',
    });
  }

  try {
    const result = await analyzePhoneNumber(rawInput, context);
    return res.status(200).json(result);
  } catch (err) {
    console.error("❌ ERROR en /api/check-number:", err);
    return res.status(500).json({
      ok: false,
      error:
        err.message ||
        "Error interno al analizar el número de teléfono (check-number).",
    });
  }
};
