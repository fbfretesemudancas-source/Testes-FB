// Frota: tipos, avisos de vencimento, consumo medido e custos por veículo. Sem DOM, fácil de testar.
// Tudo que é gasto vai para a coleção "despesas" (a mesma que o Painel lê), com o veículo marcado.
import { num, today, fmtD } from "./utils.js";

export const MANUT = [["oleo", "Troca de óleo"], ["pneus", "Pneus"], ["revisao", "Revisão"], ["freios", "Freios"], ["manutencao", "Outra manutenção"]];
export const DESP_OUTRAS = [["pedagio", "Pedágio"], ["lavagem", "Lavagem"], ["multa", "Multa"], ["seguro", "Seguro"], ["ipva", "IPVA"], ["licenciamento", "Licenciamento"], ["outros", "Outros"]];
export const DOC_TIPOS = [["seguro", "Seguro"], ["ipva", "IPVA"], ["licenciamento", "Licenciamento"], ["outro", "Outro documento"]];
export const COMBUSTIVEIS = [["flex", "Flex"], ["gasolina", "Gasolina"], ["etanol", "Etanol"], ["diesel", "Diesel"], ["gnv", "GNV"]];
export const INTERVALO = { oleo: 5000, pneus: 40000, revisao: 10000, freios: 30000 }; // km até a próxima, sugestão
const TODOS = [["combustivel", "Combustível"], ...MANUT, ...DESP_OUTRAS];
export const labelDesp = k => (TODOS.find(x => x[0] === k) || [0, k])[1];
export const labelDoc = d => (DOC_TIPOS.find(x => x[0] === d.tipo) || [0, "Documento"])[1] + (d.descricao ? " (" + d.descricao + ")" : "");

export const blankVehicle = () => ({ placa: "", nome: "", modelo: "", ano: "", combustivel: "flex", kmAtual: "", consumo: "", manutencaoKm: "",
  ativo: true, compartilhado: false, // compartilhado = usado também fora dos serviços (km ao retirar/devolver e rateio no Painel)
  obs: "", docs: [] });
export const blankDoc = () => ({ tipo: "seguro", descricao: "", vencimento: "", valor: "", pagoPor: "outro", link: "", obs: "" });

const km = r => Math.round(num(r.km));
const dayDiff = (a, b) => { const p = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(a) - p(b)) / 86400000); };

/** Consumo medido (km/L) entre tanques cheios com hodômetro. Sem pelo menos dois tanques cheios, devolve null. */
export function consumoMedido(fuel) {
  const rs = fuel.filter(r => r.tipo === "combustivel" && km(r) > 0 && num(r.litros) > 0).sort((a, b) => km(a) - km(b));
  const fulls = rs.filter(r => r.cheio); let dist = 0, lit = 0;
  for (let i = 0; i + 1 < fulls.length; i++) {
    const a = km(fulls[i]), b = km(fulls[i + 1]); if (b <= a) continue;
    const l = rs.filter(r => km(r) > a && km(r) <= b).reduce((s, r) => s + num(r.litros), 0);
    if (l > 0) { dist += b - a; lit += l; }
  }
  return lit > 0 ? { kmL: dist / lit, dist, litros: lit } : null;
}
/** Último preço por litro pago (valor ÷ litros). */
export function ultimoPreco(fuel) {
  const r = fuel.filter(x => x.tipo === "combustivel" && num(x.litros) > 0 && num(x.valor) > 0).sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
  return r ? { preco: num(r.valor) / num(r.litros), data: r.data } : null;
}

/** Situação de um tipo de manutenção: última feita, próxima (km e/ou data) e nível: sem | ok | proximo | vencido. */
export function manutStatus(desp, tipo, kmAtual, hoje = today()) {
  const u = desp.filter(r => r.tipo === tipo).sort((a, b) => (b.data || "").localeCompare(a.data || "") || km(b) - km(a))[0];
  if (!u) return { tipo, ultimo: null, nivel: "sem" };
  const proxKm = num(u.proxKm) > 0 ? Math.round(num(u.proxKm)) : null, proxData = u.proxData || "";
  const falta = proxKm != null && kmAtual > 0 ? proxKm - kmAtual : null, dias = proxData ? dayDiff(proxData, hoje) : null;
  let nivel = "ok";
  if ((falta != null && falta <= 0) || (dias != null && dias < 0)) nivel = "vencido";
  else if ((falta != null && falta <= 500) || (dias != null && dias <= 30)) nivel = "proximo";
  return { tipo, ultimo: u, proxKm, proxData, falta, dias, nivel };
}
export function docStatus(d, hoje = today()) {
  if (!d.vencimento) return { nivel: "sem", dias: null };
  const dias = dayDiff(d.vencimento, hoje);
  return { nivel: dias < 0 ? "vencido" : dias <= 30 ? "proximo" : "ok", dias };
}
/** Avisos do veículo: documentos e manutenções vencidos ou perto de vencer. `aba` diz onde resolver. */
export function avisos(v, desp, hoje = today()) {
  const out = [], kmAtual = Math.round(num(v.kmAtual));
  (v.docs || []).forEach(d => {
    const s = docStatus(d, hoje);
    if (s.nivel === "vencido") out.push({ nivel: "vencido", aba: "documentos", texto: `${labelDoc(d)} venceu há ${-s.dias} dia(s) (${fmtD(d.vencimento)})` });
    else if (s.nivel === "proximo") out.push({ nivel: "proximo", aba: "documentos", texto: `${labelDoc(d)} vence ${s.dias === 0 ? "hoje" : "em " + s.dias + " dia(s)"} (${fmtD(d.vencimento)})` });
  });
  MANUT.forEach(([t, l]) => {
    const s = manutStatus(desp, t, kmAtual, hoje);
    if (s.nivel === "vencido") out.push({ nivel: "vencido", aba: "manutencao", texto: `${l}: passou do prazo${s.falta != null && s.falta <= 0 ? " (" + -s.falta + " km além)" : ""}` });
    else if (s.nivel === "proximo") out.push({ nivel: "proximo", aba: "manutencao", texto: `${l}: ${s.falta != null && s.falta <= 500 ? "faltam " + s.falta + " km" : "vence em " + s.dias + " dia(s)"}` });
  });
  return out.sort((a, b) => (a.nivel === "vencido" ? 0 : 1) - (b.nivel === "vencido" ? 0 : 1));
}

/* ---------- gastos ---------- */
export const gastoMes = (desp, key) => desp.filter(d => (d.data || "").startsWith(key)).reduce((s, d) => s + num(d.valor), 0);
/** Primeira e última leitura de hodômetro nos registros. */
export function leituras(desp) {
  const rs = desp.filter(r => km(r) > 0).sort((a, b) => km(a) - km(b));
  return rs.length >= 2 ? { min: km(rs[0]), max: km(rs[rs.length - 1]), rod: km(rs[rs.length - 1]) - km(rs[0]), primeira: rs[0] } : null;
}
const depois = (r, L) => (r.data || "") > (L.primeira.data || "") || (r.data === L.primeira.data && km(r) > L.min); // gasto após a primeira leitura
/** Custo por km rodado = gastos desde a primeira leitura ÷ km rodados. Estimativa. */
export function custoPorKm(desp) {
  const L = leituras(desp); if (!L || L.rod <= 0) return null;
  return desp.filter(r => depois(r, L)).reduce((s, r) => s + num(r.valor), 0) / L.rod;
}
/** Manutenção por km rodado, calculada dos registros (referência para o valor que você usa no preço). */
export function manutencaoPorKm(desp) {
  const L = leituras(desp); if (!L || L.rod <= 0) return null;
  const m = new Set(MANUT.map(x => x[0]));
  return desp.filter(r => m.has(r.tipo) && depois(r, L)).reduce((s, r) => s + num(r.valor), 0) / L.rod;
}
/** Preço do orçamento: consumo e manutenção por km vêm SÓ da ficha do veículo (não há mais padrão nas Configurações). */
export function precoDoVeiculo(preco, veh) {
  return { preco: { ...preco, consumo: veh && veh.consumo != null ? String(veh.consumo) : "", manutencaoKm: veh && veh.manutencaoKm != null ? String(veh.manutencaoKm) : "" } };
}
/** O que falta na ficha do veículo para calcular o frete (lista vazia = pode calcular). */
export function faltaNoVeiculo(veh) {
  if (!veh) return ["veículo"];
  const f = [];
  if (!(num(veh.consumo) > 0)) f.push("consumo (km por litro)");
  if (!String(veh.manutencaoKm == null ? "" : veh.manutencaoKm).trim()) f.push("manutenção (R$ por km)");
  return f;
}
