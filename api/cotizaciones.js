// Función de Vercel: busca las cotizaciones del día y se las entrega a la app.
// Si una fuente falla, esa moneda queda en null y la app usa su valor de respaldo.
const pedir = async (url) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 7000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": "Mozilla/5.0 CAMBIO" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  } finally {
    clearTimeout(t);
  }
};
const num = (s) => parseFloat(String(s).replace(/\./g, "").replace(",", "."));

// Argentina: dólar blue (venta)
async function argentina() {
  const j = await (await pedir("https://dolarapi.com/v1/dolares/blue")).json();
  return { valor: j.venta, fuente: "Dólar blue" };
}

// Bolivia: dólar paralelo (compra, precio de Binance P2P)
async function bolivia() {
  const j = await (await pedir("https://bo.dolarapi.com/v1/dolares/binance")).json();
  return { valor: j.compra, fuente: "Dólar paralelo" };
}

// Paraguay y Perú: planilla diaria del Banco Central del Paraguay
async function bcp() {
  const html = await (await pedir("https://www.bcp.gov.py/webapps/web/cotizacion/monedas")).text();
  const txt = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const pyg = txt.match(/\bUSD\s+1,0000\s+([\d.]+,\d+)/);
  const pen = txt.match(/\bPEN\s+([\d.]+,\d+)\s+[\d.]+,\d+/);
  return {
    PYG: pyg ? { valor: num(pyg[1]), fuente: "Banco Central del Paraguay" } : null,
    PEN: pen ? { valor: num(pen[1]), fuente: "Banco Central del Paraguay" } : null
  };
}

// Respaldo para Perú y Paraguay: tipo de cambio de mercado
async function respaldo() {
  const j = await (await pedir("https://open.er-api.com/v6/latest/USD")).json();
  return {
    PYG: { valor: j.rates.PYG, fuente: "Tipo de cambio de mercado" },
    PEN: { valor: j.rates.PEN, fuente: "Tipo de cambio de mercado" }
  };
}

module.exports = async (req, res) => {
  const [a, b, c] = await Promise.allSettled([argentina(), bolivia(), bcp()]);
  const out = {
    ARS: a.status === "fulfilled" ? a.value : null,
    BOB: b.status === "fulfilled" ? b.value : null,
    PEN: c.status === "fulfilled" ? c.value.PEN : null,
    PYG: c.status === "fulfilled" ? c.value.PYG : null,
    actualizado: new Date().toISOString()
  };
  if (!out.PEN || !out.PYG) {
    try {
      const r = await respaldo();
      out.PEN = out.PEN || r.PEN;
      out.PYG = out.PYG || r.PYG;
    } catch (e) {}
  }
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
  res.status(200).json(out);
};
