// api/[...slug].js - catch-all router para Vercel
const path = require("path");
const fs = require("fs");

module.exports = async (req, res) => {
  try {
    // Extraer endpoint de la URL: /api/<endpoint>[...]
    const pathname = (req.url || "").split("?")[0] || "";
    const parts = pathname.split("/").filter(Boolean); // ['api','endpoint', ...]
    const endpoint = parts[1] || parts[0]; // soporta /api/endpoint o /endpoint

    if (!endpoint) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: "No endpoint specified" }));
    }

    // Ruta al handler dentro de lib/api-handlers
    const handlerPath = path.join(process.cwd(), "lib", "api-handlers", `${endpoint}.js`);

    if (!fs.existsSync(handlerPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: `Handler '${endpoint}' not found` }));
    }

    // Cargar el handler
    const handler = require(handlerPath);

    if (typeof handler !== "function") {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: `Handler '${endpoint}' does not export a function` }));
    }

    // Llamar al handler (le pasamos req, res)
    return handler(req, res);
  } catch (err) {
    console.error("Catch-all router error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "Internal server error", detail: String(err) }));
  }
};
