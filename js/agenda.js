// Agenda: eventos (OS + orçamentos aguardando), conflitos e datas. Sem DOM, fácil de testar.
import { num, pad, padO, fmtD } from "./utils.js";
import { osStatus } from "./domain.js";

export const STATUS_AG = { agendado: "Agendado", aguardando: "Aguardando confirmação", concluido: "Concluído", cancelado: "Cancelado" };
export const isActive = st => st === "agendado" || st === "aguardando";

/* ---------- tempo ---------- */
export const toMin = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
export const fmtMin = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
/** Intervalo do serviço. Sem horário de início = dia inteiro. Sem fim (ou fim antes do início) = duração padrão em horas. */
export function slotOf(ini, fim, dur = 3) {
  const s = toMin(ini); if (s == null) return { allDay: true, s: 0, e: 1440 };
  let e = toMin(fim); if (e == null || e <= s) e = s + Math.round(dur * 60);
  return { allDay: false, s, e: Math.min(e, 1440) };
}
const dhDate = dh => (/^\d{4}-\d{2}-\d{2}/.test(dh || "") ? dh.slice(0, 10) : "");
const dhTime = dh => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dh || "") ? dh.slice(11, 16) : "");
const rotaTxt = o => [o.col && o.col.bairro, o.ent && o.ent.bairro].filter(Boolean).join(" → ");
export const agStatusOS = o => { const s = osStatus(o); return s === "concluida" ? "concluido" : s === "cancelada" ? "cancelado" : "agendado"; };

/**
 * Eventos da agenda: toda OS com data (cor pelo status) e os orçamentos "aguardando aprovação" que têm
 * data prevista (amarelo, seguram o horário até serem aprovados ou recusados).
 */
export function agendaEvents(orders, orcs, cfg = {}) {
  const dur = num(cfg.agenda && cfg.agenda.duracao) || 3, out = [];
  (orders || []).forEach(o => {
    if (!o.data) return;
    out.push({ key: "os:" + o._id, tipo: "os", id: o._id, num: o.num, cliente: o.cliNome || "", date: o.data, ini: o.horaIni || "", fim: o.horaFim || "",
      ...slotOf(o.horaIni, o.horaFim, dur), veiculo: o.veiculo || "", equipe: o.equipe || "", status: agStatusOS(o), rota: rotaTxt(o),
      href: "#/ordens?id=" + o._id, nome: "OS " + pad(o.num) });
  });
  (orcs || []).forEach(o => {
    const dh = o.col && o.col.dh;
    if (o.status !== "aguardando" || o.osId || !dhDate(dh)) return;
    out.push({ key: "orc:" + o._id, tipo: "orc", id: o._id, num: o.num, cliente: o.cliNome || "", date: dhDate(dh), ini: dhTime(dh), fim: "",
      ...slotOf(dhTime(dh), "", dur), veiculo: o.veiculo || "", equipe: o.equipe || "", status: "aguardando", rota: rotaTxt(o),
      href: "#/orcamentos?id=" + o._id, nome: "Orçamento " + padO(o.num) });
  });
  return out;
}

/* ---------- conflitos ---------- */
const sameRes = (a, b) => (a.veiculo || "") === (b.veiculo || "") || (a.equipe || "") === (b.equipe || "");
const overlap = (a, b) => a.allDay || b.allDay || (a.s < b.e && b.s < a.e);
/**
 * Candidato = serviço que está sendo salvo: { key, date, ini, fim, veiculo, equipe, status, exclude: [keys] }.
 * Conflita quando é no mesmo dia, o horário se sobrepõe e o veículo OU a equipe é o mesmo (vazio = mesmo "padrão").
 * Só serviços ativos (agendado / aguardando) seguram horário; concluído e cancelado não.
 */
export function conflictsOf(c, events, dur = 3) {
  if (!c.date || !isActive(c.status)) return [];
  const mine = { ...c, ...slotOf(c.ini, c.fim, dur) }, skip = new Set([c.key, ...(c.exclude || [])].filter(Boolean));
  return events.filter(e => !skip.has(e.key) && isActive(e.status) && e.date === c.date && sameRes(e, c) && overlap(e, mine));
}
export const candOS = s => ({ key: s._id ? "os:" + s._id : "", date: s.data, ini: s.horaIni, fim: s.horaFim, veiculo: s.veiculo || "", equipe: s.equipe || "",
  status: agStatusOS(s), exclude: s.orcamentoId ? ["orc:" + s.orcamentoId] : [] });
export const candOrc = (o, status = "aguardando") => ({ key: o._id ? "orc:" + o._id : "", date: dhDate(o.col && o.col.dh), ini: dhTime(o.col && o.col.dh), fim: "",
  veiculo: o.veiculo || "", equipe: o.equipe || "", status, exclude: o.osId ? ["os:" + o.osId] : [] });
export function describeConflict(e) {
  return `• ${e.nome} (${e.cliente || "sem nome"}) em ${fmtD(e.date)}, ${e.allDay ? "sem horário definido" : fmtMin(e.s) + " às " + fmtMin(e.e)} — veículo ${e.veiculo || "não definido"}, equipe ${e.equipe || "não definida"}`;
}

/* ---------- datas (meio-dia local, para não sofrer com horário de verão) ---------- */
export const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const weekStart = s => addDays(s, -parseYmd(s).getDay()); // semana começa no domingo, como o calendário do Painel
export function addMonths(s, n) {
  const d = parseYmd(s), day = d.getDate(), t = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return ymd(t);
}
/** Posiciona eventos que se sobrepõem lado a lado dentro da coluna do dia. */
export function layoutLanes(evs) {
  const sorted = [...evs].sort((a, b) => a.s - b.s || a.e - b.e), out = []; let cluster = [], end = -1;
  const flush = () => {
    const ends = []; cluster.forEach(ev => { let i = ends.findIndex(x => x <= ev.s); if (i < 0) { i = ends.length; ends.push(0); } ends[i] = ev.e; ev.lane = i; });
    cluster.forEach(ev => { ev.lanes = ends.length; }); out.push(...cluster); cluster = []; end = -1;
  };
  sorted.forEach(ev => { if (cluster.length && ev.s >= end) flush(); cluster.push({ ...ev }); end = Math.max(end, ev.e); });
  if (cluster.length) flush(); return out;
}
