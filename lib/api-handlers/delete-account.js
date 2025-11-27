export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error: "Método no permitido"});
  const { email } = req.body || {};
  console.log("Eliminar datos para:", email);
  // Aquí borrarías datos en BD (Supabase, Firebase, etc)
  res.status(200).json({ message: "Datos eliminados correctamente (simulación)." });
}