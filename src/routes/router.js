// Router por hash (#/rota) — funciona no Firebase Hosting sem configurar rewrites.
// Rotas protegidas só têm o código baixado (import dinâmico) DEPOIS da autenticação.
import { getCurrentUser, onAuthChange } from "../auth/authGuard.js";
import { renderShell } from "../components/shell.js";
import { initCombos } from "../components/combo.js";
import { initTips } from "../components/tips.js";

initCombos(); // autocomplete do site no lugar do balão nativo dos campos com <datalist>
initTips();   // dicas dos botões: centralizadas, e só se encostam na lateral quando a tela não comporta

const routes = {
  "/login":          { public: true, load: () => import("../auth/login.js") },
  // Fase 1 — Gestão básica
  "/painel":         { label: "Painel",                       load: () => import("../pages/dashboard.js") },
  "/clientes":       { label: "Clientes",                     load: () => import("../pages/clientes.js") },
  "/agenda":         { label: "Agenda",                       load: () => import("../pages/agenda.js") },
  "/orcamentos":     { label: "Orçamentos",                   load: () => import("../pages/orcamentos.js") },
  "/ordens":         { label: "Ordens de serviço",            load: () => import("../pages/ordens.js") },
  // Fase 2 — Gestão financeira
  "/financeiro":     { label: "Receitas e despesas",          load: () => import("../pages/financeiro.js") },
  "/contas":         { label: "Contas a receber e pagar",     load: () => import("../pages/contas.js") },
  "/fluxo-caixa":    { label: "Fluxo de caixa",               load: () => import("../pages/fluxoCaixa.js") },
  "/relatorios":     { label: "Relatórios financeiros",       load: () => import("../pages/relatorios.js") },
  // Fase 3 — Operação
  "/frota":          { label: "Frota",           load: () => import("../pages/frota.js") },
  "/checklist":      { label: "Checklist de mudanças",        load: () => import("../pages/checklist.js") },
  "/funcionarios":   { label: "Funcionários e equipes",       load: () => import("../pages/funcionarios.js") },
  "/acompanhamento": { label: "Acompanhamento dos serviços",  load: () => import("../pages/acompanhamento.js") },
  // Fase 4 — Automação
  "/assinatura":     { label: "Assinatura digital",           load: () => import("../pages/assinatura.js") },
  "/notificacoes":   { label: "Notificações",                 load: () => import("../pages/notificacoes.js") },
  "/area-cliente":   { label: "Área do cliente",              load: () => import("../pages/areaCliente.js") },
  // Fora das fases
  "/configuracoes":  { label: "Configurações",                load: () => import("../pages/configuracoes.js") }
};

// Organização do menu lateral (a ordem aqui é a ordem na tela).
const menu = [
  { title: "Gestão básica",      icon: "briefcase", paths: ["/painel", "/clientes", "/agenda", "/orcamentos", "/ordens"] },
  { title: "Gestão financeira",  icon: "bank",      paths: ["/financeiro", "/contas", "/fluxo-caixa", "/relatorios"] },
  { title: "Operação",           icon: "wrench",    paths: ["/frota", "/checklist", "/funcionarios", "/acompanhamento"] },
  { title: "Automação",          icon: "bolt",      paths: ["/assinatura", "/area-cliente"] } // Notificações e Configurações ficam nos ícones do cabeçalho
];
const toItem = path => ({ path, label: routes[path].label });
const navGroups = menu.map(g => ({ title: g.title, icon: g.icon, items: g.paths.map(toItem) }));

const DEFAULT_ROUTE = "/painel", LOGIN_ROUTE = "/login";
const root = document.getElementById("app");
let renderId = 0;

export function navigate(path) { if (location.hash !== "#" + path) location.hash = "#" + path; else resolve(); }

async function resolve() {
  const id = ++renderId; // descarta renderizações antigas se o usuário navegar rápido
  const path = (location.hash.slice(1).split("?")[0]) || DEFAULT_ROUTE;
  const route = routes[path];
  const user = await getCurrentUser();
  if (id !== renderId) return;

  if (!route) return navigate(user ? DEFAULT_ROUTE : LOGIN_ROUTE);
  // Guarda de rota: privada sem login → login; login já feito → painel.
  if (!route.public && !user) return navigate(LOGIN_ROUTE);
  if (route.public && user) return navigate(DEFAULT_ROUTE);

  try {
    const mod = await route.load();
    if (id !== renderId) return;
    if (route.public) { root.replaceChildren(); await mod.render(root); }
    else { const page = renderShell(root, { navGroups, currentPath: path, title: route.label, user }); await mod.render(page, { user }); }
  } catch (err) {
    console.error("Erro ao abrir a rota", path, err);
    root.innerHTML = '<div class="login-wrap"><div class="banner">Não foi possível carregar esta página. Atualize e tente de novo.</div></div>';
  }
}

window.addEventListener("hashchange", resolve);
onAuthChange(() => resolve()); // login/logout/sessão expirada: reavalia a rota atual
resolve();
