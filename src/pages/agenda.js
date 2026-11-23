// Agenda: fretes e mudanças em visão de dia, semana ou mês.
// Cores: azul = agendado (OS aberta/em andamento) · amarelo = aguardando confirmação (orçamento enviado com data)
//        verde = concluído · vermelho = cancelado. Contorno tracejado = conflito de veículo ou equipe.
// #/agenda?v=semana&d=2026-11-07  (v: dia | semana | mes)
import { pageHead } from "../components/pageHead.js";
import { esc, today, num } from "../../js/utils.js";
import { listAll, getCfg, getFleet, getTeams } from "../firebase/db.js";
import { btn, group, bar } from "../components/ui.js";
import { searchBarHTML, filterSec, bindListBar } from "../components/listKit.js";
import { agendaEvents, conflictsOf, isActive, STATUS_AG, fmtMin, parseYmd, ymd, addDays, weekStart, addMonths, layoutLanes } from "../../js/agenda.js";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const START_H = 6, END_H = 22; // faixa de horas desenhada na grade
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const who = e => [e.veiculo, e.equipe].filter(Boolean).join(" · ");
const byStart = (a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.s - b.s;
const tip = e => `${e.nome} — ${e.cliente || "sem nome"}\n${e.allDay ? "Sem horário definido" : fmtMin(e.s) + " às " + fmtMin(e.e)}${e.rota ? "\n" + e.rota : ""}${who(e) ? "\n" + who(e) : ""}\n${STATUS_AG[e.status]}`;

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  try { await screen(view); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Agenda") + '<div class="banner">Não foi possível carregar a agenda. Confira a conexão e as regras do Firestore.</div>'; }
}

async function screen(view) {
  const [orders, orcs, cfg, fleet, teams] = await Promise.all([listAll("orders"), listAll("orcamentos"), getCfg(), getFleet(), getTeams()]);
  const events = agendaEvents(orders, orcs, cfg), dur = num(cfg.agenda && cfg.agenda.duracao) || 3;
  // eventos em conflito (dois serviços ativos, mesmo dia e horário, mesmo veículo ou equipe)
  const active = events.filter(e => isActive(e.status)), conflicts = new Set();
  active.forEach(e => { if (conflictsOf({ key: e.key, date: e.date, ini: e.ini, fim: e.fim, veiculo: e.veiculo, equipe: e.equipe, status: e.status }, active, dur).length) conflicts.add(e.key); });

  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  let mode = ["dia", "semana", "mes"].includes(q.get("v")) ? q.get("v") : "semana";
  let date = /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || "") ? q.get("d") : today();
  const flt = { veiculo: "", equipe: "" };
  const veics = [...new Set([...fleet.map(v => v.placa), ...events.map(e => e.veiculo)].filter(Boolean))];
  const equips = [...new Set([...teams.map(x => x.nome), ...events.map(e => e.equipe)].filter(Boolean))];
  const filtros = veics.length > 1 || equips.length > 1;

  view.innerHTML = pageHead("Agenda", "Fretes e mudanças agendados") + `
    <div class="agbar"><div class="actions">${group(btn({ ico: "chevLeft", tip: "Anterior", sm: true, iconOnly: true, attrs: 'data-nav="-1"' }), btn({ label: "Hoje", sm: true, attrs: 'data-nav="0"' }), btn({ ico: "chevRight", tip: "Próximo", sm: true, iconOnly: true, attrs: 'data-nav="1"' }))}</div>
      <div class="agtitle" id="agTitle"></div>
      <div class="seg" role="group" aria-label="Visualização"><button type="button" data-view="dia">Dia</button><button type="button" data-view="semana">Semana</button><button type="button" data-view="mes">Mês</button></div></div>
    ${bar({ left: [btn({ label: "Nova OS", ico: "plus", kind: "pri", attrs: 'id="agOS"', href: "#/ordens?novo=1" }), btn({ label: "Novo orçamento", ico: "plus", attrs: 'id="agOrc"', href: "#/orcamentos?novo=1" })] })}
    ${filtros ? searchBarHTML({ search: false, filtersHTML: filterSec("Recursos", `<div class="lb-fields"><label class="f"><span>Veículo</span><select id="fVeic" aria-label="Filtrar por veículo"><option value="">Todos os veículos</option>${veics.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></label>
      <label class="f"><span>Equipe</span><select id="fEquip" aria-label="Filtrar por equipe"><option value="">Todas as equipes</option>${equips.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select></label></div>`) }) : ""}
    <div class="legend-ag">${Object.entries(STATUS_AG).map(([k, l]) => `<span class="st-${k}"><i></i>${l}</span>`).join("")}<span><i class="cf"></i>Conflito de veículo ou equipe</span></div>
    <div id="agBody"></div>`;
  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];

  /* ---------- peças ---------- */
  const titleOf = () => {
    const d = parseYmd(date);
    if (mode === "dia") return cap(d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    if (mode === "mes") return cap(MESES[d.getMonth()]) + " " + d.getFullYear();
    const a = parseYmd(weekStart(date)), b = parseYmd(addDays(weekStart(date), 6));
    return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`
      : `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  };
  const chip = e => `<a class="chip-ev st-${e.status}${conflicts.has(e.key) ? " conflito" : ""}" href="${esc(e.href)}" title="${esc(tip(e))}">${e.allDay ? "" : fmtMin(e.s) + " "}${esc(e.cliente || e.nome)}</a>`;
  const block = e => {
    const top = (e.s - START_H * 60) / 60, h = (e.e - e.s) / 60;
    return `<a class="ev st-${e.status}${conflicts.has(e.key) ? " conflito" : ""}" href="${esc(e.href)}" title="${esc(tip(e))}" style="top:calc(var(--hh) * ${top});height:calc(var(--hh) * ${h});left:${e.lane / e.lanes * 100}%;width:calc(${100 / e.lanes}% - 2px)">` +
      `<b>${fmtMin(e.s0)}–${fmtMin(e.e0)}</b> ${esc(e.cliente || "Sem nome")}<small>${esc(e.nome)}${who(e) ? " · " + esc(who(e)) : ""}</small>${e.rota ? `<small>${esc(e.rota)}</small>` : ""}</a>`;
  };
  const noGrid = e => e.allDay || e.e <= START_H * 60 || e.s >= END_H * 60; // sem horário ou fora da faixa: vai para a linha "Dia todo"
  const colHTML = (d, evs) => {
    const timed = layoutLanes(evs.filter(e => e.date === d && !noGrid(e)).map(e => ({ ...e, s0: e.s, e0: e.e, s: Math.max(e.s, START_H * 60), e: Math.min(e.e, END_H * 60) })));
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const line = d === today() && nowMin >= START_H * 60 && nowMin < END_H * 60 ? `<i class="nowline" style="top:calc(var(--hh) * ${(nowMin - START_H * 60) / 60})"></i>` : "";
    return `<div class="tgcol${d === today() ? " today" : ""}">${timed.map(block).join("")}${line}</div>`;
  };
  const gridHTML = (days, evs, isDay) => {
    const cols = `grid-template-columns:52px repeat(${days.length},minmax(0,1fr))`;
    const hours = Array.from({ length: END_H - START_H }, (_, i) => `<div class="tgh">${String(START_H + i).padStart(2, "0")}:00</div>`).join("");
    return `<div class="tgwrap"><div class="tg ${isDay ? "day" : "week"}">
      <div class="tgrow tghead" style="${cols}"><div></div>${days.map(d => `<button type="button" class="tgdh${d === today() ? " today" : ""}" data-goday="${d}"><span>${DIAS[parseYmd(d).getDay()]}</span><b>${parseYmd(d).getDate()}</b></button>`).join("")}</div>
      <div class="tgrow tgstrip" style="${cols}"><div class="tglab">Dia todo</div>${days.map(d => `<div class="tgcell">${evs.filter(e => e.date === d && noGrid(e)).sort(byStart).map(chip).join("")}</div>`).join("")}</div>
      <div class="tgrow tgbody" style="${cols}"><div class="tgcol gut">${hours}</div>${days.map(d => colHTML(d, evs)).join("")}</div></div></div>`;
  };
  const monthHTML = evs => {
    const [y, m] = date.split("-").map(Number), first = ymd(new Date(y, m - 1, 1, 12)), last = ymd(new Date(y, m, 0, 12)), days = [];
    for (let d = weekStart(first); d <= addDays(weekStart(last), 6); d = addDays(d, 1)) days.push(d);
    return `<div class="mgrid">${DIAS.map(n => `<div class="mh">${n}</div>`).join("")}${days.map(d => {
      const list = evs.filter(e => e.date === d).sort(byStart), dn = parseYmd(d).getDate();
      return `<div class="mcell${d.slice(0, 7) !== date.slice(0, 7) ? " out" : ""}${d === today() ? " today" : ""}"><button type="button" class="mnum" data-goday="${d}" aria-label="Abrir o dia ${dn}">${dn}</button>${list.slice(0, 3).map(chip).join("")}${list.length > 3 ? `<button type="button" class="more" data-goday="${d}">+${list.length - 3} mais</button>` : ""}</div>`;
    }).join("")}</div>`;
  };
  const dayList = evs => {
    const list = evs.filter(e => e.date === date).sort(byStart);
    return `<div class="card" style="margin-top:12px"><h2>Serviços do dia</h2>${list.length ? `<div class="hist">${list.map(e => `<div class="h"><div class="n" style="font-size:16px">${e.allDay ? "—" : fmtMin(e.s)}</div>
      <div class="t"><b>${esc(e.cliente || "Sem nome")}</b><small><span class="dot st-${e.status}"></span>${STATUS_AG[e.status]} · ${esc(e.nome)}${who(e) ? " · " + esc(who(e)) : ""}${e.rota ? " · " + esc(e.rota) : ""}${conflicts.has(e.key) ? " · ⚠ conflito" : ""}</small></div>
      <div class="b">${btn({ label: "Abrir", ico: "eye", sm: true, href: esc(e.href) })}</div></div>`).join("")}</div>` : '<p class="note">Nenhum serviço neste dia.</p>'}</div>`;
  };

  let lb = null;
  function paint() {
    const evs = events.filter(e => (!flt.veiculo || e.veiculo === flt.veiculo) && (!flt.equipe || e.equipe === flt.equipe));
    $("#agTitle").textContent = titleOf();
    $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === mode)));
    $("#agOS").setAttribute("href", "#/ordens?novo=1&data=" + date);
    $("#agOrc").setAttribute("href", "#/orcamentos?novo=1&data=" + date);
    $("#agBody").innerHTML = mode === "mes" ? monthHTML(evs)
      : mode === "dia" ? gridHTML([date], evs, true) + dayList(evs)
      : gridHTML(Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i)), evs, false);
    history.replaceState(null, "", `#/agenda?v=${mode}&d=${date}`); // guarda onde você está, sem recarregar a página
    if (lb) lb.refresh();
  }
  view.addEventListener("click", e => {
    const c = sel => e.target.closest && e.target.closest(sel), nav = c("[data-nav]"), vw = c("[data-view]"), gd = c("[data-goday]");
    if (nav) { const n = Number(nav.dataset.nav); date = n === 0 ? today() : mode === "dia" ? addDays(date, n) : mode === "semana" ? addDays(date, 7 * n) : addMonths(date, n); paint(); }
    else if (vw) { mode = vw.dataset.view; paint(); }
    else if (gd) { date = gd.dataset.goday; mode = "dia"; paint(); }
  });
  view.addEventListener("change", e => {
    if (e.target.id === "fVeic") flt.veiculo = e.target.value;
    else if (e.target.id === "fEquip") flt.equipe = e.target.value; else return;
    paint();
  });
  if (filtros) lb = bindListBar(view, {
    active: () => (flt.veiculo ? 1 : 0) + (flt.equipe ? 1 : 0), onApply: paint,
    onClear: () => { flt.veiculo = ""; flt.equipe = ""; $("#fVeic").value = ""; $("#fEquip").value = ""; paint(); } });
  paint();
}
