// /lib/api-handlers/upload-ocr.js
// Serverless endpoint para subir imagen, extraer QR y OCR, devolver JSON.
// Requiere instalar: formidable, jimp, jsqr, tesseract.js
//
// npm install formidable jimp jsqr tesseract.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const formidable = require('formidable');
const Jimp = require('jimp');
const jsQR = require('jsqr');
const { createWorker } = require('tesseract.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Usa POST.' });
  }

  // Parse multipart form (file)
  const form = new formidable.IncomingForm({ multiples: false, keepExtensions: true, maxFileSize: 10 * 1024 * 1024 });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('formidable error:', err);
      return res.status(400).json({ ok: false, error: 'Error al recibir el archivo.' });
    }

    const file = files.file || files.image || files.upload;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Campo "file" (imagen) es obligatorio.' });
    }

    const tmpPath = file.path || file.filepath || file.path; // distintos nombres según versión
    try {
      // 1) Abrir imagen con Jimp
      const img = await Jimp.read(tmpPath);
      // crear canvas-like data para jsQR
      const { bitmap } = img; // { data, width, height }
      // jsQR espera Uint8ClampedArray RGBA
      const imageData = new Uint8ClampedArray(bitmap.data);
      const code = jsQR(imageData, bitmap.width, bitmap.height);

      const qrData = code && code.data ? String(code.data).trim() : null;

      // 2) OCR con tesseract.js (node)
      const worker = createWorker({
        // logger: m => console.log(m) // descomenta para debug
      });

      await worker.load();
      await worker.loadLanguage('spa');
      await worker.initialize('spa');
      // usar la ruta temporal del archivo para OCR
      const { data: { text } } = await worker.recognize(tmpPath);
      await worker.terminate();

      const ocrText = (text || '').trim();

      // 3) Barcodes: placeholder (implementable con Quagga/ZXing si lo deseas)
      const barcodes = []; // TODO: implementar detección 1D si lo pides.

      // Opcional: limpiar el tmp file si quieres
      try { fs.unlinkSync(tmpPath); } catch (e) { /* no crítico */ }

      return res.status(200).json({
        ok: true,
        qrData: qrData || null,
        ocrText: ocrText || null,
        barcodes,
      });
    } catch (e) {
      console.error('upload-ocr error:', e);
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch(_) {}
      return res.status(500).json({ ok: false, error: 'Error interno procesando la imagen.' });
    }
  });
};

