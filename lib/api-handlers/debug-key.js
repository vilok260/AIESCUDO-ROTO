// /lib/api-handlers/debug-key.js
// SOLO PARA PRUEBAS

module.exports = async (req, res) => {
  return res.status(200).json({
    hasKey: !!process.env.GEMINI_API_KEY,
    keyPreview: process.env.GEMINI_API_KEY
      ? process.env.GEMINI_API_KEY.slice(0, 6) + "..."
      : null
  });
};
