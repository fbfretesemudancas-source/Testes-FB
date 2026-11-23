// Pagamento por funcionário em cada serviço (orçamento e OS).
// Lista os funcionários da equipe escolhida que são pagos POR FRETE, com o valor combinado da ficha (editável só neste serviço).
// Esse valor é o custo de mão de obra do orçamento (função "Motorista" ou as demais, como Ajudante) e o que aparece para pagar quando o frete termina.
// O registro guarda: rec.pagEq = [{ id, nome, funcao, valor }]
import { esc, num, money } from "../../js/utils.js";

const norm = s => String(s || "").trim().toLowerCase();
/** Funcionários da equipe que recebem por frete (desligados ficam de fora). */
export function equipeFrete(nomeEquipe, staff, teams) {
  const t = (teams || []).find(x => norm(x.nome) === norm(nomeEquipe));
  if (!t) return [];
  return (staff || []).filter(s => (t.membros || []).includes(s._id) && s.pagTipo === "frete" && s.situacao !== "desligado");
}
export const equipePagHTML = () => '<div id="eqPag" class="eqpag"></div>';

export function bindEquipePag(view, rec, { staff = [], teams = [], onChange = () => {} } = {}) {
  const box = view.querySelector("#eqPag"), memo = new Map(); // memo: valor digitado por pessoa, para não perder se trocar de equipe e voltar
  if (!box) return { sync() {} };
  const sel = () => view.querySelector('[data-k="equipe"]');
  const nomeEq = () => (sel() ? sel().value : rec.equipe) || "";
  const render = () => {
    const rows = rec.pagEq || [];
    const cab = '<small class="lb-lbl">Pagamento por funcionário neste frete (R$)</small>';
    if (!nomeEq()) { box.innerHTML = cab + '<p class="note">Escolha a equipe em “Agendamento” para ver os funcionários.</p>'; return; }
    if (!rows.length) { box.innerHTML = cab + '<p class="note">Nenhum funcionário desta equipe é pago por frete, então não há custo de mão de obra. Defina a forma de pagamento na ficha do funcionário (Funcionários).</p>'; return; }
    box.innerHTML = cab + `<div class="eqpag-grid">${rows.map((r, i) => `<label class="f"><span>${esc(r.nome)} <small>· ${esc(r.funcao || "sem função")}</small></span><input data-eq="${i}" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${esc(r.valor || "")}"></label>`).join("")}</div>
      <p class="note">Vem do valor por frete da ficha de cada um e pode mudar só neste serviço. Entra no custo do orçamento (Motorista no frete; as outras funções em “Ajudante”) e é o valor a pagar quando o frete terminar.</p>`;
  };
  /** Refaz a lista conforme a equipe: mantém o que você já editou, traz o valor da ficha para quem entrou e tira quem saiu. */
  function sync() {
    const antigo = new Map((rec.pagEq || []).map(r => [r.id, r]));
    const novo = equipeFrete(nomeEq(), staff, teams).map(s => {
      const a = antigo.get(s._id);
      return { id: s._id, nome: s.nome, funcao: s.funcao || "", valor: a ? a.valor : memo.has(s._id) ? memo.get(s._id) : (num(s.valorFrete) > 0 ? money(num(s.valorFrete)) : "") };
    });
    const mudou = JSON.stringify(novo) !== JSON.stringify(rec.pagEq || []);
    rec.pagEq = novo; render();
    if (mudou) onChange();
  }
  box.addEventListener("input", e => { const i = e.target.dataset && e.target.dataset.eq; if (i == null || !rec.pagEq[i]) return; rec.pagEq[i].valor = e.target.value; memo.set(rec.pagEq[i].id, e.target.value); onChange(); });
  box.addEventListener("change", e => {
    const i = e.target.dataset && e.target.dataset.eq; if (i == null || !rec.pagEq[i]) return;
    e.target.value = e.target.value.trim() ? money(num(e.target.value)) : ""; rec.pagEq[i].valor = e.target.value; memo.set(rec.pagEq[i].id, e.target.value); onChange();
  });
  view.addEventListener("change", e => { if (e.target.matches && e.target.matches('[data-k="equipe"]')) sync(); });
  return { sync };
}
