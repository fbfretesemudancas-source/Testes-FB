// Dicas dos botões (data-tip): ficam CENTRALIZADAS no botão. Só quando a dica centralizada passaria da borda da tela
// (botão perto da lateral, ex.: Exportar) ela se alinha ao lado do botão, para não ser cortada nem criar barra de rolagem.
// O CSS (kit.css) trata data-tip-pos="end" (abre para a esquerda) e "start" (abre para a direita).
let probe = null;
function measure(text) { // largura que a dica vai ter (mesma fonte, padding e limite do CSS)
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;box-sizing:content-box;padding:5px 9px;font:600 12px/1.3 var(--f-body);width:max-content;max-width:min(240px,80vw);white-space:normal;";
    document.body.append(probe);
  }
  probe.textContent = text;
  return probe.getBoundingClientRect().width;
}
function place(el) {
  const text = el.getAttribute("data-tip"); if (!text) return;
  const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = measure(text), half = w / 2, mid = r.left + r.width / 2, pad = 8;
  el.dataset.tipPos = mid + half > vw - pad ? "end" : mid - half < pad ? "start" : "";
}
export function initTips() {
  if (initTips.done) return; initTips.done = true;
  const on = e => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) place(el); };
  document.addEventListener("mouseover", on, true);
  document.addEventListener("focusin", on, true);
}
