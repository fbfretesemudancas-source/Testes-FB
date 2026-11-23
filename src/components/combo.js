// Autocomplete próprio: troca o balão nativo do <datalist> por uma lista com a cara do site (tema claro e escuro).
// Uso nas telas: continua igual — <input list="x"> + <datalist id="x">. Este módulo enxerga o input sozinho
// (MutationObserver), tira o balão do navegador e liga a lista do site. O campo segue aceitando texto livre.
const norm = v => String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const MAX = 40;
let pop = null, cur = null, items = [], hi = -1, uid = 0;

function popup() {
  if (pop) return pop;
  pop = document.createElement("div"); pop.className = "combo-pop"; pop.setAttribute("role", "listbox"); pop.hidden = true; pop.id = "comboPop";
  pop.addEventListener("mousedown", e => { e.preventDefault(); const li = e.target.closest("[data-i]"); if (li) pick(Number(li.dataset.i)); }); // mousedown: não deixa o campo perder o foco antes
  pop.addEventListener("mousemove", e => { const li = e.target.closest("[data-i]"); if (li) mark(Number(li.dataset.i), false); });
  document.body.append(pop);
  window.addEventListener("resize", close); window.addEventListener("scroll", e => { if (cur && !(pop && pop.contains(e.target))) place(); }, true);
  return pop;
}
const optionsOf = inp => { const dl = inp._dl; return dl ? [...dl.options].map(o => o.value).filter(Boolean) : []; };
function place() {
  if (!cur || !pop) return;
  const r = cur.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 200 && r.top > below;
  pop.style.minWidth = r.width + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)) + "px";
  pop.style.maxHeight = Math.max(120, Math.min(280, (up ? r.top : below) - 14)) + "px";
  if (up) { pop.style.top = "auto"; pop.style.bottom = (window.innerHeight - r.top + 4) + "px"; } else { pop.style.bottom = "auto"; pop.style.top = (r.bottom + 4) + "px"; }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function mark(i, scroll = true) {
  hi = i; [...pop.children].forEach((li, k) => { li.classList.toggle("on", k === i); li.setAttribute("aria-selected", String(k === i)); });
  if (cur) { if (i >= 0) cur.setAttribute("aria-activedescendant", "cb" + i); else cur.removeAttribute("aria-activedescendant"); }
  if (scroll && pop.children[i]) pop.children[i].scrollIntoView({ block: "nearest" });
}
function open(inp) {
  const q = norm(inp.value).trim(), all = optionsOf(inp);
  items = all.filter(v => norm(v) !== q && (!q || norm(v).includes(q))).slice(0, MAX);
  if (!items.length) return close();
  cur = inp; popup();
  pop.innerHTML = items.map((v, i) => {
    const [main, ...rest] = v.split(" — "), sub = rest.join(" — "); // "Nome — telefone": o telefone vai em cinza
    const k = q ? norm(main).indexOf(q) : -1;
    const m = k >= 0 ? esc(main.slice(0, k)) + "<mark>" + esc(main.slice(k, k + q.length)) + "</mark>" + esc(main.slice(k + q.length)) : esc(main);
    return `<div role="option" id="cb${i}" data-i="${i}"><span class="cb-m">${m}</span>${sub ? `<small class="cb-s">${esc(sub)}</small>` : ""}</div>`;
  }).join("");
  pop.hidden = false; inp.setAttribute("aria-expanded", "true"); inp.setAttribute("aria-controls", "comboPop"); place(); mark(-1, false);
}
function close() { if (pop) pop.hidden = true; if (cur) { cur.setAttribute("aria-expanded", "false"); cur.removeAttribute("aria-activedescendant"); } cur = null; hi = -1; }
function pick(i) {
  const inp = cur, v = items[i]; if (!inp || v == null) return;
  inp.value = v; close();
  inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); // as telas escutam "input"
}

function enhance(inp) {
  if (inp._combo || inp.tagName !== "INPUT") return;
  const dl = document.getElementById(inp.getAttribute("list")); if (!dl) return;
  inp._combo = true; inp._dl = dl; inp.removeAttribute("list");
  inp.setAttribute("role", "combobox"); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-expanded", "false"); inp.setAttribute("autocomplete", "off");
  inp.addEventListener("focus", () => open(inp));
  inp.addEventListener("click", () => { if (cur !== inp) open(inp); });
  inp.addEventListener("input", () => open(inp));
  inp.addEventListener("blur", () => setTimeout(() => { if (cur === inp) close(); }, 120));
  inp.addEventListener("keydown", e => {
    const shown = pop && !pop.hidden && cur === inp;
    if (e.key === "ArrowDown") { e.preventDefault(); if (!shown) open(inp); else mark((hi + 1) % items.length); }
    else if (e.key === "ArrowUp" && shown) { e.preventDefault(); mark(hi <= 0 ? items.length - 1 : hi - 1); }
    else if (e.key === "Enter" && shown && hi >= 0) { e.preventDefault(); pick(hi); }
    else if (e.key === "Escape" && shown) { e.preventDefault(); close(); }
    else if (e.key === "Tab" && shown) close();
  });
}
const scan = root => (root.querySelectorAll ? root.querySelectorAll("input[list]") : []).forEach(enhance);

export function initCombos() {
  if (initCombos.done) return; initCombos.done = true;
  scan(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches("input[list]")) enhance(n); scan(n); } }))).observe(document.body, { childList: true, subtree: true });
}
