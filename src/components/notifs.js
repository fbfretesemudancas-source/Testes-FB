// Avisos do sistema (o número do sino no cabeçalho e a página Notificações usam esta mesma lista).
//  · Pagamentos: OS concluída com valor ainda a receber
//  · Hoje: serviços de hoje ainda não finalizados, que já têm checklist (mostra o andamento)
//  · Sem checklist: serviços de hoje ainda não finalizados e sem checklist iniciado
//  · Devolução: usos de veículo compartilhado de dias anteriores sem o km de devolução
//  · Orçamentos: enviados e com a validade vencida
//  · Pagar funcionários: fretes concluídos a pagar e salários atrasados, que vencem hoje ou em até 2 dias
import { listAll } from "../firebase/db.js";
import { totals, osStatus } from "../../js/domain.js";
import { today } from "../../js/utils.js";
import { overall } from "./ckProgress.js";
import { semDevolucao } from "../../js/uso.js";
import { pendencias, paraAviso } from "../../js/pagfunc.js";

export async function getNotifs() {
  const out = { pagamentos: [], semChecklist: [], hoje: [], devolucao: [], orcamentos: [], pagFunc: [], total: 0 };
  try {
    const [orders, orcs, cks, usos, staff, teams, pagos] = await Promise.all([listAll("orders"), listAll("orcamentos"), listAll("checklists"), listAll("usos"), listAll("staff"), listAll("teams"), listAll("pagfunc")]);
    const ckBy = Object.fromEntries(cks.map(c => [c.osId, c]));
    const hoje = today();
    for (const o of orders) {
      const st = osStatus(o);
      if (st === "cancelada") continue;
      const T = totals(o);
      if (st === "concluida" && T.res > 0) out.pagamentos.push({ o, res: T.res });
      else if ((st === "aberta" || st === "andamento") && o.data === hoje) { const c = ckBy[o._id]; c ? out.hoje.push({ o, pc: overall(c) }) : out.semChecklist.push({ o }); }
    }
    out.devolucao = usos.filter(u => semDevolucao(u) && (u.data || "") < hoje).map(u => ({ u }));
    out.pagFunc = pendencias(staff, teams, orders, pagos, hoje).filter(paraAviso);
    out.orcamentos = orcs.filter(x => x.status === "aguardando" && x.validade && x.validade < hoje).map(o => ({ o }));
  } catch (e) { console.error("Notificações:", e); }
  out.total = out.pagamentos.length + out.semChecklist.length + out.hoje.length + out.devolucao.length + out.orcamentos.length + out.pagFunc.length;
  return out;
}
