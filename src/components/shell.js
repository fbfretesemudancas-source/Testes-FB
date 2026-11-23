// Layout das áreas protegidas: menu lateral por fases + cabeçalho (aba atual, mês, data/hora, notificações, configurações, tema) + conteúdo.
import { esc } from "../../js/utils.js";
import { logout } from "../auth/logout.js";
import { effectiveTheme, toggleTheme } from "../../js/theme.js";
import { icon, PAGE_ICON } from "./icons.js";
import { getNotifs } from "./notifs.js";

const openGroups = new Set(["Gestão básica"]); // fases abertas (lembra entre navegações)

const link = (i, cur) => `<li><a href="#${i.path}" ${i.path === cur ? 'aria-current="page"' : ""}>${icon(PAGE_ICON[i.path] || "home")}<span>${esc(i.label)}</span></a></li>`;

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const p2 = n => String(n).padStart(2, "0");
const mesAno = d => `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const dataHora = d => `${DIAS[d.getDay()]}, ${p2(d.getDate())} de ${MESES[d.getMonth()].slice(0, 3)} de ${d.getFullYear()} • ${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** Desenha o shell e devolve o elemento onde a página será renderizada. */
export function renderShell(root, { navGroups, currentPath, title, user }) {
  let shell = root.querySelector(".shell");
  if (!shell) {
    root.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="logo"><img src="./assets/logo_lt.png" alt="FB Fretes e Mudanças"></div>
        <nav id="nav"></nav>
        <div class="who"><span id="whoEmail"></span><button class="btn" id="btnLogout" type="button">Sair</button></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="tb-ico tb-menu" id="btnMenu" type="button" aria-label="Abrir menu">${icon("menu")}</button>
          <div class="tb-page"><span id="tbIcon"></span><b id="tbTitle"></b></div>
          <span class="tb-sep">${icon("chevron")}</span>
          <span class="tb-month" id="tbMonth"></span>
          <div class="tb-right">
            <div class="tb-date">${icon("calendarGrid")}<span id="tbDate"></span></div>
            <span class="tb-div"></span>
            <a class="tb-ico" id="tbBell" href="#/notificacoes" title="Notificações" aria-label="Notificações">${icon("bell")}<span class="tb-badge" id="tbBadge" hidden></span></a>
            <a class="tb-ico" id="tbGear" href="#/configuracoes" title="Configurações" aria-label="Configurações">${icon("gear")}</a>
            <button class="tb-ico" id="btnTheme" type="button"></button>
          </div>
        </header>
        <main class="content"><div id="page"></div></main>
      </div>
    </div>`;
    shell = root.querySelector(".shell");
    shell.querySelector("#btnLogout").addEventListener("click", logout);
    const th = shell.querySelector("#btnTheme");
    const paintTheme = () => { // mostra o tema atual (lua = escuro, sol = claro); o clique troca
      const dark = effectiveTheme() === "dark";
      th.innerHTML = icon(dark ? "moon" : "sun");
      const t = dark ? "Mudar para o tema claro" : "Mudar para o tema escuro"; th.title = t; th.setAttribute("aria-label", t);
    };
    paintTheme(); th.addEventListener("click", () => { toggleTheme(); paintTheme(); });
    const tick = () => {
      if (!shell.isConnected) { clearInterval(timer); return; }
      const d = new Date();
      shell.querySelector("#tbDate").textContent = dataHora(d);
      shell.querySelector("#tbMonth").textContent = mesAno(d);
    };
    const timer = setInterval(tick, 20000); tick();
    shell.querySelector("#btnMenu").addEventListener("click", () => shell.classList.toggle("open"));
    shell.querySelector(".side").addEventListener("click", e => { if (e.target.closest("a")) shell.classList.remove("open"); });
    // 'toggle' não borbulha: captura para lembrar o que o usuário abriu/fechou.
    shell.querySelector("#nav").addEventListener("toggle", e => {
      const t = e.target.dataset.title; if (!t) return;
      e.target.open ? openGroups.add(t) : openGroups.delete(t);
    }, true);
  }
  shell.querySelector("#whoEmail").textContent = user.email || "";
  shell.querySelector("#nav").innerHTML = navGroups.map(g => {
    const hasCurrent = g.items.some(i => i.path === currentPath);
    return `<details data-title="${esc(g.title)}" ${hasCurrent || openGroups.has(g.title) ? "open" : ""}>
      <summary><span class="lbl">${icon(g.icon || "home")}${esc(g.title)}</span></summary><ul>${g.items.map(i => link(i, currentPath)).join("")}</ul></details>`;
  }).join("");
  // Cabeçalho: ícone + nome da aba atual; sino e engrenagem ficam em destaque nas suas páginas.
  shell.querySelector("#tbIcon").innerHTML = icon(PAGE_ICON[currentPath] || "home");
  shell.querySelector("#tbTitle").textContent = title || "";
  for (const [id, path] of [["#tbBell", "/notificacoes"], ["#tbGear", "/configuracoes"]]) {
    const a = shell.querySelector(id); currentPath === path ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  }
  // Número de avisos no sino (atualiza a cada troca de aba).
  getNotifs().then(N => {
    const b = shell.querySelector("#tbBadge"); if (!b) return;
    b.hidden = !N.total; b.textContent = N.total > 9 ? "9+" : String(N.total);
    shell.querySelector("#tbBell").title = N.total ? `Notificações (${N.total})` : "Notificações";
  });
  const page = shell.querySelector("#page");
  page.replaceChildren();
  return page;
}
