// Robot de Finca Akila: trae el clima de Filandia y noticias reales del Eje Cafetero.
// Lo corre GitHub Actions cada 30 minutos y guarda data/hoy.json
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const LAT = 4.702595, LON = -75.706103;
const BUSQUEDAS = [
  "Filandia Quindío",
  "cabalgata Quindío OR cabalgatas Eje Cafetero",
  "turismo Eje Cafetero",
  "Parque Nacional Natural Los Nevados",
  "Filandia Colombia travel"
];

const hora = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Bogota" }).replace(" ", "T") + "-05:00";
const limpiar = s => (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? limpiar(m[1]) : ""; };

async function noticias(q) {
  const en = /travel/.test(q);
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=${en ? "en-US" : "es-419"}&gl=${en ? "US" : "CO"}&ceid=${en ? "US:en" : "CO:es-419"}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (FincaAkilaBot)" } });
  if (!r.ok) throw new Error(q + " " + r.status);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(([, it]) => {
    const fuente = tag(it, "source");
    let titulo = tag(it, "title");
    if (fuente && titulo.endsWith(" - " + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    return { titulo, enlace: tag(it, "link"), fuente, fecha: new Date(tag(it, "pubDate")).toISOString(), tema: q, idioma: en ? "en" : "es" };
  });
}

async function clima() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=America%2FBogota&forecast_days=4`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("clima " + r.status);
  const j = await r.json();
  return {
    ahora: { temp: j.current.temperature_2m, humedad: j.current.relative_humidity_2m, lluvia: j.current.precipitation, codigo: j.current.weather_code, viento: j.current.wind_speed_10m },
    dias: j.daily.time.map((d, i) => ({ fecha: d, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], lluvia: j.daily.precipitation_probability_max[i], codigo: j.daily.weather_code[i] }))
  };
}

const previo = existsSync("data/hoy.json") ? JSON.parse(readFileSync("data/hoy.json", "utf8")) : {};
const salida = { actualizado: hora(), clima: previo.clima || null, noticias: previo.noticias || [] };

try { salida.clima = await clima(); } catch (e) { console.error("Clima:", e.message); }

const todas = [];
for (const q of BUSQUEDAS) {
  try { todas.push(...await noticias(q)); } catch (e) { console.error("Noticias:", e.message); }
}
if (todas.length) {
  const vistos = new Set();
  salida.noticias = todas
    .filter(n => n.titulo && !vistos.has(n.titulo.toLowerCase()) && vistos.add(n.titulo.toLowerCase()))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 24);
}

writeFileSync("data/hoy.json", JSON.stringify(salida, null, 2));
console.log(`Listo ${salida.actualizado}: ${salida.noticias.length} noticias, clima ${salida.clima ? "ok" : "sin datos"}`);
