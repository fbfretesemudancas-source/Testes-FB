// Uso compartilhado de veículos: km da empresa, parcela de uso, custo estimado e rateio dos gastos no Painel.
// Sem DOM, fácil de testar. Um "uso" é { veiculoId, data, kmIni (ao retirar), kmFim (ao devolver), controlado, litros }.
import { num } from "./utils.js";

/** Gastos de manutenção e documentos: só a parcela da empresa entra no Painel (nos veículos compartilhados). */
export const RATEADOS = new Set(["oleo", "pneus", "revisao", "freios", "manutencao", "seguro", "ipva", "licenciamento"]);

const ini = u => Math.round(num(u.kmIni)), fim = u => Math.round(num(u.kmFim));
export const usoCompleto = u => ini(u) > 0 && fim(u) > ini(u);
export const kmUso = u => (usoCompleto(u) ? fim(u) - ini(u) : 0);
export const semDevolucao = u => ini(u) > 0 && !(fim(u) > 0);
export const kmInvalido = u => ini(u) > 0 && fim(u) > 0 && fim(u) <= ini(u);

/** Resumo dos usos de UM veículo.
 *  km = soma dos usos completos · total = do menor ao maior hodômetro anotado · parcela = km ÷ total (só com 2+ usos completos). */
export function resumoUsos(usos) {
  const ok = usos.filter(usoCompleto), km = ok.reduce((s, u) => s + kmUso(u), 0);
  const pts = usos.flatMap(u => [ini(u), fim(u)]).filter(x => x > 0);
  const total = pts.length ? Math.max(...pts) - Math.min(...pts) : 0;
  return { n: usos.length, completos: ok.length, km, total, parcela: ok.length >= 2 && total > 0 ? Math.min(1, km / total) : null, semDev: usos.filter(semDevolucao).length };
}

/** Custo estimado do uso da empresa: mesma conta do orçamento (consumo, preço do litro e manutenção por km). `p` = preço do veículo. */
export function custoEmpresa(km, p) {
  const c = num(p.consumo), litro = num(p.combustivel), man = num(p.manutencaoKm), porKm = (c > 0 ? litro / c : 0) + man;
  const combustivel = c > 0 ? km / c * litro : 0, manutencao = km * man;
  return { combustivel, manutencao, total: combustivel + manutencao, porKm: c > 0 || man > 0 ? porKm : null };
}

/** Consumo medido só nos usos "controlados" (tanque cheio ao retirar e ao devolver): km rodados ÷ litros abastecidos ao devolver. */
export function consumoControlado(usos) {
  const ok = usos.filter(u => u.controlado && usoCompleto(u) && num(u.litros) > 0);
  const dist = ok.reduce((s, u) => s + kmUso(u), 0), litros = ok.reduce((s, u) => s + num(u.litros), 0);
  return litros > 0 ? { kmL: dist / litros, dist, litros, n: ok.length } : null;
}

/** { veiculoId: parcela | null } para todos os veículos que têm usos. */
export function parcelasPorVeiculo(usos) {
  const g = {}; for (const u of usos || []) (g[u.veiculoId] = g[u.veiculoId] || []).push(u);
  return Object.fromEntries(Object.entries(g).map(([id, l]) => [id, resumoUsos(l).parcela]));
}

/** Valor da despesa que entra no Painel: nos veículos compartilhados, manutenção e documentos entram só na parcela da empresa.
 *  Sem parcela calculada (poucos usos), entra o valor inteiro. */
export function valorPainel(d, vehById, parcelas) {
  const v = num(d.valor), veic = vehById[d.veiculoId];
  if (!veic || !veic.compartilhado || !RATEADOS.has(d.tipo)) return v;
  const p = parcelas[d.veiculoId];
  return p == null ? v : v * p;
}
