// Funcionários e equipes: cadastro dos colaboradores, equipes (integrantes e responsável),
// serviços atribuídos, histórico de trabalhos e agenda de ocupação de cada equipe (dia e semana).
// Coleções: companies/{uid}/staff (funcionários) e companies/{uid}/teams (equipes).
// A OS e o orçamento guardam o NOME da equipe (campo "equipe"), por isso a agenda e os conflitos continuam iguais.
import { pageHead } from "../components/pageHead.js";
import { esc, toast, fmtD, pad, today, num, brl, money, numCurto } from "../../js/utils.js";
import { pendencias, PAG_TIPOS, mesLabel } from "../../js/pagfunc.js";
import { listAll, saveItem, removeItem, migrateTeams, getCfg } from "../firebase/db.js";
import { fillForm, bindForm, options } from "../components/formKit.js";
import { STATUS_OS, label, osStatus } from "../../js/domain.js";
import { agendaEvents, STATUS_AG, fmtMin, parseYmd, addDays, weekStart, layoutLanes } from "../../js/agenda.js";
import { btn, group, bar, armBtn } from "../components/ui.js";
import { searchBarHTML, filterSec, bindListBar } from "../components/listKit.js";

const SIT = [["ativo", "Ativo"], ["ferias", "Férias"], ["afastado", "Afastado"], ["desligado", "Desligado"]];
const BADGE = { ativo: "concluida", ferias: "aguardando", afastado: "aguardando", desligado: "cancelada" };
// Cargos sugeridos (pode digitar outro). Quem dirige deve ter "Motorista" no cargo: é assim que o orçamento separa o motorista dos ajudantes.
const FUNCOES = ["Dono", "Dona", "Dono e motorista", "Dona e motorista", "Sócio", "Sócia", "Gerente", "Supervisor", "Chefe de equipe",
  "Motorista", "Ajudante", "Montador", "Embalador", "Atendente", "Auxiliar administrativo", "Financeiro", "Comercial / vendas", "Estagiário"];
const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
const TABS = [["func", "Funcionários"], ["eq", "Equipes"], ["pag", "Pagamentos"]];
const blankStaff = () => ({ nome: "", tel: "", funcao: "", contratacao: "", situacao: "ativo", obs: "", pagTipo: "", salario: "", diaPag: "5", valorFrete: "", pagDesde: "" });
const blankTeam = () => ({ nome: "", responsavelId: "", membros: [], ativo: true, obs: "" });
const norm = s => String(s || "").trim().toLowerCase();
const byNome = (a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR");
const sit = s => s.situacao || "ativo";
const sitLabel = k => (SIT.find(x => x[0] === k) || [k, k])[1];
const badge = s => `<span class="badge ${BADGE[sit(s)] || ""}">${esc(sitLabel(sit(s)))}</span>`;
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const pagTxt = s => s.pagTipo === "mensal" && num(s.salario) > 0 ? " · Salário " + brl(num(s.salario)) : s.pagTipo === "frete" ? (num(s.valorFrete) > 0 ? " · " + brl(num(s.valorFrete)) + " por frete (padrão)" : " · por frete (valor no orçamento)") : "";
const aberta = o => ["aberta", "andamento"].includes(osStatus(o));


const CSS = `
.sch-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.sch-bar .sp{flex:1}
.sch-bar button,.sch-bar input{height:40px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--fg);font:600 14px var(--f-body);padding:0 12px;cursor:pointer}
.sch-bar button[aria-pressed="true"]{background:var(--red);border-color:var(--red);color:var(--red-fg)}
.sch-scroll{overflow-x:auto}.sch-in{min-width:680px}
.sch-head{position:relative;height:20px;margin-left:158px;font-size:11px;color:var(--mut)}.sch-head span{position:absolute;transform:translateX(-50%)}
.sch-row{display:flex;border-top:1px solid var(--line)}
.sch-lbl{width:158px;flex:none;padding:8px 10px 8px 0;font-size:14px;box-sizing:border-box}.sch-lbl b{display:block}.sch-lbl small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.sch-track{position:relative;flex:1;min-width:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(var(--hw) - 1px),var(--line) calc(var(--hw) - 1px),var(--line) var(--hw))}
.sch-ev,.sch-chip{box-sizing:border-box;background:var(--c);color:var(--t);text-decoration:none;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.sch-ev{position:absolute;height:28px;border-radius:6px;padding:0 7px;font-size:12px;line-height:28px}
.sch-chip{border-radius:6px;padding:3px 7px;font-size:12px;margin:0 0 4px}
.sch-ev.conf,.sch-chip.conf{outline:2px dashed var(--fg);outline-offset:-2px}
.sch-st-agendado{--c:#2563eb;--t:#fff}.sch-st-aguardando{--c:#f5b301;--t:#2b2000}.sch-st-concluido{--c:#16a34a;--t:#fff;opacity:.75}
.sch-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--mut);margin:0 0 10px}.sch-leg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px;background:var(--c)}
.sch-week{width:100%;min-width:720px;border-collapse:collapse;table-layout:fixed}
.sch-week th,.sch-week td{border-top:1px solid var(--line);padding:6px;vertical-align:top;font-size:13px;text-align:left}
.sch-week thead th{border-top:0;font-size:12px;color:var(--mut)}.sch-week th.lb{width:120px}
.sch-week .today{background:color-mix(in srgb,var(--red) 8%,transparent)}
.sch-week th button{all:unset;cursor:pointer;font-weight:700;color:inherit}
.sch-free{color:var(--mut);font-size:12px}
`;
const injectCss = () => { if (document.getElementById("schCss")) return; const st = document.createElement("style"); st.id = "schCss"; st.textContent = CSS; document.head.append(st); };

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  const q = params();
  try { await (q.has("id") || q.has("novo") ? fichaStaff(view) : q.has("equipe") || q.has("novaequipe") ? fichaTeam(view) : screen(view, q)); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Funcionários e equipes") + '<div class="banner">Não foi possível carregar os dados. Confira a conexão e as regras do Firestore.</div>'; }
}

async function screen(view, q) {
  injectCss();
  const cfg = await getCfg();
  const criadas = await migrateTeams(blankTeam); // equipes que estavam em Configurações viram cadastros
  let staff = [], teams = [], orders = [], orcs = [], pagos = [];
  const reload = async () => { [staff, teams, orders, orcs, pagos] = await Promise.all([listAll("staff", true), listAll("teams", true), listAll("orders", true), listAll("orcamentos", true), listAll("pagfunc", true)]); staff.sort(byNome); teams.sort(byNome); };
  await reload();

  let tab = TABS.some(t => t[0] === q.get("aba")) ? q.get("aba") : "func", busca = "", schedDay = today(), schedMode = "dia", payDate = today(); const openHist = new Set();
  const sName = id => (staff.find(x => x._id === id) || {}).nome || "(removido)";
  const activeTeams = () => teams.filter(t => t.ativo !== false);
  const teamsOf = sid => teams.filter(t => (t.membros || []).includes(sid));
  const free = () => staff.filter(s => sit(s) === "ativo" && !activeTeams().some(t => (t.membros || []).includes(s._id)));
  const osOf = t => orders.filter(o => o.equipe && norm(o.equipe) === norm(t.nome));

  view.innerHTML = pageHead("Funcionários e equipes", "Colaboradores, equipes, serviços atribuídos e histórico") +
    (criadas ? `<div class="banner">Importei ${criadas} equipe(s) que estavam em Configurações. Abra cada equipe para escolher o responsável e os integrantes.</div>` : "") +
    `<div id="kpis"></div><div class="cfgtabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
    <section data-panel="func">${bar({ left: [btn({ label: "Novo funcionário", ico: "plus", kind: "pri", href: "#/funcionarios?novo=1" })] })}${searchBarHTML({ placeholder: "Buscar por nome, função ou telefone" })}<div class="hist" id="sList"></div></section>
    <section data-panel="eq" hidden>${bar({ left: [btn({ label: "Nova equipe", ico: "plus", kind: "pri", href: "#/funcionarios?novaequipe=1" })] })}<div id="sched"></div><div id="avail"></div><div id="tList"></div></section>
    <section data-panel="pag" hidden>${searchBarHTML({ id: "qPag", placeholder: "Buscar por funcionário ou serviço", filtersHTML: filterSec("Tipo de pagamento", `<div class="chips" id="pagChips">${[["", "Todos"], ["mensal", "Salário mensal"], ["frete", "Por frete"]].map(([k, l]) => `<button class="chip" type="button" data-pt="${k}" aria-pressed="${k === ""}">${l}</button>`).join("")}</div>`) })}<div id="pagBox"></div></section>`;
  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];

  /* ---------- desenho ---------- */
  const drawKpis = () => {
    const nomes = new Set(activeTeams().map(t => norm(t.nome)));
    const abertos = orders.filter(o => o.equipe && nomes.has(norm(o.equipe)) && aberta(o)).length;
    $("#kpis").innerHTML = `<div class="kpis"><div class="kpi big"><small>Funcionários ativos</small><b>${staff.filter(s => sit(s) === "ativo").length}</b><em>${staff.length} cadastrados</em></div>
      <div class="kpi"><small>Equipes ativas</small><b>${activeTeams().length}</b></div>
      <div class="kpi"><small>Disponíveis (sem equipe)</small><b>${free().length}</b></div>
      <div class="kpi"><small>Serviços em aberto</small><b>${abertos}</b><em>OS abertas ou em andamento</em></div></div>`;
  };
  const drawSList = () => {
    const t = norm(busca), rows = staff.filter(s => !t || norm([s.nome, s.funcao, s.tel].join(" ")).includes(t));
    $("#sList").innerHTML = rows.map(s => {
      const eq = teamsOf(s._id).map(x => x.nome);
      return `<div class="h"><div class="n" style="font-size:16px">${esc(initials(s.nome))}</div>
        <div class="t"><b>${esc(s.nome)}</b><small>${[s.funcao && esc(s.funcao), s.tel && esc(s.tel), s.contratacao && "contratado em " + fmtD(s.contratacao)].filter(Boolean).join(" · ")}${s.funcao || s.tel || s.contratacao ? " · " : ""}${badge(s)}${eq.length ? " · Equipe: " + esc(eq.join(", ")) : ""}${pagTxt(s)}</small></div>
        <div class="v"></div><div class="b">${btn({ label: "Editar", ico: "pen", sm: true, href: "#/funcionarios?id=" + esc(s._id) })}</div></div>`;
    }).join("") || `<div class="card note">${staff.length ? "Nenhum funcionário encontrado." : "Nenhum funcionário cadastrado. Toque em “+ Novo funcionário”."}</div>`;
  };
  const drawAvail = () => {
    const f = free();
    $("#avail").innerHTML = `<div class="card"><h2>Funcionários disponíveis</h2>${f.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${f.map(s => `<span class="badge">${esc(s.nome)}${s.funcao ? " · " + esc(s.funcao) : ""}</span>`).join("")}</div><p class="note" style="margin-top:8px">Ativos que ainda não estão em nenhuma equipe.</p>`
      : `<p class="note">${staff.length ? "Todos os funcionários ativos já estão em alguma equipe." : "Cadastre funcionários na aba Funcionários para montar as equipes."}</p>`}</div>`;
  };
  const osLine = o => `<div><a href="#/ordens?id=${esc(o._id)}" style="color:inherit;text-decoration:none">${esc(fmtD(o.data))} · <b>OS ${numCurto(o.num)}</b> · ${esc(o.cliNome || "Sem nome")}${o.veiculo ? " · " + esc(o.veiculo) : ""} <span class="badge ${osStatus(o)}">${label(STATUS_OS, osStatus(o))}</span></a></div>`;
  const drawTList = () => {
    $("#tList").innerHTML = teams.map(t => {
      const all = osOf(t).sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))), open = all.filter(aberta).sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")));
      const mem = (t.membros || []).map(id => staff.find(x => x._id === id)).filter(Boolean);
      return `<div class="card"><h2>${esc(t.nome || "Sem nome")}${t.ativo === false ? " (inativa)" : ""}</h2>
        <p style="margin:0 0 6px"><b>Responsável:</b> ${t.responsavelId ? esc(sName(t.responsavelId)) : '<span class="note">não definido</span>'}</p>
        <p style="margin:0 0 6px"><b>Integrantes (${mem.length}):</b> ${mem.length ? mem.map(s => `<span class="badge">${esc(s.nome)}${s.funcao ? " · " + esc(s.funcao) : ""}</span>`).join(" ") : '<span class="note">nenhum</span>'}</p>
        <p style="margin:0 0 4px"><b>Serviços atribuídos:</b> ${open.length ? open.length + " em aberto" : '<span class="note">nenhum em aberto</span>'}</p>
        ${open.length ? `<div class="used">${open.slice(0, 5).map(osLine).join("")}${open.length > 5 ? `<div><small>… e mais ${open.length - 5}</small></div>` : ""}</div>` : ""}
        ${t.obs ? `<p class="note" style="margin-top:8px">${esc(t.obs)}</p>` : ""}
        <div class="abar" style="margin:10px 0 0"><div class="abar-l">${group(btn({ label: "Editar", ico: "pen", sm: true, href: "#/funcionarios?equipe=" + esc(t._id) }), btn({ label: openHist.has(t._id) ? "Ocultar histórico" : "Histórico de trabalhos (" + all.length + ")", ico: "clock", sm: true, attrs: 'data-a="t-hist" data-id="' + esc(t._id) + '"' }))}</div></div>
        ${openHist.has(t._id) ? `<div class="used">${all.slice(0, 20).map(osLine).join("") || "<div><small>Nenhum serviço registrado para esta equipe.</small></div>"}${all.length > 20 ? `<div><small>Mostrando os 20 mais recentes de ${all.length}.</small></div>` : ""}</div>` : ""}</div>`;
    }).join("") || '<div class="card note">Nenhuma equipe cadastrada. Toque em “+ Nova equipe”. Trabalhando sozinho, crie uma equipe com o seu nome.</div>';
  };
  /* ---------- agenda das equipes: quem está ocupado em cada dia e horário (mesma regra da Agenda) ---------- */
  const WORK = [420, 1140]; // 07:00–19:00: janela usada para dizer quando a equipe está livre
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dayLabel = d => { const t = parseYmd(d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const sevs = () => agendaEvents(orders, orcs, cfg).filter(e => e.status !== "cancelado"); // cancelado não ocupa
  const isAct = e => e.status === "agendado" || e.status === "aguardando";
  const clash = (a, b) => a.key !== b.key && isAct(a) && isAct(b) && (a.allDay || b.allDay || (a.s < b.e && b.s < a.e));
  const evTitle = e => `${e.nome} · ${e.cliente || "sem nome"} · ${e.allDay ? "dia inteiro" : fmtMin(e.s) + "–" + fmtMin(e.e)} · ${STATUS_AG[e.status]}${e.rota ? " · " + e.rota : ""}`;
  const schedRows = list => { // equipes ativas + nomes que aparecem em serviços mas não estão cadastrados (inclui "sem equipe")
    const m = new Map(); activeTeams().forEach(t => m.set(norm(t.nome), { nome: t.nome, extra: false }));
    list.forEach(e => { const k = norm(e.equipe); if (!m.has(k)) m.set(k, { nome: e.equipe || "Sem equipe definida", extra: true }); });
    return [...m.entries()].map(([k, r]) => ({ ...r, evs: list.filter(e => norm(e.equipe) === k) })).sort((a, b) => Number(a.extra) - Number(b.extra) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  };
  const freeInfo = evs => { // { txt, busy }: quando a equipe tem folga de pelo menos 1h entre 07:00 e 19:00
    if (!evs.length) return { txt: "Livre o dia todo", busy: false };
    if (evs.some(e => e.allDay)) return { txt: "Ocupada o dia todo", busy: true };
    const iv = evs.map(e => [Math.max(e.s, WORK[0]), Math.min(e.e, WORK[1])]).filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]), free = []; let cur = WORK[0];
    for (const [a, b] of iv) { if (a - cur >= 60) free.push([cur, a]); cur = Math.max(cur, b); }
    if (WORK[1] - cur >= 60) free.push([cur, WORK[1]]);
    return { txt: free.length ? "Livre: " + free.map(([a, b]) => fmtMin(a) + "–" + fmtMin(b)).join(", ") : "Sem folga de 1h (07h–19h)", busy: true };
  };
  const dayView = () => {
    const list = sevs().filter(e => e.date === schedDay), rows = schedRows(list), timed = list.filter(e => !e.allDay);
    const S = Math.max(0, Math.min(7, ...timed.map(e => Math.floor(e.s / 60)))), E = Math.min(24, Math.max(19, ...timed.map(e => Math.ceil(e.e / 60)))), H = E - S, step = H > 12 ? 2 : 1;
    const ticks = []; for (let h = S; h <= E; h += step) ticks.push(`<span style="left:${(h - S) / H * 100}%;${h >= E ? "transform:translateX(-100%)" : ""}">${String(h).padStart(2, "0")}h</span>`);
    const ocup = rows.filter(r => r.evs.some(isAct) || freeInfo(r.evs).busy).length;
    return `<p class="note" style="margin:0 0 8px"><b>${esc(dayLabel(schedDay))}</b> · ${ocup} de ${rows.length} equipe(s) com serviço neste dia</p>
      <div class="sch-scroll"><div class="sch-in"><div class="sch-head">${ticks.join("")}</div>${rows.map(r => {
        const lanes = layoutLanes(r.evs), L = Math.max(1, ...lanes.map(e => e.lanes || 1)), fi = freeInfo(r.evs);
        return `<div class="sch-row"><div class="sch-lbl"><b>${esc(r.nome)}</b><small style="${fi.busy ? "" : "color:var(--ok)"}">${esc(fi.txt)}</small>${r.extra ? '<small>não cadastrada</small>' : ""}</div>
          <div class="sch-track" style="height:${L * 34 + 6}px;--hw:${100 / H}%">${lanes.map(e => {
            const a = Math.max(e.s, S * 60), b = Math.min(e.e, E * 60), left = (a - S * 60) / (H * 60) * 100, w = Math.max(1.5, (b - a) / (H * 60) * 100);
            return `<a class="sch-ev sch-st-${e.status}${r.evs.some(o => clash(o, e)) ? " conf" : ""}" href="${esc(e.href)}" title="${esc(evTitle(e))}" style="left:${left}%;width:${w}%;top:${(e.lane || 0) * 34 + 3}px">${e.allDay ? "Dia inteiro" : fmtMin(e.s) + "–" + fmtMin(e.e)} · ${esc(e.cliente || e.nome)}</a>`;
          }).join("")}</div></div>`;
      }).join("") || '<p class="note">Nenhuma equipe cadastrada.</p>'}</div></div>`;
  };
  const weekView = () => {
    const ws = weekStart(schedDay), days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)), hoje = today();
    const list = sevs().filter(e => e.date >= days[0] && e.date <= days[6]), rows = schedRows(list);
    return `<div class="sch-scroll"><table class="sch-week"><thead><tr><th class="lb">Equipe</th>${days.map((d, i) => `<th class="${d === hoje ? "today" : ""}"><button type="button" data-a="sch-day" data-d="${d}" title="Ver este dia">${DOW[i]} ${d.slice(8)}/${d.slice(5, 7)}</button></th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr><th class="lb" scope="row">${esc(r.nome)}${r.extra ? '<br><small class="sch-free">não cadastrada</small>' : ""}</th>${days.map(d => {
        const ev = r.evs.filter(e => e.date === d).sort((a, b) => a.s - b.s);
        return `<td class="${d === hoje ? "today" : ""}">${ev.map(e => `<a class="sch-chip sch-st-${e.status}${r.evs.some(o => clash(o, e)) ? " conf" : ""}" href="${esc(e.href)}" title="${esc(evTitle(e))}">${e.allDay ? "Dia inteiro" : fmtMin(e.s)} · ${esc(e.cliente || e.nome)}</a>`).join("") || '<span class="sch-free">livre</span>'}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`;
  };
  const drawSched = () => {
    const box = $("#sched"); if (!box) return;
    box.innerHTML = `<div class="card"><h2>Agenda das equipes</h2>
      <div class="sch-bar"><button type="button" data-a="sch-prev" aria-label="Anterior">‹</button><input type="date" id="schDate" value="${schedDay}" aria-label="Dia"><button type="button" data-a="sch-next" aria-label="Próximo">›</button><button type="button" data-a="sch-today">Hoje</button><span class="sp"></span>
        <button type="button" data-a="sch-mode" data-m="dia" aria-pressed="${schedMode === "dia"}">Dia</button><button type="button" data-a="sch-mode" data-m="semana" aria-pressed="${schedMode === "semana"}">Semana</button></div>
      <div class="sch-leg"><span class="sch-st-agendado"><i></i>Agendado</span><span class="sch-st-aguardando"><i></i>Orçamento aguardando (segura o horário)</span><span class="sch-st-concluido"><i></i>Concluído</span><span>Contorno tracejado = choque de horário na mesma equipe</span></div>
      ${schedMode === "dia" ? dayView() : weekView()}</div>`;
  };
  /* ---------- pagamentos: pendentes (salário mensal e fretes) e histórico ---------- */
  let pagBusca = "", pagTipoF = "", lbPag = null; // filtros da lista de pagamentos
  const pend = () => pendencias(staff, teams, orders, pagos);
  const pagMatch = x => (!pagTipoF || x.tipo === pagTipoF) && (!pagBusca.trim() || norm([x.nome, x.titulo].join(" ")).includes(norm(pagBusca)));
  const drawPag = () => {
    const box = $("#pagBox"); if (!box) return;
    const P = pend().filter(pagMatch), semForma = staff.filter(s => sit(s) !== "desligado" && !s.pagTipo).length, tot = P.reduce((x, p) => x + p.valor, 0);
    const stTxt = p => p.tipo === "frete" ? "A pagar" : { atrasado: "Atrasado", hoje: "Vence hoje", breve: "Vence em breve", futuro: "A vencer" }[p.st];
    const stCls = p => p.st === "atrasado" ? "cancelada" : (p.st === "futuro" ? "" : "aguardando");
    const hist = pagos.filter(r => !pagBusca.trim() || norm([r.nome, r.titulo].join(" ")).includes(norm(pagBusca))).sort((a, b) => String(b.dataPago || "").localeCompare(String(a.dataPago || ""))).slice(0, 30);
    box.innerHTML = `<div class="card"><h2>Pagamentos pendentes (${P.length})</h2>
      <div class="row"><label class="f"><span>Data do pagamento</span><input type="date" id="payDate" value="${esc(payDate)}"></label><span></span></div>
      <p class="note" style="margin:-4px 0 10px">Ao tocar em “Pagar”, o valor entra em <b>Despesas</b> do Painel nesta data. Dá para ajustar o valor antes de pagar.</p>
      ${P.length ? `<p style="margin:0 0 8px"><b>Total a pagar:</b> ${brl(tot)}</p><div class="hist">${P.map(p => `<div class="h"><div class="n" style="font-size:16px">${esc(initials(p.nome))}</div>
        <div class="t"><b>${esc(p.nome)} · ${esc(p.titulo)}</b><small>${p.tipo === "mensal" ? "Vence em " + fmtD(p.venc) : "Serviço de " + fmtD(p.venc)} · <span class="badge ${stCls(p)}">${stTxt(p)}</span>${p.tipo === "frete" ? (p.semValor ? " · informe o valor" : p.origem === "os" ? " · valor definido na OS" : " · valor padrão da ficha") : ""}</small></div>
        <div class="v"><input data-pv="${esc(p.chave)}" value="${p.valor > 0 ? esc(money(p.valor)) : ""}" placeholder="0,00" inputmode="decimal" aria-label="Valor a pagar" style="width:96px;text-align:right;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--fg);padding:0 8px"></div>
        <div class="b">${btn({ label: "Pagar", ico: "dollar", kind: "ok", sm: true, attrs: 'data-a="pay" data-ch="' + esc(p.chave) + '"' })}</div></div>`).join("")}</div>`
        : `<p class="note">Nada pendente. ${staff.some(s => s.pagTipo) ? "" : "Defina a forma de pagamento (salário mensal ou por frete) na ficha de cada funcionário."}</p>`}
      ${semForma && staff.some(s => s.pagTipo) ? `<p class="note" style="margin-top:8px">${semForma} funcionário(s) ativo(s) ainda sem forma de pagamento definida.</p>` : ""}</div>
      <div class="card"><h2>Pagamentos feitos</h2>${hist.length ? `<div class="hist">${hist.map(r => `<div class="h"><div class="n" style="font-size:16px">${esc(initials(r.nome))}</div>
        <div class="t"><b>${esc(r.nome)} · ${esc(r.titulo || "")}</b><small>Pago em ${fmtD(r.dataPago)}</small></div><div class="v">${brl(num(r.valor))}</div>
        <div class="b">${btn({ label: "Desfazer", ico: "trash", kind: "danger", sm: true, attrs: 'data-a="unpay" data-id="' + esc(r._id) + '"' })}</div></div>`).join("")}</div>` : `<p class="note">${pagos.length ? "Nenhum pagamento encontrado nesta busca." : "Nenhum pagamento registrado ainda."}</p>`}</div>`;
    if (lbPag) lbPag.refresh();
  };
  const drawAll = () => { drawKpis(); drawSList(); drawSched(); drawAvail(); drawTList(); drawPag(); };
  const show = id => { tab = id; $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== id; }); $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id))); };
  const armDelete = b => armBtn(b); // 1º toque pede confirmação, 2º exclui


  /* ---------- ações ---------- */
  // cada barra de busca é ligada só dentro da sua própria aba (há duas telas com busca aqui)
  const lb = bindListBar($('[data-panel="func"]'), { onSearch: t => { busca = t; drawSList(); lb.refresh(); }, onClear: () => { busca = ""; drawSList(); }, active: () => 0 });
  lbPag = bindListBar($('[data-panel="pag"]'), { onSearch: t => { pagBusca = t; drawPag(); }, active: () => (pagTipoF ? 1 : 0), onApply: drawPag,
    onClear: () => { pagBusca = ""; pagTipoF = ""; view.querySelectorAll("#pagChips .chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.pt === ""))); drawPag(); } });
  $("#pagChips").addEventListener("click", e => {
    const c = e.target.closest("[data-pt]"); if (!c) return; pagTipoF = c.dataset.pt;
    view.querySelectorAll("#pagChips .chip").forEach(x => x.setAttribute("aria-pressed", String(x === c))); drawPag();
  });
  view.addEventListener("change", e => {
    if (e.target.id === "schDate" && e.target.value) { schedDay = e.target.value; drawSched(); }
    if (e.target.id === "payDate" && e.target.value) payDate = e.target.value;
  });
  view.addEventListener("click", async e => {
    const tb = e.target.closest("[data-tab]"); if (tb) return show(tb.dataset.tab);
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a, id = b.dataset.id;
    try {
      if (a === "sch-prev" || a === "sch-next") { schedDay = addDays(schedDay, (a === "sch-prev" ? -1 : 1) * (schedMode === "semana" ? 7 : 1)); return drawSched(); }
      if (a === "sch-today") { schedDay = today(); return drawSched(); }
      if (a === "sch-mode") { schedMode = b.dataset.m; return drawSched(); }
      if (a === "sch-day") { schedDay = b.dataset.d; schedMode = "dia"; return drawSched(); }
      if (a === "t-hist") { openHist.has(id) ? openHist.delete(id) : openHist.add(id); return drawTList(); }

      if (a === "pay") {
        const p = pend().find(x => x.chave === b.dataset.ch); if (!p) return;
        const inp = [...view.querySelectorAll("[data-pv]")].find(i => i.dataset.pv === p.chave), v = num(inp ? inp.value : p.valor);
        if (v <= 0) { toast("Informe o valor a pagar."); return; }
        b.disabled = true;
        const data = payDate || today(), dsp = await saveItem("despesas", { tipo: p.tipo === "mensal" ? "salario" : "pagamento_frete", data, valor: money(v), descricao: p.titulo + " · " + p.nome, funcionarioId: p.staffId, funcionario: p.nome });
        await saveItem("pagfunc", { chave: p.chave, staffId: p.staffId, nome: p.nome, tipo: p.tipo, ref: p.ref || "", osId: p.osId || "", osNum: p.osNum || "", titulo: p.titulo, venc: p.venc, valor: money(v), dataPago: data, despId: dsp._id });
        await reload(); drawPag(); toast("Pagamento registrado e lançado nas despesas");
      }
      if (a === "unpay") {
        if (!armDelete(b)) return;
        const r = pagos.find(x => x._id === id);
        if (r) { if (r.despId) await removeItem("despesas", r.despId); await removeItem("pagfunc", id); }
        await reload(); drawPag(); toast("Pagamento desfeito: voltou para a lista de pendentes");
      }
    } catch (err) { console.error(err); toast("Não foi possível concluir a ação."); }
  });
  drawAll();
  show(tab);
}

/* ============ FICHA DO FUNCIONÁRIO: #/funcionarios?novo=1 ou ?id=ID (página própria, como a ficha do veículo) ============ */
async function fichaStaff(view) {
  const q = params(), id = q.get("id") || "";
  const [staff, teams] = await Promise.all([listAll("staff", true), listAll("teams", true)]);
  const rec = id ? staff.find(x => x._id === id) : null;
  const voltar = btn({ label: "Voltar aos funcionários", ico: "arrowLeft", href: "#/funcionarios" });
  if (id && !rec) { view.innerHTML = pageHead("Funcionário") + '<div class="banner">Funcionário não encontrado.</div>' + bar({ left: [voltar] }); return; }
  const E = { ...blankStaff(), ...(rec || {}) };
  view.innerHTML = pageHead(id ? (E.nome || "Funcionário") : "Novo funcionário", id ? "Ficha do funcionário" : "Preencha os dados e salve") +
    bar({ left: [group(btn({ label: "Salvar", ico: "save", kind: "pri", cls: "js-save" })), '<span class="dirty" id="dirty" hidden>● Alterações não salvas</span>'],
      right: [id && btn({ label: "Excluir funcionário", ico: "trash", kind: "danger", cls: "js-del" }), voltar].filter(Boolean) }) +
    '<div class="card" id="fCard"></div>';
  const $ = s => view.querySelector(s), dirty = () => { $("#dirty").hidden = false; };
  const draw = () => {
    $("#fCard").innerHTML = `<h2>Dados do funcionário</h2>
      <div class="row"><label class="f"><span>Nome</span><input data-k="nome" autocomplete="off"></label><label class="f"><span>Telefone</span><input data-k="tel" data-mask="tel" inputmode="tel" placeholder="(81) 90000-0000"></label></div>
      <div class="row"><label class="f"><span>Cargo / função</span><input data-k="funcao" list="dlFuncao" placeholder="Ex.: Motorista" autocomplete="off"><datalist id="dlFuncao">${FUNCOES.map(f => `<option value="${esc(f)}">`).join("")}</datalist></label>
        <label class="f"><span>Data de contratação</span><input type="date" data-k="contratacao"></label></div>
      <p class="note" style="margin:-4px 0 10px">Quem dirige o veículo deve ter “Motorista” no cargo (ex.: “Dono e motorista”): é assim que o orçamento separa o motorista dos ajudantes. Todos que fazem parte da empresa ficam aqui, qualquer que seja o cargo.</p>
      <div class="row"><label class="f"><span>Situação</span><select data-k="situacao">${options(SIT)}</select></label>
        <label class="f"><span>Forma de pagamento</span><select data-k="pagTipo">${options(PAG_TIPOS)}</select></label></div>
      ${E.pagTipo === "mensal" ? `<div class="row"><label class="f"><span>Salário mensal (R$)</span><input data-k="salario" data-money inputmode="decimal" placeholder="0,00"></label><label class="f"><span>Dia do pagamento (1 a 28)</span><input data-k="diaPag" inputmode="numeric" placeholder="5"></label></div>` : ""}
      ${E.pagTipo === "frete" ? `<div class="row"><label class="f"><span>Valor padrão por frete (R$)</span><input data-k="valorFrete" data-money inputmode="decimal" placeholder="0,00"></label><span></span></div><p class="note" style="margin:-4px 0 10px">É o valor combinado por frete. Ele entra no <b>custo do orçamento</b> (a função “Motorista” vai no frete; as demais, como “Ajudante”, na linha de ajudantes) sempre que ele estiver na equipe do serviço, e é o que aparece para pagar quando o frete termina. Você pode mudar o valor em cada orçamento ou OS. Se ele não fizer frete com valor combinado, deixe em branco.</p>` : ""}
      ${E.pagTipo ? `<div class="row"><label class="f"><span>Começa a valer em</span><input type="date" data-k="pagDesde"></label><span></span></div><p class="note" style="margin:-4px 0 10px">Só entram na conta os pagamentos a partir desta data. Para cobrar serviços ou meses que já passaram, coloque uma data anterior.</p>` : ""}
      <div class="row r1"><label class="f"><span>Observações</span><textarea data-k="obs" rows="3"></textarea></label></div>
      `;
    fillForm($("#fCard"), E);
  };
  bindForm(view, E, dirty);
  view.addEventListener("change", e => {
    if (e.target.matches && e.target.matches('[data-k="pagTipo"]')) { E.pagTipo = e.target.value; if (E.pagTipo && !E.pagDesde) E.pagDesde = today(); draw(); dirty(); }
  });
  view.addEventListener("click", async e => {
    const b = e.target.closest(".js-save, .js-del"); if (!b) return;
    try {
      if (b.classList.contains("js-save")) {
        const r = { ...E, nome: (E.nome || "").trim() };
        if (!r.nome) { toast("Informe o nome do funcionário."); return; }
        if (r.pagTipo === "mensal" && num(r.salario) <= 0) { toast("Informe o salário mensal."); return; }
        if (r.pagTipo && !r.pagDesde) r.pagDesde = today();
        await saveItem("staff", r); toast("Funcionário salvo"); location.hash = "#/funcionarios";
      } else {
        if (!armBtn(b)) return;
        for (const t of teams.filter(t => (t.membros || []).includes(id))) await saveItem("teams", { ...t, membros: (t.membros || []).filter(x => x !== id), responsavelId: t.responsavelId === id ? "" : t.responsavelId });
        await removeItem("staff", id); toast("Funcionário excluído e retirado das equipes"); location.hash = "#/funcionarios";
      }
    } catch (err) { console.error(err); toast("Não foi possível concluir a ação."); }
  });
  draw();
}

/* ============ FICHA DA EQUIPE: #/funcionarios?novaequipe=1 ou ?equipe=ID ============ */
async function fichaTeam(view) {
  const q = params(), id = q.get("equipe") || "";
  const [staff, teams, orders, orcs] = await Promise.all([listAll("staff", true), listAll("teams", true), listAll("orders", true), listAll("orcamentos", true)]);
  staff.sort(byNome);
  const rec = id ? teams.find(x => x._id === id) : null;
  const voltar = btn({ label: "Voltar às equipes", ico: "arrowLeft", href: "#/funcionarios?aba=eq" });
  if (id && !rec) { view.innerHTML = pageHead("Equipe") + '<div class="banner">Equipe não encontrada.</div>' + bar({ left: [voltar] }); return; }
  const E = { ...blankTeam(), ...(rec || {}), membros: [...((rec && rec.membros) || [])] };
  view.innerHTML = pageHead(id ? (E.nome || "Equipe") : "Nova equipe", id ? "Ficha da equipe" : "Escolha o responsável e os integrantes") +
    bar({ left: [group(btn({ label: "Salvar", ico: "save", kind: "pri", cls: "js-save" })), '<span class="dirty" id="dirty" hidden>● Alterações não salvas</span>'],
      right: [id && btn({ label: "Excluir equipe", ico: "trash", kind: "danger", cls: "js-del" }), voltar].filter(Boolean) }) +
    '<div class="card" id="fCard"></div>';
  const $ = s => view.querySelector(s), dirty = () => { $("#dirty").hidden = false; };
  const draw = () => {
    const cand = staff.filter(s => sit(s) === "ativo" || (E.membros || []).includes(s._id));
    $("#fCard").innerHTML = `<h2>Dados da equipe</h2>
      <div class="row"><label class="f"><span>Nome da equipe</span><input data-k="nome" placeholder="Ex.: Equipe 1" autocomplete="off"></label>
        <label class="f"><span>Responsável</span><select data-k="responsavelId"><option value="">Sem responsável</option>${cand.map(s => `<option value="${esc(s._id)}">${esc(s.nome)}</option>`).join("")}</select></label></div>
      ${id ? '<p class="note" style="margin:-4px 0 10px">Se mudar o nome, o sistema pergunta se deve atualizar as OS e orçamentos que usam o nome antigo.</p>' : ""}
      <div class="f"><span>Integrantes</span><div class="used">${cand.map(s => `<div><label class="chk"><input type="checkbox" data-m="${esc(s._id)}" ${(E.membros || []).includes(s._id) ? "checked" : ""}> ${esc(s.nome)} <small>${s.funcao ? "(" + esc(s.funcao) + ")" : ""}${sit(s) !== "ativo" ? " · " + esc(sitLabel(sit(s))) : ""}</small></label></div>`).join("") || "<div><small>Cadastre funcionários primeiro (aba Funcionários).</small></div>"}</div></div>
      <div class="row r1" style="margin-top:10px"><label class="chk"><input type="checkbox" data-k="ativo"> Equipe ativa (aparece na agenda e nas OS)</label></div>
      <div class="row r1"><label class="f"><span>Observações</span><textarea data-k="obs" rows="3"></textarea></label></div>
      `;
    fillForm($("#fCard"), E);
  };
  bindForm(view, E, dirty);
  view.addEventListener("change", e => {
    const m = e.target.dataset && e.target.dataset.m;
    if (m !== undefined) {
      const st = new Set(E.membros || []); e.target.checked ? st.add(m) : st.delete(m); E.membros = [...st];
      if (!e.target.checked && E.responsavelId === m) E.responsavelId = "";
      draw(); dirty();
    } else if (e.target.matches && e.target.matches('[data-k="responsavelId"]') && E.responsavelId && !(E.membros || []).includes(E.responsavelId)) {
      E.membros = [...(E.membros || []), E.responsavelId]; draw(); // o responsável também é integrante
    }
  });
  view.addEventListener("click", async e => {
    const b = e.target.closest(".js-save, .js-del"); if (!b) return;
    try {
      if (b.classList.contains("js-save")) {
        const nome = (E.nome || "").trim();
        if (!nome) { toast("Informe o nome da equipe."); return; }
        if (teams.some(x => x._id !== E._id && norm(x.nome) === norm(nome))) { toast("Já existe uma equipe com este nome."); return; }
        const old = rec, membros = [...new Set(E.membros || [])];
        if (E.responsavelId && !membros.includes(E.responsavelId)) membros.push(E.responsavelId);
        await saveItem("teams", { ...E, nome, membros });
        if (old && old.nome && norm(old.nome) !== norm(nome)) { // nome mudou: oferece atualizar OS e orçamentos antigos
          const ro = orders.filter(o => norm(o.equipe) === norm(old.nome)), rc = orcs.filter(o => norm(o.equipe) === norm(old.nome));
          if (ro.length + rc.length && window.confirm(`Há ${ro.length} OS e ${rc.length} orçamento(s) com o nome "${old.nome}".\n\nOK = atualizar todos para "${nome}"\nCancelar = manter como estão (o histórico fica separado)`)) {
            for (const o of ro) await saveItem("orders", { ...o, equipe: nome });
            for (const o of rc) await saveItem("orcamentos", { ...o, equipe: nome });
          }
        }
        toast("Equipe salva"); location.hash = "#/funcionarios?aba=eq";
      } else {
        if (!armBtn(b)) return;
        await removeItem("teams", id); toast("Equipe excluída. As OS antigas continuam com o nome dela."); location.hash = "#/funcionarios?aba=eq";
      }
    } catch (err) { console.error(err); toast("Não foi possível concluir a ação."); }
  });
  draw();
}
