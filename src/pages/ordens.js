// Ordens de serviço: criar, editar, acompanhar (aberta → em andamento → concluída) e finalizar.
// #/ordens                lista        #/ordens?novo=1   nova OS
// #/ordens?id=ID          editar       #/ordens?dup=ID   nova OS copiada de outra
import { pageHead } from "../components/pageHead.js";
import { overall } from "../components/ckProgress.js";
import { esc, brl, pad, fmtD, toast, today, slug, waLink, num } from "../../js/utils.js";
import { listAll, saveItem, removeItem, getCfg, nextNum, getFleet, getTeams } from "../firebase/db.js";
import { ordersToCsv } from "../../js/export.js";
import { STATUS_OS, TIPOS, INFOS, PGTOS, label, blankOS, normOS, totals, osStatus, waTextOS, blankClient, ofClient } from "../../js/domain.js";
import { bindEquipePag } from "../components/equipePag.js";
import { addrFields, itemsFields, checks, options, fillForm, bindForm, onResize, clientPickerHTML, bindClientLink, matchClient, clientLabel, applyClient, agendamentoCard, defaultResources } from "../components/formKit.js";
import { sheetOS, paintPreview } from "../components/sheets.js";
import { exportPDF, exportPNG, downloadBlob } from "../components/exporter.js";
import { loadLib } from "../../js/lib.js";
import { confirmAgenda } from "../components/agendaGuard.js";
import { candOS } from "../../js/agenda.js";
import { btn, group, bar, armBtn } from "../components/ui.js";
import { searchBarHTML, filterSec, bindListBar } from "../components/listKit.js";

const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const params = () => new URLSearchParams(location.hash.split("?")[1] || "");

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  const q = params();
  try { await (q.has("id") || q.has("novo") || q.has("dup") ? editor(view, q) : list(view)); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Ordens de serviço") + '<div class="banner">Não foi possível carregar. Confira a conexão e as regras do Firestore.</div>'; }
}

/* ============================ LISTA ============================ */
/** [primeiro, último] dia do mês (offset 0 = este mês, -1 = mês passado). */
const monthRange = offset => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear(), m = d.getMonth(), p = n => String(n).padStart(2, "0");
  return [`${y}-${p(m + 1)}-01`, `${y}-${p(m + 1)}-${p(new Date(y, m + 1, 0).getDate())}`];
};

async function list(view) {
  const [cfg, orders, clients, fleet, cks] = await Promise.all([getCfg(), listAll("orders"), listAll("clients"), getFleet(), listAll("checklists")]);
  const ckBy = Object.fromEntries(cks.map(c => [c.osId, c]));
  orders.sort((a, b) => (Number(b.num) || 0) - (Number(a.num) || 0));
  clients.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const placas = [...new Set([...fleet.map(v => v.placa), ...orders.map(o => o.veiculo)].filter(Boolean))];
  let filtro = "todas", busca = "";
  const F = { de: "", ate: "", cli: "", veic: "" };

  let lb; // barra de busca/filtros (kit): atualiza o contador "Filtros (n)" e o botão "Limpar"
  const filtersHTML =
    filterSec("Período", `<div class="lb-fields"><label class="f"><span>Data inicial</span><input type="date" id="fDe"></label><label class="f"><span>Data final</span><input type="date" id="fAte"></label></div>
      <div class="chips" id="presets"><button class="chip" type="button" data-per="mes" aria-pressed="false">Este mês</button><button class="chip" type="button" data-per="passado" aria-pressed="false">Mês passado</button><button class="chip" type="button" data-per="tudo" aria-pressed="false">Todo o período</button></div>`) +
    filterSec("Cadastro", `<div class="lb-fields"><label class="f"><span>Cliente</span><select id="fCli"><option value="">Todos os clientes</option>${clients.map(c => `<option value="${esc(c._id)}">${esc(c.nome)}</option>`).join("")}</select></label>
      ${placas.length ? `<label class="f"><span>Veículo</span><select id="fVeic"><option value="">Todos os veículos</option>${placas.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label>` : ""}</div>`) +
    filterSec("Situação", '<div class="chips" id="chips"></div>');
  view.innerHTML = pageHead("Ordens de serviço", "Criar, editar, acompanhar e finalizar serviços") +
    bar({ left: [btn({ label: "Nova OS", ico: "plus", kind: "pri", href: "#/ordens?novo=1" })], right: [btn({ label: "Exportar", ico: "sheet", attrs: 'id="fExport"', tip: "Baixar planilha com os filtros atuais" })] }) +
    searchBarHTML({ placeholder: "Buscar por nome, telefone ou número da OS", filtersHTML }) +
    '<div id="totais"></div><div class="hist" id="rows"></div>';
  const $ = s => view.querySelector(s);

  // filtros: período, cliente, veículo e busca (a situação é escolhida nos botões abaixo)
  const passa = o => {
    if (F.de && (o.data || "") < F.de) return false;
    if (F.ate && (o.data || "") > F.ate) return false;
    if (F.veic && o.veiculo !== F.veic) return false;
    if (F.cli) { const c = clients.find(x => x._id === F.cli); if (!c || !ofClient(c, [o]).length) return false; }
    const t = busca.toLowerCase().trim();
    return !t || (pad(o.num) + " " + (o.cliNome || "") + " " + (o.cliTel || "")).toLowerCase().includes(t);
  };
  const visible = () => orders.filter(passa).filter(o => filtro === "todas" || osStatus(o) === filtro);

  const draw = () => {
    const base = orders.filter(passa), cnt = k => base.filter(o => k === "todas" || osStatus(o) === k).length;
    $("#chips").innerHTML = [["todas", "Todas"], ...STATUS_OS].map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filtro}">${l} (${cnt(k)})</button>`).join("");
    const rows = visible(), ativos = rows.filter(o => osStatus(o) !== "cancelada");
    const fat = ativos.reduce((s, o) => s + totals(o).tot, 0), rec = ativos.reduce((s, o) => s + Math.min(num(o.pago), totals(o).tot), 0), pen = ativos.reduce((s, o) => s + totals(o).res, 0);
    $("#totais").innerHTML = `<div class="kpis"><div class="kpi big"><small>Faturado</small><b>${brl(fat)}</b><em>${ativos.length} OS</em></div><div class="kpi"><small>Recebido</small><b>${brl(rec)}</b></div><div class="kpi"><small>A receber</small><b>${brl(pen)}</b></div></div>
      <p class="note" style="margin:-4px 0 10px">Os totais acompanham os filtros e não contam OS canceladas.</p>`;
    $("#rows").innerHTML = rows.map(o => {
      const T = totals(o), st = osStatus(o), id = esc(o._id);
      const ab = (a, ico, label, kind = "", tip = "") => btn({ label, ico, kind, tip, sm: true, attrs: `data-a="${a}" data-id="${id}"` });
      const flow = st === "aberta" ? ab("start", "play", "Iniciar serviço", "pri") : st === "andamento" ? ab("finish", "check", "Finalizar", "pri") : ab("reopen", "undo", "Reabrir");
      const wa = st === "cancelada" ? [] : [st === "aberta" && ab("wa-confirmacao", "whatsapp", "Confirmar", "wa", "Confirmar agendamento pelo WhatsApp"),
        st === "concluida" && ab("wa-conclusao", "whatsapp", "Avisar conclusão", "wa", "Avisar o cliente que o serviço foi concluído"),
        T.res > 0 && ab("wa-cobranca", "whatsapp", "Cobrar", "wa", "Cobrar o valor pendente pelo WhatsApp")];
      const fin = st !== "cancelada" && T.res > 0 ? ab("quitar", "dollar", "Marcar como pago", "ok") : "";
      const manage = btn({ label: "Checklist", ico: "clipboard", sm: true, href: "#/checklist?os=" + id }) + btn({ ico: "eye", tip: "Abrir", sm: true, iconOnly: true, href: "#/ordens?id=" + id }) + btn({ ico: "copy", tip: "Duplicar", sm: true, iconOnly: true, href: "#/ordens?dup=" + id }) +
        btn({ ico: "trash", tip: "Excluir", kind: "danger", sm: true, iconOnly: true, attrs: `data-a="del" data-id="${id}"` });
      return `<div class="h"><div class="n">${pad(o.num)}</div>
        <div class="t"><b>${esc(o.cliNome || "Sem nome")}</b><small>${fmtD(o.data)}${o.cliTel ? " · " + esc(o.cliTel) : ""}${o.veiculo ? " · " + esc(o.veiculo) : ""} · <span class="badge ${st}">${label(STATUS_OS, st)}</span>${T.res > 0 && st !== "cancelada" ? ` · falta ${brl(T.res)}` : ""}${st !== "cancelada" ? ` · Checklist: ${ckBy[o._id] ? overall(ckBy[o._id]) + "%" : "não iniciado"}` : ""}</small></div>
        <div class="v">${brl(T.tot)}</div>
        <div class="b">${group(flow)}${group(wa)}${group(fin)}${group(manage)}</div></div>`;
    }).join("") || '<div class="card note">Nenhuma OS encontrada com estes filtros. Toque em “Limpar” ou em “Nova OS”.</div>';
    const [m0, m1] = monthRange(0), [p0, p1] = monthRange(-1);
    $("#presets").querySelector('[data-per="mes"]').setAttribute("aria-pressed", String(F.de === m0 && F.ate === m1));
    $("#presets").querySelector('[data-per="passado"]').setAttribute("aria-pressed", String(F.de === p0 && F.ate === p1));
    if (lb) lb.refresh();
  };
  draw();
  const nFiltros = () => (F.de || F.ate ? 1 : 0) + (F.cli ? 1 : 0) + (F.veic ? 1 : 0) + (filtro !== "todas" ? 1 : 0);
  const limpar = () => {
    Object.assign(F, { de: "", ate: "", cli: "", veic: "" }); busca = ""; filtro = "todas";
    $("#fDe").value = ""; $("#fAte").value = ""; $("#fCli").value = ""; if ($("#fVeic")) $("#fVeic").value = ""; draw();
  };
  lb = bindListBar(view, { onSearch: t => { busca = t; draw(); }, onClear: limpar, active: nFiltros, onApply: draw }); lb.refresh();
  $("#chips").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; draw(); } });
  view.addEventListener("change", e => {
    const id = e.target.id;
    if (id === "fDe") F.de = e.target.value; else if (id === "fAte") F.ate = e.target.value;
    else if (id === "fCli") F.cli = e.target.value; else if (id === "fVeic") F.veic = e.target.value; else return;
    draw();
  });
  const setPeriodo = (de, ate) => { F.de = de; F.ate = ate; $("#fDe").value = de; $("#fAte").value = ate; draw(); };
  $("#presets").addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-per]"); if (!b) return;
    if (b.dataset.per === "mes") setPeriodo(...monthRange(0)); else if (b.dataset.per === "passado") setPeriodo(...monthRange(-1)); else setPeriodo("", "");
  });
  $("#fExport").addEventListener("click", () => {
    const rows = visible(); if (!rows.length) { toast("Nenhuma OS para exportar com estes filtros."); return; }
    const nome = F.de || F.ate ? `ordens-${F.de || "inicio"}-a-${F.ate || "hoje"}.csv` : `ordens-${today()}.csv`;
    downloadBlob(new Blob([ordersToCsv(rows)], { type: "text/csv;charset=utf-8" }), nome);
    toast(rows.length + " OS exportadas. Abra o arquivo no Excel ou no Google Planilhas.");
  });

  const setStatus = async (o, st) => {
    const rec = { ...o, status: st };
    if (st === "andamento" && !rec.horaIni) rec.horaIni = nowHM();
    if (st === "concluida") { rec.concluidaEm = new Date().toISOString(); if (!rec.horaFim) rec.horaFim = nowHM(); }
    if (st === "aberta") delete rec.concluidaEm;
    const saved = await saveItem("orders", rec);
    orders[orders.findIndex(x => x._id === o._id)] = saved; draw();
    const T = totals(saved);
    toast(st === "concluida" ? "OS " + pad(o.num) + " finalizada" + (T.res > 0 ? ". Ainda falta receber " + brl(T.res) : "") : "OS " + pad(o.num) + ": " + label(STATUS_OS, st).toLowerCase());
  };
  $("#rows").addEventListener("click", async e => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const o = orders.find(x => x._id === b.dataset.id), a = b.dataset.a; if (!o) return;
    try {
      if (a.startsWith("wa-")) { // mensagens prontas: confirmação, cobrança, conclusão
        const kind = a.slice(3);
        if (kind === "cobranca" && !(totals(o).res > 0)) { toast("Esta OS já está quitada."); return; }
        window.open(waLink(o.cliTel, waTextOS(normOS(o), cfg, kind)), "_blank", "noopener"); return;
      }
      if (a === "quitar") { // marca como pago: o valor pago passa a ser o total e o "falta" some
        const T0 = totals(o); if (!(T0.res > 0)) { toast("Esta OS já está quitada."); return; }
        const saved = await saveItem("orders", { ...o, pago: T0.tot });
        orders[orders.findIndex(x => x._id === o._id)] = saved; draw();
        toast("OS " + pad(o.num) + " quitada: " + brl(T0.tot) + " recebido"); return;
      }
      if (a === "start") await setStatus(o, "andamento");
      if (a === "finish") await setStatus(o, "concluida");
      if (a === "reopen") await setStatus(o, "aberta");
      if (a === "del") {
        if (!armBtn(b)) return;
        await removeItem("orders", o._id); orders.splice(orders.indexOf(o), 1); draw(); toast("OS " + pad(o.num) + " excluída");
      }
    } catch (err) { console.error(err); toast("Não foi possível concluir a ação."); }
  });
}

/* ============================ EDITOR ============================ */
async function editor(view, q) {
  const [orders, orcs, clients, cfg0, fleet, teams, staff, teamsFull] = await Promise.all([listAll("orders"), listAll("orcamentos"), listAll("clients"), getCfg(), getFleet(), getTeams(), listAll("staff"), listAll("teams")]); // getTeams() devolve só o nome da equipe; os integrantes vêm de listAll("teams")
  const cfg = { ...cfg0, veiculos: fleet, equipes: teams }; // veículos agora vêm da Frota
  await loadLib("qr").catch(() => toast("Não foi possível carregar o gerador de QR Code. A folha sai sem os QRs."));

  let S;
  const src = id => orders.find(o => o._id === id);
  if (q.get("id")) { const r = src(q.get("id")); if (!r) { view.innerHTML = pageHead("Ordens de serviço") + '<div class="banner">OS não encontrada.</div><a class="btn" href="#/ordens">Voltar para a lista</a>'; return; } S = normOS(r); }
  else if (q.get("dup") && src(q.get("dup"))) {
    S = normOS(src(q.get("dup"))); delete S._id; delete S.savedAt; delete S.concluidaEm;
    Object.assign(S, { num: nextNum(orders, cfg.startNum), data: today(), pago: "", dataCli: "", dataResp: "", status: "aberta", orcamentoId: "" });
  } else S = blankOS(nextNum(orders, cfg.startNum));
  if (!S._id && q.get("cliente")) { const c = clients.find(x => x._id === q.get("cliente")); if (c) applyClient(S, c); }
  if (!S._id && /^\d{4}-\d{2}-\d{2}$/.test(q.get("data") || "")) S.data = q.get("data"); // vindo da Agenda
  defaultResources(S, cfg);

  const actions = bar({
    left: [group(btn({ label: "Salvar", ico: "save", kind: "pri", cls: "js-save" })),
      group(btn({ label: "Baixar PDF", ico: "file", cls: "js-pdf" }), btn({ label: "Imagem", ico: "image", cls: "js-img" })),
      group(btn({ label: "Enviar resumo por WhatsApp", ico: "whatsapp", kind: "wa", cls: "js-wa" }))],
    right: [S._id && btn({ label: "Checklist", ico: "clipboard", href: "#/checklist?os=" + S._id }), btn({ label: "Voltar à lista", ico: "arrowLeft", href: "#/ordens" })].filter(Boolean) });

  view.innerHTML = pageHead(S._id ? "OS " + pad(S.num) : "Nova OS", "Preencha, confira a prévia ao lado e salve") + `
    <div class="tabs" id="tabs"><button type="button" data-t="form" aria-selected="true">Preencher</button><button type="button" data-t="prev" aria-selected="false">Prévia</button></div>
    <div class="editor" data-tab="form"><div class="formcol">${actions}
      ${S.orcamentoId ? '<div class="banner">Esta OS foi gerada a partir de um orçamento aprovado.</div>' : ""}
      <div class="card"><h2>Mensagens para o cliente</h2><div class="actions">${group(
          btn({ label: "Confirmar agendamento", ico: "whatsapp", kind: "wa", cls: "js-msg", attrs: 'data-kind="confirmacao"' }),
          btn({ label: "Cobrar pagamento", ico: "whatsapp", kind: "wa", cls: "js-msg", attrs: 'data-kind="cobranca"' }),
          btn({ label: "Serviço concluído", ico: "whatsapp", kind: "wa", cls: "js-msg", attrs: 'data-kind="conclusao"' }))}</div>
        <p class="note" style="margin-top:8px">Abre o WhatsApp com a mensagem pronta e você toca em enviar. Os textos ficam em Configurações.</p></div>
      <div class="card"><h2>Cabeçalho</h2>
        <div class="row r3 keep"><label class="f"><span>Nº da OS</span><input data-k="num" type="number" min="1" inputmode="numeric"></label>
          <label class="f"><span>Data</span><input data-k="data" type="date"></label>
          <label class="f"><span>Situação</span><select data-k="status">${options(STATUS_OS)}</select></label></div>
        <div class="row"><label class="f"><span>Hora início</span><input data-k="horaIni" type="time"></label><label class="f"><span>Hora término</span><input data-k="horaFim" type="time"></label></div></div>
      ${agendamentoCard(cfg, S, "Data e horário ficam no cabeçalho.", true)}
      <div class="card"><h2>Cliente</h2>${clientPickerHTML(clients)}
        <div class="row r1"><label class="f"><span>Nome completo</span><input data-k="cliNome" autocomplete="off"></label></div>
        <div class="row"><label class="f"><span>Telefone / WhatsApp</span><input data-k="cliTel" data-mask="tel" inputmode="tel" placeholder="(81) 99999-9999"></label>
          <label class="f"><span>CPF / CNPJ (opcional)</span><input data-k="cliCpf" data-mask="doc" inputmode="numeric"></label></div>
        <div class="row r1"><label class="f"><span>E-mail (opcional)</span><input data-k="cliEmail" type="email"></label></div></div>
      <div class="card"><h2>Endereço de coleta (carga)</h2>${addrFields("col")}</div>
      <div class="card"><h2>Endereço de entrega (descarga)</h2>${addrFields("ent")}${btn({ label: "Entrega no mesmo endereço da coleta", ico: "copy", sm: true, cls: "js-copy" })}</div>
      <div class="card"><h2>Itens transportados</h2>${itemsFields(true)}<p class="note" style="margin-top:8px">Informe qualquer item especial ou de valor no campo de observações.</p></div>
      <div class="card"><h2>Serviço</h2><div class="two">
        <div><div class="sub" style="margin-top:0">Tipo de serviço</div>${checks(TIPOS, "tipo")}<label class="f"><span>Outro: qual?</span><input data-k="tipoOutro"></label></div>
        <div><div class="sub" style="margin-top:0">Informações</div>${checks(INFOS, "info")}
          <div class="row" style="margin-top:6px"><label class="f"><span>Andar</span><input data-k="andar" inputmode="numeric"></label><label class="f"><span>Outros</span><input data-k="infoOutros"></label></div></div></div></div>
      <div class="card"><h2>Valores e pagamento</h2>
        <div class="row"><label class="f"><span>Valor do frete / diária (R$)</span><input data-k="frete" data-money inputmode="decimal" placeholder="0,00"></label>
          <label class="f"><span>Desconto (R$)</span><input data-k="desconto" data-money inputmode="decimal" placeholder="0,00"></label></div>
        <div class="row"><label class="f"><span>Valor pago (R$)</span><input data-k="pago" data-money inputmode="decimal" placeholder="0,00"></label><span></span></div>
        <div class="tot"><div class="kpi big"><small>Valor total</small><b id="kTot">R$ 0,00</b></div><div class="kpi"><small>Valor restante</small><b id="kRes">R$ 0,00</b></div></div>
        <div class="sub">Forma de pagamento</div><div class="two">${checks(PGTOS, "pgto")}</div>
        <label class="chk"><input type="checkbox" data-k="pixValor"> QR do PIX já com o valor restante</label></div>
      <div class="card"><h2>Observações e assinatura</h2>
        <div class="row r1"><label class="f"><span>Observações gerais</span><textarea data-k="obs" rows="4"></textarea></label></div>
        <div class="row"><label class="f"><span>Data da assinatura (cliente)</span><input data-k="dataCli" type="date"></label><label class="f"><span>Data da assinatura (responsável)</span><input data-k="dataResp" type="date"></label></div>
        <p class="note">As assinaturas ficam em branco na folha, para assinar na caneta depois de imprimir.</p></div>
      ${actions}</div>
      <div class="prev"><div class="prevwrap"><div class="prevhost" id="prevHost"></div></div></div></div>`;

  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];
  const paint = () => { paintPreview($("#prevHost"), sheetOS(S, cfg)); const T = totals(S); $("#kTot").textContent = brl(T.tot); $("#kRes").textContent = brl(T.res); };
  let raf; const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
  fillForm(view, S); bindForm(view, S, schedule); bindClientLink(view, S, { clients, orders, orcs, onChange: schedule });
  bindEquipePag(view, S, { staff, teams: teamsFull, onChange: schedule }).sync(); // valor que cada funcionário por frete recebe neste serviço
  onResize(paint);
  $$("#tabs button").forEach(b => b.addEventListener("click", () => {
    $$("#tabs button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    $(".editor").dataset.tab = b.dataset.t; requestAnimationFrame(paint);
  }));
  $(".js-copy").addEventListener("click", () => { S.ent = { ...S.col }; fillForm(view, S); schedule(); toast("Endereço de entrega copiado da coleta"); });
  paint();

  let okSig = ""; // conflito já confirmado para estes mesmos dados: não pergunta de novo ao baixar o PDF, por exemplo
  const agendaOk = async () => {
    const sig = [S.data, S.horaIni, S.horaFim, S.veiculo, S.equipe, S.status].join("|");
    if (sig === okSig) return true;
    const ok = await confirmAgenda(candOS(S)); if (ok) okSig = sig; return ok;
  };
  async function save(quiet) {
    if (!S.num) { toast("Informe o número da OS"); return false; }
    if (!(S.veiculo || "").trim()) { toast("Escolha o veículo em “Agendamento”."); return false; }
    if (orders.some(o => o.num === S.num && o._id !== S._id)) { toast("Já existe uma OS com o número " + pad(S.num) + "."); return false; }
    try {
      if (!(await agendaOk())) return false;
      let c = matchClient(S, clients);
      if (!c && (S.cliNome || "").trim()) {
        c = await saveItem("clients", { ...blankClient(), nome: S.cliNome.trim(), tel: S.cliTel, doc: S.cliCpf, email: S.cliEmail });
        clients.push(c); toast("Cliente " + c.nome + " cadastrado automaticamente");
      }
      if (c) { S.clientId = c._id; const p = $("#cliPick"); if (p && !p.value) p.value = clientLabel(c); }
      if (S.status === "concluida" && !S.concluidaEm) S.concluidaEm = new Date().toISOString();
      if (S.status !== "concluida") delete S.concluidaEm;
      const saved = await saveItem("orders", S);
      S._id = saved._id; const i = orders.findIndex(o => o._id === S._id);
      if (i >= 0) orders[i] = saved; else orders.push(saved);
      history.replaceState(null, "", "#/ordens?id=" + S._id); // sem recarregar a tela
      if (!quiet) toast("OS " + pad(S.num) + " salva");
      return true;
    } catch (e) { console.error(e); toast("Não foi possível salvar a OS."); return false; }
  }
  $$(".js-save").forEach(b => b.addEventListener("click", () => save()));
  const exportAs = async kind => {
    if (!(await save(true))) return;
    const btns = $$(".js-pdf,.js-img"); btns.forEach(b => (b.disabled = true)); toast(kind === "pdf" ? "Gerando PDF…" : "Gerando imagem…");
    try { await (kind === "pdf" ? exportPDF : exportPNG)(sheetOS(S, cfg), `OS-${pad(S.num)}-${slug(S.cliNome || "cliente")}.${kind === "pdf" ? "pdf" : "png"}`); }
    catch (e) { console.error(e); toast("Erro ao gerar o arquivo."); }
    btns.forEach(b => (b.disabled = false));
  };
  $$(".js-pdf").forEach(b => b.addEventListener("click", () => exportAs("pdf")));
  $$(".js-img").forEach(b => b.addEventListener("click", () => exportAs("png")));
  $$(".js-msg").forEach(b => b.addEventListener("click", () => {
    const kind = b.dataset.kind;
    if (kind === "cobranca" && !(totals(S).res > 0)) { toast("Não há valor pendente nesta OS."); return; }
    window.open(waLink(S.cliTel, waTextOS(S, cfg, kind)), "_blank", "noopener");
  }));
  $$(".js-wa").forEach(b => b.addEventListener("click", () => window.open(waLink(S.cliTel, waTextOS(S, cfg)), "_blank", "noopener")));
}
