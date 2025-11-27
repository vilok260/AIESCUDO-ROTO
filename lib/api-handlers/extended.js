// lib/api-handlers/extended.js
// GET /api/extended?taskId=xxx
// Intenta usar detect-scam.analyze -> detect-scam-wrapper -> fallback mock.

const path = require("path");
const fs = require("fs");

function safeRequire(fullPath) {
  try {
    return require(fullPath);
  } catch (e) {
    return null;
  }
}

module.exports = async function (req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: "Método no permitido" }));
    }

    // Admitimos ?taskId=xxx o ?input=<jsonEncoded>
    const { taskId, input } = req.query || {};
    if (!taskId && !input) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: "taskId o input requerido" }));
    }

    // Construir payload defensivo; si viene input JSON, intentar parsearlo
    let payload;
    try {
      payload = input ? (typeof input === "string" ? JSON.parse(input) : input) : { taskId };
    } catch (e) {
      // si parse falla, lo dejamos en raw
      payload = { taskId, rawInput: input };
    }

    // 1) Intentar detect-scam.js.analyze()
    try {
      const detectPath = path.join(process.cwd(), "lib", "api-handlers", "detect-scam.js");
      if (fs.existsSync(detectPath)) {
        const detect = safeRequire(detectPath);
        if (detect && typeof detect.analyze === "function") {
          // Llamada segura: admite retorno sync o async
          const real = await Promise.resolve(detect.analyze(payload));
          if (real && typeof real === "object") {
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ ok: true, extendedReport: real }));
          }
        }
      }
    } catch (err) {
      console.warn("extended -> detect.analyze failed:", err && err.message);
      // continuar al siguiente intento
    }

    // 2) Intentar wrapper detect-scam-wrapper.js
    try {
      const wrapperPath = path.join(process.cwd(), "lib", "api-handlers", "detect-scam-wrapper.js");
      if (fs.existsSync(wrapperPath)) {
        const wrapper = safeRequire(wrapperPath);
        if (typeof wrapper === "function") {
          const real2 = await Promise.resolve(wrapper(payload));
          if (real2 && typeof real2 === "object") {
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ ok: true, extendedReport: real2 }));
          }
        }
      }
    } catch (err) {
      console.warn("extended -> wrapper failed:", err && err.message);
      // fallback al mock
    }

    // 3) Fallback: mock (igual que antes)
    const mock = {
      reportId: `rpt_${taskId || "manual"}`,
      score: 84,
      classification: "Phishing / Alto Riesgo",
      severity: "high",
      indicators: [
        "Dominio que imita entidad",
        "Urgencia injustificada",
        "Petición de credenciales"
      ],
      semanticAnalysis:
        "El mensaje contiene lenguaje de coerción y urgencia. Se detecta un dominio que intenta imitar la entidad indicada y solicita acción inmediata.",
      recommendations: [
        "No responder ni aportar datos",
        "No clicar enlaces ni descargar adjuntos",
        "Contactar con la entidad oficial por canales seguros",
        "Bloquear remitente y reportar"
      ],
      evidence: { parsedUrls: [], detectedEntities: [] },
      generatedAt: new Date().toISOString(),
      version: "v1.0"
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, extendedReport: mock }));
  } catch (err) {
    console.error("extended handler error", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
};