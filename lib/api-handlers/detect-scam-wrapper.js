// lib/api-handlers/detect-scam-wrapper.js
const path = require("path");
const fs = require("fs");

module.exports = async function analyze(payload = {}) {
  const handlerPath = path.join(process.cwd(), "lib", "api-handlers", "detect-scam.js");
  if (!fs.existsSync(handlerPath)) {
    console.warn("detect-scam-wrapper: handler no encontrado", handlerPath);
    throw new Error("detect-scam handler no encontrado");
  }

  const handler = require(handlerPath);

  // 1) Si el handler exporta una función 'analyze' directamente, úsala (mejor opción)
  if (typeof handler.analyze === "function") {
    try {
      const out = await Promise.resolve(handler.analyze(payload));
      if (out && typeof out === "object") return out;
    } catch (e) {
      console.warn("detect-scam-wrapper: handler.analyze falló:", e && e.message);
    }
  }

  // 2) Preparamos req/res falsos compatibles con varios estilos de handler
  // fakeReq emula tanto body (si el handler lo usa directo) como eventos (si lee stream)
  const fakeReq = {
    method: "POST",
    url: "/internal",
    headers: { "content-type": "application/json" },
    body: payload,
    // helpers para compatibilidad con algunos handlers que leen stream
    on: (ev, cb) => {
      if (ev === "data") {
        // simular envío de chunks
        try {
          const s = JSON.stringify(payload);
          cb(Buffer.from(s));
        } catch (e) {}
      }
      if (ev === "end") {
        try { cb(); } catch (e) {}
      }
    }
  };

  let body = "";
  let ended = false;

  // fakeRes captura write/end/json y además acepta que el handler devuelva el objeto
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    write(chunk) {
      try { body += (typeof chunk === "string") ? chunk : chunk.toString(); } catch(e){}
    },
    end(chunk) {
      if (chunk) {
        try { body += (typeof chunk === "string") ? chunk : chunk.toString(); } catch(e){}
      }
      ended = true;
    },
    json(obj) {
      try { body = JSON.stringify(obj); } catch(e){}
      ended = true;
    }
  };

  // 3) Ejecutar handler: puede devolver valor o usar res
  try {
    const result = await Promise.resolve(handler(fakeReq, fakeRes));

    // Si el handler devolvió directamente un objeto útil, normalizamos y lo retornamos
    if (result && typeof result === "object") {
      // si ya es extendedReport
      if (result.extendedReport) return result.extendedReport;
      if (result.report) return result.report;
      if (result.score || result.classification) return result;
      // si el handler devolvió { ok:true, ... }
      if (result.ok && result.extendedReport) return result.extendedReport;
    }

    // Si el handler escribió algo por res, intentamos parsear body
    if (body && body.length) {
      try {
        const parsed = JSON.parse(body);
        if (parsed) {
          if (parsed.extendedReport) return parsed.extendedReport;
          if (parsed.report) return parsed.report;
          if (parsed.score || parsed.classification) return parsed;
          if (parsed.ok && parsed.extendedReport) return parsed.extendedReport;
        }
      } catch (e) {
        // no JSON -> ignorar
      }
    }

    // Si no hay nada útil, devolver null para que extended.js use el mock
    return null;
  } catch (err) {
    console.warn("detect-scam-wrapper: ejecución del handler falló:", err && err.message);
    return null;
  }
};