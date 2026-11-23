// Pagamento de funcionários: salário mensal OU valor combinado por frete realizado.
// Sem DOM, fácil de testar. As pendências são calculadas na hora (nada é gravado até você marcar "Pagar").
//   · mensal: um pagamento por mês, vencendo no "dia do pagamento", a partir de "Começa a valer em"
//   · frete:  um pagamento por OS concluída da equipe do funcionário. Valor: o da OS (definido no orçamento) ou, se não houver, o padrão da ficha
// Ao pagar, a página cria uma despesa (que o Painel soma) e um registro em "pagfunc" para não cobrar de novo.
import { num, today } from "./utils.js";
import { osStatus } from "./domain.js";
import { addDays } from "./agenda.js";

export const PAG_TIPOS = [["", "Não definida"], ["mensal", "Salário mensal"], ["frete", "Por frete realizado"]];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const norm = s => String(s || "").trim().toLowerCase();
export const mesLabel = ym => MESES[+ym.slice(5, 7) - 1] + "/" + ym.slice(0, 4);
const lastDay = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const nextYm = ym => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + "-" + String(m).padStart(2, "0"); };

/** Pagamentos ainda não feitos, do mais antigo para o mais novo.
 *  st (só mensal): atrasado | hoje | breve (até 2 dias) | futuro. Frete: sempre "pagar". */
export function pendencias(staff, teams, orders, pagos, hoje = today()) {
  const feitos = new Set((pagos || []).map(p => p.chave)), breve = addDays(hoje, 2), out = [];
  for (const s of staff || []) {
    if (!s.pagTipo) continue;
    const desde = s.pagDesde || hoje;
    if (s.pagTipo === "mensal") {
      const v = num(s.salario);
      if (v <= 0 || s.situacao === "desligado") continue;
      const fim = hoje.slice(0, 7);
      for (let ym = desde.slice(0, 7), n = 0; ym <= fim && n < 60; ym = nextYm(ym), n++) {
        const dia = Math.min(Math.max(1, parseInt(s.diaPag, 10) || 5), lastDay(ym)), venc = ym + "-" + String(dia).padStart(2, "0");
        const chave = "m:" + s._id + ":" + ym;
        if (venc < desde || feitos.has(chave)) continue; // o primeiro vencimento é o primeiro que cai a partir da data de início
        out.push({ chave, tipo: "mensal", staffId: s._id, nome: s.nome, ref: ym, venc, valor: v, titulo: "Salário de " + mesLabel(ym),
          st: venc < hoje ? "atrasado" : venc === hoje ? "hoje" : venc <= breve ? "breve" : "futuro" });
      }
    } else if (s.pagTipo === "frete") {
      const padrao = num(s.valorFrete); // valor padrão da ficha; a OS (herdado do orçamento) pode definir outro em "pagFunc"
      const eqs = new Set((teams || []).filter(t => (t.membros || []).includes(s._id)).map(t => norm(t.nome)));
      for (const o of orders || []) {
        if (!o.equipe || !eqs.has(norm(o.equipe)) || osStatus(o) !== "concluida" || (o.data || "") < desde) continue;
        const chave = "f:" + s._id + ":" + o._id;
        if (feitos.has(chave)) continue;
        const daOS = num(o.pagFunc), v = daOS > 0 ? daOS : padrao; // sem nenhum dos dois: aparece com valor em branco para você informar
        out.push({ chave, tipo: "frete", staffId: s._id, nome: s.nome, osId: o._id, osNum: o.num, venc: o.data, valor: v, st: "pagar", origem: daOS > 0 ? "os" : v > 0 ? "ficha" : "", semValor: v <= 0,
          titulo: "Frete OS " + String(o.num).padStart(4, "0") + " · " + (o.cliNome || "Sem nome") });
      }
    }
  }
  return out.sort((a, b) => String(a.venc).localeCompare(String(b.venc)) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}
/** O que vira aviso no sino: fretes a pagar e salários atrasados, que vencem hoje ou em até 2 dias. */
export const paraAviso = p => p.tipo === "frete" || p.st !== "futuro";
