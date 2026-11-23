// Kit de botões: ícone + cor por finalidade, agrupados.
//   btn({ label, ico, kind, href, attrs, tip, sm, iconOnly })  → <button> ou <a class="btn">
//   group(...itens)   → conjunto de botões da mesma finalidade (grupos vizinhos ganham um divisor)
//   bar({ left, right }) → barra de ações da página (esquerda: criar; direita: exportar/voltar)
//   armBtn(botão)     → 1º toque pede confirmação ("Confirmar?"), 2º toque confirma. Devolve true no 2º.
// kind: pri (ação principal, vermelho) · dark (buscar/aplicar) · wa (WhatsApp, verde) · ok (pagamento/aprovar, verde-escuro)
//       danger (excluir, contorno vermelho) · "" (neutro)
import { icon } from "./icons.js";
import { esc } from "../../js/utils.js";

export function btn({ label = "", ico = "", kind = "", href = "", attrs = "", tip = "", sm = false, iconOnly = false, cls = "", type = "button" } = {}) {
  const c = ["btn", kind, sm ? "sm" : "", iconOnly ? "ico-only" : "", cls].filter(Boolean).join(" ");
  const inner = (ico ? icon(ico) : "") + (iconOnly ? "" : `<span>${label}</span>`);
  const name = tip || label;
  const a11y = iconOnly ? ` aria-label="${esc(name)}" data-tip="${esc(name)}"` : (tip ? ` data-tip="${esc(tip)}"` : "");
  return href
    ? `<a class="${c}" href="${href}"${attrs ? " " + attrs : ""}${a11y}>${inner}</a>`
    : `<button class="${c}" type="${type}"${attrs ? " " + attrs : ""}${a11y}>${inner}</button>`;
}
export const group = (...items) => { const h = items.flat().filter(Boolean).join(""); return h ? `<div class="bg">${h}</div>` : ""; };
export const bar = ({ left = [], right = [], cls = "" } = {}) =>
  `<div class="abar ${cls}"><div class="abar-l">${[].concat(left).join("")}</div><div class="abar-r">${[].concat(right).join("")}</div></div>`;

const armed = new WeakMap();
/** Botão de excluir em duas etapas. O 1º toque troca o rótulo por "Confirmar?" por 3,5 s. */
export function armBtn(b, text = "Confirmar?", ms = 3500) {
  if (armed.has(b)) { clearTimeout(armed.get(b).t); b.innerHTML = armed.get(b).html; b.classList.remove("armed"); armed.delete(b); return true; }
  const html = b.innerHTML;
  b.classList.add("armed"); b.innerHTML = icon("trash") + `<span>${esc(text)}</span>`;
  armed.set(b, { html, t: setTimeout(() => { if (b.isConnected) { b.innerHTML = html; b.classList.remove("armed"); } armed.delete(b); }, ms) });
  return false;
}
