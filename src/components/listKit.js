// Barra de busca + filtros recolhíveis, igual em todas as listas.
//
//   searchBarHTML({ placeholder, filtersHTML, search })  → HTML da barra (filtersHTML vazio = sem botão "Filtros")
//   bindListBar(view, { onSearch, onClear, active, onApply }) → liga a barra e devolve { refresh, close }
//
// Regras:
//  • o painel de filtros começa recolhido; "Filtros (n)" mostra quantos filtros estão valendo
//  • "Limpar" só aparece quando há filtro ou busca ativa
//  • digitar já filtra; "Buscar" (ou Enter) confirma e recolhe o teclado no celular
//  • a página chama bar.refresh() no fim do seu draw() para atualizar contador e "Limpar"
import { icon } from "./icons.js";
import { btn } from "./ui.js";

export const searchBarHTML = ({ placeholder = "Buscar", filtersHTML = "", search = true, id = "q" } = {}) => `
  <div class="lbar${search ? "" : " nosearch"}">
    <div class="lbar-row">
      ${filtersHTML ? `<button class="btn lb-toggle" type="button" aria-expanded="false" aria-controls="${id}Panel">${icon("filter")}<span>Filtros</span><b class="lb-count" hidden></b><i class="lb-chev">${icon("chevronDown")}</i></button>` : ""}
      ${search ? `<label class="lb-search">${icon("search")}<input type="search" id="${id}" placeholder="${placeholder}" aria-label="Buscar" autocomplete="off"></label>
        ${btn({ label: "Buscar", ico: "search", kind: "dark", cls: "lb-go" })}` : '<span class="lb-fill"></span>'}
      ${btn({ label: "Limpar", ico: "x", cls: "lb-clear", attrs: "hidden" })}
    </div>
    ${filtersHTML ? `<div class="lb-panel" id="${id}Panel" hidden><div class="lb-title">Filtros avançados</div><div class="lb-grid">${filtersHTML}</div>
      <div class="lb-foot">${btn({ label: "Aplicar filtros", ico: "check", kind: "dark", cls: "lb-apply" })}</div></div>` : ""}
  </div>`;

/** Bloco de filtro com título pequeno (use dentro de filtersHTML). */
export const filterSec = (title, inner, cls = "") => `<div class="lb-sec ${cls}"><small class="lb-lbl">${title}</small>${inner}</div>`;

export function bindListBar(view, { onSearch = () => {}, onClear = () => {}, active = () => 0, onApply = () => {} } = {}) {
  const $ = s => view.querySelector(s);
  const input = $(".lb-search input"), panel = $(".lb-panel"), toggle = $(".lb-toggle"), clear = $(".lb-clear"), count = $(".lb-count");
  const setOpen = open => { if (!panel) return; panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); toggle.classList.toggle("open", open); };
  const refresh = () => {
    const n = active();
    if (count) { count.hidden = !n; count.textContent = n; toggle.classList.toggle("on", n > 0); }
    clear.hidden = !(n || (input && input.value.trim()));
  };
  const go = () => { if (input) { onSearch(input.value); input.blur(); } refresh(); };
  if (input) {
    input.addEventListener("input", () => onSearch(input.value));
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  }
  const goBtn = $(".lb-go"); if (goBtn) goBtn.addEventListener("click", go);
  if (toggle) toggle.addEventListener("click", () => setOpen(panel.hidden));
  const ap = $(".lb-apply"); if (ap) ap.addEventListener("click", () => { onApply(); setOpen(false); refresh(); });
  clear.addEventListener("click", () => { if (input) input.value = ""; onClear(); refresh(); });
  return { refresh, close: () => setOpen(false), open: () => setOpen(true), input };
}
