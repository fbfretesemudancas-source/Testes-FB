// Notificações: pagamentos pendentes, serviços de hoje e orçamentos vencidos.
import { pageHead } from "../components/pageHead.js";
import { getNotifs } from "../components/notifs.js";
import { esc, brl, pad, fmtD, numCurto } from "../../js/utils.js";

const iniciais = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

const item = (href, n, titulo, detalhe, valor = "") =>
  `<a class="row-item" href="${href}" style="text-decoration:none;color:inherit"><span class="n">${n}</span><div><b>${esc(titulo)}</b><small>${esc(detalhe)}</small></div><span class="v">${valor}</span></a>`;

export async function render(root) {
  root.innerHTML = pageHead("Notificações", "Avisos de agenda, pagamentos, funcionários e orçamentos") + '<p class="note">Carregando…</p>';
  const N = await getNotifs();
  const card = (titulo, lista) => lista.length ? `<div class="card"><h2>${titulo} (${lista.length})</h2><div class="row-list">${lista.join("")}</div></div>` : "";
  const html =
    card("Pagamentos pendentes", N.pagamentos.map(({ o, res }) => item("#/ordens?id=" + esc(o._id), numCurto(o.num), o.cliNome || "Sem nome", "OS concluída em " + fmtD(o.data) + " · ainda falta receber", brl(res)))) +
    card("Pagar funcionários", N.pagFunc.map(p => item("#/funcionarios?aba=pag", iniciais(p.nome), p.nome + " · " + p.titulo, p.tipo === "frete" ? "Serviço de " + fmtD(p.venc) + " · a pagar" : (p.st === "atrasado" ? "Venceu em " : p.st === "hoje" ? "Vence hoje, " : "Vence em ") + fmtD(p.venc), p.valor > 0 ? brl(p.valor) : "definir valor"))) +
    card("Checklist não iniciado (OS de hoje)", N.semChecklist.map(({ o }) => item("#/checklist?os=" + esc(o._id), numCurto(o.num), o.cliNome || "Sem nome", [o.veiculo, o.horaIni].filter(Boolean).join(" · ") || "Serviço de hoje sem checklist"))) +
    card("Serviços de hoje", N.hoje.map(({ o, pc }) => item("#/checklist?os=" + esc(o._id), numCurto(o.num), o.cliNome || "Sem nome", [o.veiculo, o.horaIni, "checklist " + pc + "%"].filter(Boolean).join(" · ")))) +
    card("Km de devolução pendente", N.devolucao.map(({ u }) => item(u.osId ? "#/checklist?os=" + esc(u.osId) : "#/frota?id=" + esc(u.veiculoId) + "&aba=usos", u.osNum ? numCurto(u.osNum) : "Uso", (u.veiculo || "Veículo") + (u.cliNome ? " · " + u.cliNome : ""), "Retirado em " + fmtD(u.data) + " com " + u.kmIni + " km · falta o km de devolução"))) +
    card("Orçamentos vencidos", N.orcamentos.map(({ o }) => item("#/orcamentos?id=" + esc(o._id), numCurto(o.num), o.cliNome || "Sem nome", "Validade em " + fmtD(o.validade) + " · sem resposta do cliente")));
  root.innerHTML = pageHead("Notificações", "Avisos de agenda, pagamentos, funcionários e orçamentos") +
    (html || '<div class="card"><h2>Tudo em dia</h2><p class="note">Nenhum pagamento pendente, funcionário a pagar, serviço de hoje em aberto ou orçamento vencido.</p></div>');
}
