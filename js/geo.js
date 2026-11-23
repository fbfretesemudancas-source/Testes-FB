// Distâncias com serviços gratuitos do OpenStreetMap (sem chave):
//  - Nominatim: endereço → coordenadas (máx. 1 consulta por segundo, só ao clicar no botão, resultado guardado)
//  - OSRM: rota de carro entre os pontos (servidor de demonstração, sem garantia de disponibilidade)
// O erro mais comum de distância vem de o endereço ser localizado fora do lugar certo. Por isso cada ponto mostra a
// precisão da localização e dá para colar as coordenadas exatas do Google Maps.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
export const OSRM_DEMO = "https://router.project-osrm.org";

let last = 0;
async function spaced() { // respeita o limite de 1 consulta por segundo
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
}

/** Texto de busca do endereço (também serve de chave para guardar as coordenadas). */
export const addrQuery = (a, semNumero = false) =>
  [[a.rua, !semNumero && a.num].filter(Boolean).join(" "), a.bairro, a.cidade, "Brasil"].filter(Boolean).join(", ");
export const hasAddr = a => !!(a && ((a.rua || "").trim() || (a.bairro || "").trim()));
const cidadeSemUF = c => String(c || "").replace(/\s*[–—-]\s*[A-Za-z]{2}\s*$/, "").trim();

/** Aceita "lat, lon" (como o Google Maps copia) ou um link do Google Maps com as coordenadas. Devolve {lat, lon} ou null. */
export function parseCoord(text) {
  const t = String(text || "").trim().replace(/%2C/gi, ","); if (!t) return null;
  let a, b;
  if (/https?:|google\.|goo\.gl|maps/i.test(t)) {
    const m = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(t) || /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(t) || /[?&](?:q|ll|query|destination)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(t);
    if (!m) return null; [, a, b] = m;
  } else { const n = t.match(/-?\d{1,3}(?:[.,]\d+)?/g); if (!n || n.length !== 2) return null; [a, b] = n; }
  const lat = parseFloat(String(a).replace(",", ".")), lon = parseFloat(String(b).replace(",", "."));
  return isFinite(lat) && isFinite(lon) && lat >= -34 && lat <= 6 && lon >= -74 && lon <= -28 ? { lat, lon } : null; // só Brasil
}

export const PRECISAO = { exato: "exata (número do imóvel)", rua: "só a rua, sem o número", bairro: "só o bairro", cidade: "só a cidade", manual: "coordenadas informadas por você" };
const RANK = { cidade: 0, bairro: 1, rua: 2, exato: 3 };
function precisaoDe(r) {
  const ad = r.address || {};
  if (ad.house_number) return "exato";
  if (r.category === "highway" || r.addresstype === "road") return "rua";
  if (["suburb", "neighbourhood", "quarter", "city_district", "residential"].includes(r.addresstype)) return "bairro";
  return "cidade";
}

/**
 * Localiza o endereço. Tenta até 3 buscas (com bairro, sem bairro, sem número) e fica com a mais precisa.
 * `near` (o ponto de partida) faz o mapa preferir resultados da sua região. Devolve null se não achou.
 */
export async function geocode(a, near) {
  const cid = cidadeSemUF(a.cidade), vistos = new Set(); let melhor = null;
  const tentativas = [addrQuery(a), [[a.rua, a.num].filter(Boolean).join(" "), cid, "Brasil"].filter(Boolean).join(", "), addrQuery(a, true)];
  for (const q of tentativas) {
    if (vistos.has(q)) continue; vistos.add(q);
    await spaced();
    let url = `${NOMINATIM}?format=jsonv2&limit=1&addressdetails=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
    if (near && isFinite(Number(near.lat)) && near.lat !== "") { const d = 0.35, la = Number(near.lat), lo = Number(near.lon); url += `&viewbox=${lo - d},${la + d},${lo + d},${la - d}`; }
    const r = await fetch(url);
    if (!r.ok) throw new Error("Nominatim " + r.status);
    const j = await r.json(); if (!(j && j[0])) continue;
    const precisao = precisaoDe(j[0]), cand = { q: addrQuery(a), lat: Number(j[0].lat), lon: Number(j[0].lon), label: j[0].display_name, precisao, aprox: precisao !== "exato" };
    if (!melhor || RANK[precisao] > RANK[melhor.precisao]) melhor = cand;
    if (precisao === "exato") break;
  }
  return melhor;
}

/** Rota de carro passando pelos pontos, na ordem. Devolve [{km, min}] (um trecho entre cada par de pontos). */
export async function osrmRoute(points, base) {
  const url = (base || OSRM_DEMO).replace(/\/+$/, "") + "/route/v1/driving/" + points.map(p => p.lon + "," + p.lat).join(";") + "?overview=false&steps=false";
  await spaced();
  const r = await fetch(url);
  if (!r.ok) throw new Error("OSRM " + r.status);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes || !j.routes[0]) throw new Error("Sem rota");
  return j.routes[0].legs.map(l => ({ km: l.distance / 1000, min: l.duration / 60 }));
}

export function haversineKm(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** Estimativa quando a rota falha: linha reta × fator, a 35 km/h de média urbana. */
export function estimateLegs(points, fator = 1.35) {
  return points.slice(1).map((p, i) => { const km = haversineKm(points[i], p) * fator; return { km, min: km / 35 * 60 }; });
}
/** Link do Google Maps com a rota completa, para você conferir a quilometragem. */
export const mapsDirUrl = (origem, via, destino) => "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + encodeURIComponent(origem) +
  "&destination=" + encodeURIComponent(destino) + (via.length ? "&waypoints=" + via.map(encodeURIComponent).join("%7C") : "");

/** Mapa do Google embutido na tela (Maps Embed API, modo direções): uso gratuito, mas exige a chave do Google com essa API ativada. */
export const mapsEmbedUrl = (key, origem, via, destino) => "https://www.google.com/maps/embed/v1/directions?key=" + encodeURIComponent(key) +
  "&origin=" + encodeURIComponent(origem) + "&destination=" + encodeURIComponent(destino) + (via.length ? "&waypoints=" + via.map(encodeURIComponent).join("%7C") : "") +
  "&mode=driving&language=pt-BR&region=BR";

/* ======================= Google Maps (alta precisão, opcional) =======================
 * Usa a Routes API (computeRoutes): você manda os endereços DIGITADOS e o Google localiza e traça a rota em uma única
 * consulta (o mesmo motor do Maps). Precisa de chave e de conta de cobrança no Google; a cota gratuita mensal costuma cobrir
 * o uso de uma empresa pequena e dá para limitar por dia no painel do Google. As coordenadas do Google não são guardadas.
 */
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
/** Coordenadas coladas valem mais; sem elas, vai o endereço digitado. */
const gWaypoint = a => { const m = parseCoord(a.coord); return m ? { location: { latLng: { latitude: m.lat, longitude: m.lon } } } : { address: addrQuery(a) }; };
/** Precisão a partir dos tipos que o Google devolve (street_address/premise = exato; route = só a rua; ...). */
export function googlePrecisao(g) {
  if (!g) return null;
  const t = g.type || [];
  let p = t.some(x => ["street_address", "premise", "subpremise"].includes(x)) ? "exato" : t.includes("route") ? "rua" : t.some(x => /neighborhood|sublocality/.test(x)) ? "bairro" : "cidade";
  if (g.partialMatch && p === "exato") p = "rua"; // o Google só casou parte do endereço: não confia no número
  return p;
}
/** Rota completa base → carga → descarga → base. Devolve { legs: [{km, min}], precisao: { col, ent } }. */
export async function googleRoute(key, base, col, ent, fim = base) { // fim: onde o veículo termina (padrão: volta ao ponto de saída)
  const body = { origin: gWaypoint(base), intermediates: [gWaypoint(col), gWaypoint(ent)], destination: gWaypoint(fim), travelMode: "DRIVE", languageCode: "pt-BR", regionCode: "BR", units: "METRIC" };
  const r = await fetch(ROUTES_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.legs.distanceMeters,routes.legs.duration,geocodingResults" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || "Google " + r.status); e.status = r.status; e.google = true; throw e; }
  const legs = j.routes && j.routes[0] && j.routes[0].legs;
  if (!legs || legs.length !== 3) { const e = new Error("Resposta do Google sem a rota completa"); e.google = true; throw e; }
  const ints = (j.geocodingResults && j.geocodingResults.intermediates) || [], find = i => ints.find(x => x.intermediateWaypointRequestIndex === i);
  const prec = i => (body.intermediates[i].location ? "manual" : googlePrecisao(find(i)));
  return { legs: legs.map(l => ({ km: (l.distanceMeters || 0) / 1000, min: parseFloat(String(l.duration || "0")) / 60 })), precisao: { col: prec(0), ent: prec(1) } };
}
/** Mensagem em português para cada tipo de falha do Google. */
export function googleErro(e) {
  if (e && (e.status === 401 || e.status === 403)) return "O Google recusou a chave. Confira se a Routes API está ativada, se a conta de cobrança está ligada e se o endereço deste sistema está liberado na chave.";
  if (e && e.status === 429) return "O Google limitou as consultas (a cota do dia acabou).";
  if (e && (e.status === 400 || e.status === 404)) return "O Google não conseguiu montar a rota com esses endereços. Confira rua, bairro e cidade, ou cole as coordenadas.";
  if (e && e.google) return "O Google respondeu de um jeito inesperado.";
  return "Não consegui falar com o Google agora (internet ou bloqueio do navegador).";
}
