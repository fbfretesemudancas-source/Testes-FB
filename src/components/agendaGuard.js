// Antes de salvar: avisa se outro serviço usa o mesmo horário com o mesmo veículo ou a mesma equipe.
import { listAll, getCfg } from "../firebase/db.js";
import { agendaEvents, conflictsOf, describeConflict } from "../../js/agenda.js";
import { num } from "../../js/utils.js";

/** true = pode salvar (sem conflito, ou você confirmou salvar mesmo assim). */
export async function confirmAgenda(cand) {
  if (!cand.date) return true;
  const [orders, orcs, cfg] = await Promise.all([listAll("orders"), listAll("orcamentos"), getCfg()]);
  const found = conflictsOf(cand, agendaEvents(orders, orcs, cfg), num(cfg.agenda && cfg.agenda.duracao) || 3);
  if (!found.length) return true;
  return window.confirm("Conflito de agenda: já existe serviço neste horário com o mesmo veículo ou a mesma equipe.\n\n" + found.map(describeConflict).join("\n") +
    "\n\nOK = salvar mesmo assim\nCancelar = voltar e ajustar horário, veículo ou equipe");
}
