// Painel: visão geral da empresa (rota #/painel, primeira tela depois do login).
//
// Fontes de dados em companies/{uid}/:
//  - orders     → OS já existentes. A data da OS (campo "data") funciona como data do serviço.
//  - despesas   → ainda não existe tela; esperado { data: "AAAA-MM-DD", valor: "123,45" }.
//  - orcamentos → ainda não existe tela; esperado { status: "aguardando" }.
// Enquanto despesas/orçamentos estiverem vazios, os indicadores mostram zero.
//
// Filtro de mês: vale para faturamento, fretes realizados, despesas, lucro, gráficos e calendário.
// "Agendados para hoje", "Aguardando pagamento", "Orçamentos pendentes" e "Próximos serviços"
// sempre mostram a situação atual.
import { db, collection, getDocs } from "../firebase/config.js";
import { pageHead } from "../components/pageHead.js";
import { esc, num, brl, brlCompact, fmtD } from "../../js/utils.js";
import { parcelasPorVeiculo, valorPainel } from "../../js/uso.js";
import { btn, group, bar } from "../components/ui.js";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DOW = ["D","S","T","Q","Q","S","S"];
const TIPOS = { frete: "Frete", mudanca: "Mudança", diaria: "Diária", moveis: "Transporte de móveis", eletro: "Transporte de eletrodomésticos" };
const p2 = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const monthKeyOf = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
const shiftMonth = (key, n) => { const [y, m] = key.split("-").map(Number); return monthKeyOf(new Date(y, m - 1 + n, 1)); };
const monthLabel = key => { const [y, m] = key.split("-").map(Number); return `${MESES[m - 1]} ${y}`; };
const totalOS = o => Math.max(0, num(o.frete) - num(o.desconto));
const restante = o => Math.max(0, totalOS(o) - num(o.pago));
const byTime = (a, b) => (a.data || "").localeCompare(b.data || "") || (a.horaIni || "").localeCompare(b.horaIni || "");
const inMonth = (o, key) => (o.data || "").startsWith(key);

async function load(user, name) {
  try {
    const snap = await getDocs(collection(db, "companies", user.uid, name));
    return snap.docs.map(d => ({ ...d.data(), _id: d.id }));
  } catch (err) { console.error("Falha ao ler", name, err); return null; }
}

// Calendário compacto: número do dia, ponto vermelho quando há serviço.
function calendarHTML(sel, byDay, todayIso, selDay) {
  const [y, m] = sel.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
  let total = 0, cells = DOW.map(d => `<span class="cal-h">${d}</span>`).join("") + "<span></span>".repeat(first);
  for (let d = 1; d <= days; d++) {
    const key = `${sel}-${p2(d)}`, n = (byDay[key] || []).length;
    total += n;
    cells += `<button type="button" class="cal-d${key === todayIso ? " today" : ""}${n ? " has" : ""}${key === selDay ? " sel" : ""}" data-d="${key}" aria-label="${d} de ${MESES[m - 1]}: ${n} serviço(s)">${d}</button>`;
  }
  let detail = "";
  if (selDay) {
    const list = (byDay[selDay] || []).slice().sort(byTime);
    detail = `<b>${esc(fmtD(selDay))}</b>` + (list.length
      ? `<ul>${list.map(o => `<li>${esc(o.horaIni || "--:--")} · ${esc(o.cliNome || "Sem nome")}</li>`).join("")}</ul>`
      : '<p class="note">Nenhum serviço neste dia.</p>');
  }
  return `<div class="cal-top"><span>${monthLabel(sel)}</span><small>${total} serviço${total === 1 ? "" : "s"}</small></div><div class="cal-grid">${cells}</div><div id="calDay">${detail}</div>`;
}

export async function render(root, { user }) {
  root.innerHTML = pageHead("Painel", "Visão geral da empresa") + '<p class="note">Carregando dados…</p>';
  const [todas, despesas, orcamentos, veics, usos] = await Promise.all([load(user, "orders"), load(user, "despesas"), load(user, "orcamentos"), load(user, "vehicles"), load(user, "usos")]);
  // Veículo compartilhado: manutenção e documentos entram só na parcela de uso da empresa (js/uso.js).
  const vehById = Object.fromEntries((veics || []).map(v => [v._id, v])), parcelas = parcelasPorVeiculo(usos || []);
  const vp = d => valorPainel(d, vehById, parcelas);
  const orders = todas && todas.filter(o => o.status !== "cancelada"); // OS cancelada não entra nas contas
  if (!orders) {
    root.innerHTML = pageHead("Painel") + '<div class="banner">Falha ao carregar os dados do Firestore. Confira as regras de acesso e a conexão.</div>';
    return;
  }

  const now = new Date(), todayIso = iso(now), curKey = todayIso.slice(0, 7);
  let sel = curKey, selDay = "";

  root.innerHTML = pageHead("Painel", "Visão geral da empresa") + `
    <div class="filter">
      ${btn({ ico: "chevLeft", tip: "Mês anterior", sm: true, iconOnly: true, attrs: 'id="mPrev"' })}
      <input id="mPick" type="month" aria-label="Mês de análise">
      ${btn({ ico: "chevRight", tip: "Próximo mês", sm: true, iconOnly: true, attrs: 'id="mNext"' })}
      ${btn({ label: "Mês atual", ico: "calendar", sm: true, attrs: 'id="mNow"' })}
    </div>
    <p class="note filter-note">O mês escolhido vale para faturamento, fretes, despesas, lucro, gráficos e calendário. “Hoje”, “aguardando pagamento” e “próximos serviços” sempre mostram a situação atual.</p>
    <div id="dash"></div>`;
  const $ = s => root.querySelector(s);

  const go = key => { if (!/^\d{4}-\d{2}$/.test(key)) return; sel = key; selDay = ""; paint(); };
  $("#mPrev").addEventListener("click", () => go(shiftMonth(sel, -1)));
  $("#mNext").addEventListener("click", () => go(shiftMonth(sel, 1)));
  $("#mNow").addEventListener("click", () => go(curKey));
  $("#mPick").addEventListener("change", e => go(e.target.value));

  function paint() {
    $("#mPick").value = sel;
    $("#mNow").hidden = sel === curKey;

    // ---- Indicadores ----
    const monthOrders = orders.filter(o => inMonth(o, sel));
    const fatur = monthOrders.reduce((s, o) => s + totalOS(o), 0);
    const realizados = monthOrders.filter(o => o.data <= todayIso).length;
    const hoje = orders.filter(o => o.data === todayIso);
    const aguardando = orders.filter(o => restante(o) > 0);
    const aguardandoValor = aguardando.reduce((s, o) => s + restante(o), 0);
    const orcPend = (orcamentos || []).filter(o => o.status === "aguardando").length;
    const desp = (despesas || []).filter(d => inMonth(d, sel)).reduce((s, d) => s + vp(d), 0);
    const descontado = (despesas || []).filter(d => inMonth(d, sel)).reduce((s, d) => s + num(d.valor) - vp(d), 0);
    const lucro = fatur - desp;
    const proximos = orders.filter(o => o.data >= todayIso).sort(byTime).slice(0, 5);
    const byDay = {};
    orders.filter(o => inMonth(o, sel)).forEach(o => (byDay[o.data] = byDay[o.data] || []).push(o));

    // ---- 1) Faturamento (e despesas, quando houver): 6 meses até o mês escolhido ----
    const serie = [];
    for (let i = 5; i >= 0; i--) {
      const key = shiftMonth(sel, -i);
      serie.push({ key, label: MESES[Number(key.slice(5)) - 1].slice(0, 3), cur: i === 0,
        fat: orders.filter(o => inMonth(o, key)).reduce((a, o) => a + totalOS(o), 0),
        desp: (despesas || []).filter(x => inMonth(x, key)).reduce((a, x) => a + vp(x), 0) });
    }
    const temDesp = serie.some(x => x.desp > 0);
    const maxV = Math.max(...serie.map(x => Math.max(x.fat, x.desp)), 0);
    const h = v => (maxV && v > 0 ? Math.max(v / maxV * 100, 2) : 0);
    const faturChart = maxV ? `
      <div class="bars" role="img" aria-label="Faturamento dos 6 meses até ${monthLabel(sel)}">${serie.map(x => `
        <div class="bar-col${x.cur ? " cur" : ""}">
          <div class="bar-pair">
            <div class="bar" style="height:${h(x.fat)}%" title="Faturamento: ${brl(x.fat)}"></div>
            ${temDesp ? `<div class="bar exp" style="height:${h(x.desp)}%" title="Despesas: ${brl(x.desp)}"></div>` : ""}
          </div>
          <small class="bar-m">${x.label}</small><small class="bar-v">${brlCompact(x.fat)}</small>
          ${temDesp ? `<small class="bar-v exp">${brlCompact(x.desp)}</small>` : ""}
        </div>`).join("")}</div>
      ${temDesp ? '<div class="legend"><span><i style="background:var(--red)"></i>Faturamento</span><span><i style="background:#6b7480"></i>Despesas</span></div>' : ""}`
      : '<p class="note">Nenhuma ordem com data neste período. Escolha outro mês no filtro acima.</p>';

    // ---- 2) Pagamentos do mês: recebido x a receber ----
    const recebidoMes = monthOrders.reduce((a, o) => a + Math.min(num(o.pago), totalOS(o)), 0);
    const aReceberMes = Math.max(0, fatur - recebidoMes);
    const pct = fatur > 0 ? Math.round(recebidoMes / fatur * 100) : 0;
    const payChart = fatur > 0 ? `
      <div class="donut-wrap">
        <div class="donut" role="img" aria-label="${pct}% do faturamento de ${monthLabel(sel)} já foi recebido" style="background:conic-gradient(var(--ok) 0 ${pct}%, var(--red) ${pct}% 100%)"><div><b>${pct}%</b><small>recebido</small></div></div>
        <ul class="legend v">
          <li><i style="background:var(--ok)"></i>Recebido<b>${brl(recebidoMes)}</b></li>
          <li><i style="background:var(--red)"></i>A receber<b>${brl(aReceberMes)}</b></li>
        </ul>
      </div>` : `<p class="note">Sem ordens em ${monthLabel(sel)}.</p>`;

    // ---- 3) Serviços por tipo (6 meses até o mês escolhido). Uma OS pode ter mais de um tipo. ----
    const recentes = orders.filter(o => (o.data || "") >= serie[0].key + "-01" && (o.data || "") <= sel + "-31");
    const contagem = Object.entries(TIPOS).map(([k, l]) => ({ l, n: recentes.filter(o => o.tipo && o.tipo[k]).length }));
    const outros = recentes.filter(o => (o.tipoOutro || "").trim()).length;
    if (outros) contagem.push({ l: "Outros", n: outros });
    const tipos = contagem.filter(c => c.n > 0).sort((a, b) => b.n - a.n);
    const tiposChart = tipos.length ? tipos.map(c => `
      <div class="hrow"><span title="${esc(c.l)}">${esc(c.l)}</span>
        <div class="track"><div class="fill" style="width:${Math.round(c.n / tipos[0].n * 100)}%"></div></div><b>${c.n}</b></div>`).join("")
      : '<p class="note">Nenhum tipo de serviço registrado no período.</p>';

    const kpi = (label, value, hint = "", cls = "") => `<div class="kpi ${cls}"><small>${label}</small><b>${value}</b>${hint ? `<em>${hint}</em>` : ""}</div>`;
    const periodo = sel === curKey ? "últimos 6 meses" : `6 meses até ${monthLabel(sel)}`;

    $("#dash").innerHTML = `
      ${bar({ left: [btn({ label: "Nova ordem", ico: "plus", kind: "pri", href: "#/ordens?novo=1" }), btn({ label: "Cadastrar cliente", ico: "plus", href: "#/clientes?novo=1" })] })}
      <div class="kpis">
        ${kpi("Faturamento do mês", brl(fatur), monthLabel(sel), "big")}
        ${kpi("Fretes realizados", realizados, sel === curKey ? "no mês, até hoje" : "no mês")}
        ${kpi("Agendados para hoje", hoje.length, hoje.length ? "" : "nenhum serviço hoje")}
        ${kpi("Aguardando pagamento", aguardando.length, `${brl(aguardandoValor)} a receber`)}
        ${kpi("Orçamentos pendentes", orcPend, orcamentos && orcamentos.length ? "aguardando aprovação" : "sem orçamentos ainda")}
        ${kpi("Despesas do mês", brl(desp), despesas && despesas.length ? (descontado > 0.004 ? "sem " + brl(descontado) + " de uso pessoal" : "") : "sem lançamentos ainda")}
        ${kpi("Lucro estimado", brl(lucro), "faturamento − despesas", lucro < 0 ? "neg" : "")}
      </div>
      <div class="chart-grid">
        <div class="card"><h2>Faturamento — ${periodo}</h2>${faturChart}</div>
        <div class="card"><h2>Pagamentos — ${monthLabel(sel)}</h2>${payChart}</div>
      </div>
      <div class="panel-grid">
        <div>
          <div class="card"><h2>Próximos serviços</h2>
            <div class="row-list">${proximos.map(o => `
              <div class="row-item"><span class="n">${esc(fmtD(o.data).slice(0, 5))}</span>
                <div><b>${esc(o.cliNome || "Sem nome")}</b>
                  <small>${esc([o.horaIni, [o.col && o.col.bairro, o.ent && o.ent.bairro].filter(Boolean).join(" → ")].filter(Boolean).join(" · "))}</small></div>
                <span class="v">${brl(totalOS(o))}</span></div>`).join("") || '<p class="note">Nenhum serviço agendado daqui para frente.</p>'}
            </div></div>
          <div class="card"><h2>Serviços por tipo</h2><p class="note" style="margin:-4px 0 10px">${periodo[0].toUpperCase() + periodo.slice(1)}. Uma OS pode ter mais de um tipo.</p>${tiposChart}</div>
        </div>
        <div class="card"><h2>Calendário</h2><div id="cal"></div></div>
      </div>`;

    // Calendário: clicar num dia mostra os serviços dele.
    const cal = $("#cal");
    const drawCal = () => { cal.innerHTML = calendarHTML(sel, byDay, todayIso, selDay); };
    cal.addEventListener("click", e => { const d = e.target.closest("[data-d]"); if (d) { selDay = d.dataset.d; drawCal(); } });
    drawCal();
  }
  paint();
}
