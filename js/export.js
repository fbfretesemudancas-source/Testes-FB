// Exportação para planilha (CSV com ponto e vírgula e acentos corretos, abre direto no Excel e no Google Planilhas).
import { num, fmtD, pad } from "./utils.js";
import { STATUS_OS, PGTOS, label, osStatus, totals, addrText } from "./domain.js";

// Valor sem separador de milhar (1250,00): a planilha reconhece como número.
const money = v => num(v).toFixed(2).replace(".", ",");
const cel = v => { const s = String(v == null ? "" : v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const HEAD = ["Nº OS", "Data", "Hora início", "Hora término", "Situação", "Cliente", "Telefone", "Veículo", "Equipe", "Coleta", "Entrega",
  "Valor do frete", "Desconto", "Total", "Pago", "Restante", "Forma de pagamento", "Observações"];

/** Uma linha por OS, na mesma ordem recebida, mais uma linha de TOTAL (canceladas ficam de fora da soma). */
export function ordersToCsv(orders) {
  let tot = 0, pago = 0, res = 0;
  const lines = orders.map(o => {
    const T = totals(o), st = osStatus(o);
    if (st !== "cancelada") { tot += T.tot; pago += Math.min(num(o.pago), T.tot); res += T.res; }
    return [pad(o.num), fmtD(o.data), o.horaIni || "", o.horaFim || "", label(STATUS_OS, st), o.cliNome || "", o.cliTel || "", o.veiculo || "", o.equipe || "",
      addrText(o.col || {}), addrText(o.ent || {}), money(num(o.frete)), money(num(o.desconto)), money(T.tot), money(num(o.pago)), money(T.res),
      PGTOS.filter(p => o.pgto && o.pgto[p[0]]).map(p => p[1]).join(" + "), String(o.obs || "").replace(/\s*[\r\n]+\s*/g, " ")];
  });
  const total = HEAD.map(() => ""); total[5] = "TOTAL (sem canceladas)"; total[13] = money(tot); total[14] = money(pago); total[15] = money(res);
  return "\uFEFF" + [HEAD, ...lines, total].map(r => r.map(cel).join(";")).join("\r\n");
}
