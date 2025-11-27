export default async function handler(req, res) {
  const { type, email } = req.body || {};
  console.log(`Solicitud de derechos: ${type} — Usuario: ${email}`);
  res.status(200).json({ status: "recibido", detail: "Tu solicitud será gestionada en un plazo máximo de 30 días." });
}