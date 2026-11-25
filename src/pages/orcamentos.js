// Orçamentos: criar, enviar pelo WhatsApp (imagem + texto) e, quando aprovado, virar Ordem de Serviço.
// #/orcamentos  lista   #/orcamentos?novo=1  novo   #/orcamentos?id=ID  editar   #/orcamentos?dup=ID  copiar
import { pageHead } from "../components/pageHead.js";
import { esc, brl, pad, padO, fmtD, toast, today, slug, waLink, num, money, numCurto, nomeArquivo } from "../../js/utils.js";
import { listAll, saveItem, removeItem, getCfg, nextNum, getFleet, getTeams } from "../firebase/db.js";
import { STATUS_ORC, TIPOS, SERV_SUG, COND_SUG, label, blankOrc, normOrc, syncOrc, orcSub, totals, orcToOS, waTextOrc, blankClient } from "../../js/domain.js";
import { addrFields, checks, options, fillForm, bindForm, onResize, clientPickerHTML, bindClientLink, matchClient, clientLabel, applyClient, agendamentoCard, defaultResources } from "../components/formKit.js";
import { sheetOrc, paintPreview, ORC } from "../components/sheets.js";
import { exportPDF, exportPNG, renderPNG, downloadBlob } from "../components/exporter.js";
import { loadLib } from "../../js/lib.js";
import { distanciaHTML, calculadoraHTML, bindPricing } from "../components/pricing.js";
import { bindEquipePag } from "../components/equipePag.js";
import { bindCepAuto } from "../components/cepAuto.js";
import { confirmAgenda } from "../components/agendaGuard.js";
import { candOS, candOrc } from "../../js/agenda.js";
import { btn, group, bar, armBtn } from "../components/ui.js";
import { searchBarHTML, filterSec, bindListBar } from "../components/listKit.js";

const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
const vencido = o => o.status === "aguardando" && o.validade && o.validade < today();

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  const q = params();
  try { await (q.has("id") || q.has("novo") || q.has("dup") ? editor(view, q) : list(view)); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Orçamentos") + '<div class="banner">Não foi possível carregar. Confira a conexão e as regras do Firestore.</div>'; }
}

/** Pergunta a entrada ao aprovar. Devolve null (cancelou), "" (sem entrada) ou o valor digitado. */
function askApprove(orc) {
  const r = window.prompt(`Aprovar o orçamento ${numCurto(orc.num)} e gerar a Ordem de Serviço?\n\nEntrada já recebida (R$). Deixe em branco se ainda não recebeu:`, "");
  if (r === null) return null;
  if (r.trim() && !(num(r) > 0)) { toast("Valor de entrada inválido."); return null; }
  return r.trim();
}
/** Aprovação: cria a OS com os dados do orçamento (e a entrada, se houve) e marca o orçamento como aprovado. */
async function approveOrc(orc, entrada) {
  const [cfg, orders] = await Promise.all([getCfg(), listAll("orders", true)]);
  const os = orcToOS(orc, nextNum(orders, cfg.startNum));
  if (entrada) os.pago = money(entrada);
  const savedOS = await saveItem("orders", os);
  const upd = await saveItem("orcamentos", { ...orc, status: "convertido", osId: savedOS._id, aprovadoEm: new Date().toISOString() });
  return { os: savedOS, orc: upd };
}
const openWa = (o, cfg) => window.open(waLink(o.cliTel, waTextOrc(o, cfg)), "_blank", "noopener");

/**
 * Envia o orçamento: no celular abre o compartilhamento com a IMAGEM já anexada + texto;
 * no computador baixa a imagem e abre a conversa com o texto (você anexa a imagem).
 * Devolve false só se a pessoa cancelou o compartilhamento.
 */
async function sendOrc(o, cfg) {
  const text = waTextOrc(o, cfg), name = nomeArquivo("orc", o.num, o.cliNome) + ".png";
  let blob = null;
  try {
    blob = await renderPNG(sheetOrc(o, cfg), ORC);
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return true; }
    downloadBlob(blob, name); window.open(waLink(o.cliTel, text), "_blank", "noopener");
    toast("Imagem baixada. Anexe na conversa do WhatsApp que abriu."); return true;
  } catch (e) {
    if (e && e.name === "AbortError") return false;
    console.error(e);
    if (blob) downloadBlob(blob, name);
    window.open(waLink(o.cliTel, text), "_blank", "noopener");
    toast(blob ? "Não deu para anexar sozinho. A imagem foi baixada: anexe na conversa." : "Não consegui montar a imagem. O texto foi aberto no WhatsApp.");
    return true;
  }
}

/* ============================ LISTA ============================ */
async function list(view) {
  const [orcs, cfg] = await Promise.all([listAll("orcamentos"), getCfg()]);
  loadLib("h2c").catch(() => {}); loadLib("pdf").catch(() => {}); // já deixa a geração de imagem pronta
  orcs.sort((a, b) => (Number(b.num) || 0) - (Number(a.num) || 0));
  let filtro = "todas", busca = "", lb;
  view.innerHTML = pageHead("Orçamentos", "Envie propostas e transforme as aprovadas em ordem de serviço") +
    bar({ left: [btn({ label: "Novo orçamento", ico: "plus", kind: "pri", href: "#/orcamentos?novo=1" })] }) +
    searchBarHTML({ placeholder: "Buscar por nome, telefone ou número", filtersHTML: filterSec("Situação", '<div class="chips" id="chips"></div>') }) +
    '<div class="hist" id="rows"></div>';
  const $ = s => view.querySelector(s);
  const draw = () => {
    const cnt = k => orcs.filter(o => k === "todas" || o.status === k).length;
    $("#chips").innerHTML = [["todas", "Todos"], ...STATUS_ORC].map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filtro}">${l} (${cnt(k)})</button>`).join("");
    const t = busca.toLowerCase().trim();
    $("#rows").innerHTML = orcs.filter(o => (filtro === "todas" || o.status === filtro) && (!t || (numCurto(o.num) + " " + padO(o.num) + " " + (o.cliNome || "") + " " + (o.cliTel || "")).toLowerCase().includes(t))).map(o => {
      const id = esc(o._id), st = o.status || "rascunho", T = totals(o);
      const ab = (a, ico, label, kind = "", tip = "") => btn({ label, ico, kind, tip, sm: true, attrs: `data-a="${a}" data-id="${id}"` });
      const wa = st === "convertido" || st === "recusado" ? [] : [ab("img", "whatsapp", "Enviar com imagem", "wa", "Envia a imagem do orçamento e o texto pelo WhatsApp"), ab("wa", "whatsapp", "Só texto", "wa", "Envia somente o texto pelo WhatsApp")];
      const flow = st === "convertido" ? btn({ label: "Ver OS gerada", ico: "clipboard", kind: "pri", sm: true, href: "#/ordens?id=" + esc(o.osId) })
        : st === "recusado" ? "" : ab("ok", "check", "Aprovar e gerar OS", "ok");
      const manage = btn({ ico: "eye", tip: "Abrir", sm: true, iconOnly: true, href: "#/orcamentos?id=" + id }) + btn({ ico: "copy", tip: "Duplicar", sm: true, iconOnly: true, href: "#/orcamentos?dup=" + id }) +
        btn({ ico: "trash", tip: "Excluir", kind: "danger", sm: true, iconOnly: true, attrs: `data-a="del" data-id="${id}"` });
      return `<div class="h"><div class="n" style="font-size:16px">${numCurto(o.num)}</div>
        <div class="t"><b>${esc(o.cliNome || "Sem nome")}</b><small>${fmtD(o.data)}${o.cliTel ? " · " + esc(o.cliTel) : ""} · <span class="badge ${st}">${label(STATUS_ORC, st)}</span>${vencido(o) ? ' <span class="badge vencido">Vencido</span>' : ""}${o.validade && st === "aguardando" ? " · válido até " + fmtD(o.validade) : ""}</small></div>
        <div class="v">${brl(T.tot)}</div>
        <div class="b">${group(wa)}${group(flow)}${group(manage)}</div></div>`;
    }).join("") || '<div class="card note">Nenhum orçamento encontrado. Toque em “Novo orçamento”.</div>';
    if (lb) lb.refresh();
  };
  draw();
  lb = bindListBar(view, { onSearch: t => { busca = t; draw(); }, onClear: () => { busca = ""; filtro = "todas"; draw(); }, active: () => (filtro !== "todas" ? 1 : 0), onApply: draw }); lb.refresh();
  $("#chips").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b) { filtro = b.dataset.f; draw(); } });
  $("#rows").addEventListener("click", async e => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const o = orcs.find(x => x._id === b.dataset.id), a = b.dataset.a; if (!o) return;
    try {
      if (a === "wa") {
        if (o.status === "rascunho" && !(await confirmAgenda(candOrc(normOrc(o))))) return;
        if (o.status === "rascunho") { orcs[orcs.indexOf(o)] = await saveItem("orcamentos", { ...o, status: "aguardando" }); draw(); }
        openWa(o, cfg);
      }
      if (a === "img") {
        if (o.status === "rascunho" && !(await confirmAgenda(candOrc(normOrc(o))))) return;
        b.disabled = true; toast("Montando a imagem do orçamento…");
        const sent = await sendOrc(normOrc(o), cfg);
        if (sent && o.status === "rascunho") { orcs[orcs.indexOf(o)] = await saveItem("orcamentos", { ...o, status: "aguardando" }); draw(); }
        b.disabled = false;
      }
      if (a === "ok") {
        if (!(await confirmAgenda(candOS(orcToOS(normOrc(o), 0))))) return;
        const entrada = askApprove(o); if (entrada === null) return;
        const r = await approveOrc(o, entrada); toast("OS " + numCurto(r.os.num) + " criada a partir do orçamento"); location.hash = "#/ordens?id=" + r.os._id;
      }
      if (a === "del") {
        if (!armBtn(b)) return;
        await removeItem("orcamentos", o._id); orcs.splice(orcs.indexOf(o), 1); draw(); toast("Orçamento " + numCurto(o.num) + " excluído");
      }
    } catch (err) { console.error(err); toast("Não foi possível concluir a ação."); }
  });
}

/* ============================ EDITOR ============================ */
const servFields = () => `<datalist id="servSug">${SERV_SUG.map(x => `<option value="${x}">`).join("")}</datalist><datalist id="condSug">${COND_SUG.map(x => `<option value="${x}">`).join("")}</datalist>` +
  `<div class="items">${[0, 1, 2, 3, 4, 5].map(i => `<div class="it" style="grid-template-columns:minmax(0,1fr) 120px"><input type="text" list="servSug" data-k="servicos.${i}.d" placeholder="Serviço ${i + 1}" aria-label="Serviço ${i + 1}"><input type="text" data-k="servicos.${i}.v" data-money inputmode="decimal" placeholder="0,00" aria-label="Valor do serviço ${i + 1}"></div>`).join("")}</div>`;

async function editor(view, q) {
  const [orcs, orders, clients, cfg0, fleet, vehicles, teams, staff, teamsFull] = await Promise.all([listAll("orcamentos"), listAll("orders"), listAll("clients"), getCfg(), getFleet(), listAll("vehicles"), getTeams(), listAll("staff"), listAll("teams")]); // getTeams() devolve só o nome da equipe; os integrantes vêm de listAll("teams")
  const cfg = { ...cfg0, veiculos: fleet, equipes: teams }; // veículos agora vêm da Frota
  loadLib("h2c").catch(() => {}); loadLib("pdf").catch(() => {});
  let O; const src = id => orcs.find(o => o._id === id);
  if (q.get("id")) { const r = src(q.get("id")); if (!r) { view.innerHTML = pageHead("Orçamentos") + '<div class="banner">Orçamento não encontrado.</div><a class="btn" href="#/orcamentos">Voltar</a>'; return; } O = normOrc(r); }
  else if (q.get("dup") && src(q.get("dup"))) {
    O = normOrc(src(q.get("dup"))); delete O._id; delete O.savedAt; delete O.aprovadoEm;
    Object.assign(O, { num: nextNum(orcs), data: today(), validade: today(7), status: "rascunho", osId: "" });
  } else O = blankOrc(nextNum(orcs));
  if (!O._id && q.get("cliente")) { const c = clients.find(x => x._id === q.get("cliente")); if (c) applyClient(O, c); }
  if (!O._id && /^\d{4}-\d{2}-\d{2}$/.test(q.get("data") || "")) O.col.dh = q.get("data") + "T08:00"; // vindo da Agenda: ajuste a hora
  defaultResources(O, cfg);

  const actions = bar({
    left: [group(btn({ label: "Salvar", ico: "save", kind: "pri", cls: "js-save" })),
      group(btn({ label: "Enviar pelo WhatsApp", ico: "whatsapp", kind: "wa", cls: "js-share" })),
      group(btn({ label: O.osId ? "Abrir OS gerada" : "Aprovar e gerar OS", ico: O.osId ? "clipboard" : "check", kind: "ok", cls: "js-ok" }), O.osId ? "" : btn({ label: "Recusar", ico: "ban", kind: "danger", cls: "js-no" })),
      group(btn({ label: "Baixar PDF", ico: "file", cls: "js-pdf" }), btn({ label: "Baixar imagem", ico: "image", cls: "js-img" }))],
    right: [btn({ label: "Voltar à lista", ico: "arrowLeft", href: "#/orcamentos" })] });

  view.innerHTML = pageHead(O._id ? "Orçamento " + numCurto(O.num) : "Novo orçamento", "A imagem do orçamento é montada ao lado enquanto você preenche") + `
    <div class="tabs" id="tabs"><button type="button" data-t="form" aria-selected="true">Preencher</button><button type="button" data-t="prev" aria-selected="false">Prévia</button></div>
    <div class="editor" data-tab="form"><div class="formcol">${actions}
      ${O.osId ? '<div class="banner">Este orçamento já foi aprovado e virou uma Ordem de Serviço. Alterações aqui não mudam a OS.</div>' : ""}
      <div class="card"><h2>Cabeçalho</h2>
        <div class="row r3 keep"><label class="f"><span>Nº do orçamento</span><input data-k="num" type="number" min="1" inputmode="numeric"></label>
          <label class="f"><span>Emitido em</span><input data-k="data" type="date"></label>
          <label class="f"><span>Situação</span><select data-k="status">${options(STATUS_ORC)}</select></label></div></div>
      <div class="card"><h2>Cliente</h2>${clientPickerHTML(clients)}
        <div class="row r1"><label class="f"><span>Nome completo</span><input data-k="cliNome" autocomplete="off"></label></div>
        <div class="row"><label class="f"><span>Telefone / WhatsApp</span><input data-k="cliTel" data-mask="tel" inputmode="tel" placeholder="(81) 99999-9999"></label>
          <label class="f"><span>E-mail (opcional)</span><input data-k="cliEmail" type="email"></label></div></div>
      <div class="card"><h2>Local de carga</h2>${addrFields("col")}</div>
      <div class="card"><h2>Local de descarga</h2>${addrFields("ent")}${btn({ label: "Descarga no mesmo endereço da carga", ico: "copy", sm: true, cls: "js-copy" })}</div>
      ${distanciaHTML()}
      <div class="card"><h2>Serviços e valores</h2>
        <p class="note" style="margin-bottom:10px">Liste os serviços do orçamento com o valor de cada um. Para o frete, use a calculadora logo abaixo das linhas.</p>${servFields()}
        <div class="row" style="margin-top:10px"><label class="f"><span>Desconto (R$)</span><input data-k="desconto" data-money inputmode="decimal" placeholder="0,00"></label><span></span></div>
        <div class="tot"><div class="kpi"><small>Subtotal</small><b id="kSub">R$ 0,00</b></div><div class="kpi big"><small>Valor total</small><b id="kTot">R$ 0,00</b></div></div>
        ${calculadoraHTML()}</div>
      ${agendamentoCard(cfg, O, "A data e a hora vêm de “Data / horário previsto” do local de carga.")}
      <div class="card"><h2>Condições do orçamento</h2>
        <div class="row"><label class="f"><span>Válido até</span><input data-k="validade" type="date"></label>
          <label class="f"><span>Pagamento</span><input data-k="condPgto" list="condSug" placeholder="a combinar"></label></div>
        <p class="note">A data do serviço sai do campo “Data / horário previsto” do local de carga. Sem data, aparece “a combinar”.</p>
        <div class="row r1" style="margin-top:10px"><label class="f"><span>Observações (aparecem na imagem, se preenchidas)</span><textarea data-k="obs" rows="3"></textarea></label></div></div>
      <div class="card"><h2>Tipo de serviço (interno)</h2>${checks(TIPOS, "tipo")}<label class="f"><span>Outro: qual?</span><input data-k="tipoOutro"></label>
        <p class="note" style="margin-top:6px">Não aparece na imagem. Passa para a OS quando o orçamento for aprovado.</p></div>
      ${actions}</div>
      <div class="prev"><div class="prevwrap"><div class="prevhost" id="prevHost"></div></div></div></div>`;

  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];
  const paint = () => { syncOrc(O); pricing.refresh(); paintPreview($("#prevHost"), sheetOrc(O, cfg), ORC); $("#kSub").textContent = brl(orcSub(O)); $("#kTot").textContent = brl(totals(O).tot); };
  let raf; const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
  fillForm(view, O); bindForm(view, O, schedule); bindClientLink(view, O, { clients, orders, orcs, onChange: schedule });
  const pricing = bindPricing(view, O, cfg, { onChange: schedule, fleet: vehicles });
  bindCepAuto(view, O, { cfg, onChange: schedule }); // CEP preenchido sozinho depois de digitar o endereço
  bindEquipePag(view, O, { staff, teams: teamsFull, onChange: schedule }).sync(); // pagamento por funcionário da equipe: alimenta o custo de mão de obra
  onResize(paint);
  $$("#tabs button").forEach(b => b.addEventListener("click", () => {
    $$("#tabs button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    $(".editor").dataset.tab = b.dataset.t; requestAnimationFrame(paint);
  }));
  $(".js-copy").addEventListener("click", () => { O.ent = { ...O.col }; fillForm(view, O); schedule(); toast("Endereço de descarga copiado da carga"); });
  paint();

  let okSig = ""; // conflito já confirmado para estes mesmos dados
  const agendaOk = async () => {
    const sig = [O.col.dh, O.veiculo, O.equipe].join("|");
    if (sig === okSig) return true;
    const ok = await confirmAgenda(candOrc(O)); if (ok) okSig = sig; return ok;
  };
  async function save(quiet) {
    syncOrc(O);
    if (!O.num) { toast("Informe o número do orçamento"); return false; }
    if (!(O.veiculo || "").trim()) { toast("Escolha o veículo em “Agendamento”: o frete é calculado com o consumo e a manutenção dele."); return false; }
    if (orcs.some(o => o.num === O.num && o._id !== O._id)) { toast("Já existe um orçamento com o número " + numCurto(O.num) + "."); return false; }
    try {
      if (O.status === "aguardando" && !(await agendaOk())) return false; // orçamento enviado segura o horário
      let c = matchClient(O, clients);
      if (!c && (O.cliNome || "").trim()) {
        c = await saveItem("clients", { ...blankClient(), nome: O.cliNome.trim(), tel: O.cliTel, email: O.cliEmail });
        clients.push(c); toast("Cliente " + c.nome + " cadastrado automaticamente");
      }
      if (c) { O.clientId = c._id; const p = $("#cliPick"); if (p && !p.value) p.value = clientLabel(c); }
      const saved = await saveItem("orcamentos", O);
      O._id = saved._id; const i = orcs.findIndex(o => o._id === O._id);
      if (i >= 0) orcs[i] = saved; else orcs.push(saved);
      history.replaceState(null, "", "#/orcamentos?id=" + O._id);
      if (!quiet) toast("Orçamento " + numCurto(O.num) + " salvo");
      return true;
    } catch (e) { console.error(e); toast("Não foi possível salvar o orçamento."); return false; }
  }
  $$(".js-save").forEach(b => b.addEventListener("click", () => save()));

  const fname = ext => `${nomeArquivo("orc", O.num, O.cliNome)}.${ext}`;
  $$(".js-share").forEach(b => b.addEventListener("click", async () => {
    if (!(await save(true))) return;
    if (!(await agendaOk())) return; // ao enviar, o orçamento passa a segurar o horário
    b.disabled = true; toast("Montando a imagem do orçamento…");
    const sent = await sendOrc(O, cfg);
    if (sent && O.status === "rascunho") { O.status = "aguardando"; fillForm(view, O); await save(true); } // só marca como enviado se enviou de fato
    b.disabled = false;
  }));
  $$(".js-no").forEach(b => b.addEventListener("click", async () => { O.status = "recusado"; fillForm(view, O); if (await save(true)) toast("Orçamento marcado como recusado"); }));
  $$(".js-ok").forEach(b => b.addEventListener("click", async () => {
    if (O.osId) { location.hash = "#/ordens?id=" + O.osId; return; }
    if (!(O.cliNome || "").trim()) { toast("Informe o nome do cliente antes de aprovar."); return; }
    if (!(await confirmAgenda(candOS(orcToOS(O, 0))))) return;
    const entrada = askApprove(O); if (entrada === null) return;
    try {
      if (!(await save(true))) return;
      const r = await approveOrc(O, entrada); toast("OS " + numCurto(r.os.num) + " criada a partir do orçamento"); location.hash = "#/ordens?id=" + r.os._id;
    } catch (e) { console.error(e); toast("Não foi possível gerar a OS. Confira a lista de OS antes de tentar de novo."); }
  }));
  const exportAs = async kind => {
    if (!(await save(true))) return;
    const btns = $$(".js-pdf,.js-img"); btns.forEach(b => (b.disabled = true)); toast(kind === "pdf" ? "Gerando PDF…" : "Gerando imagem…");
    try { await (kind === "pdf" ? exportPDF : exportPNG)(sheetOrc(O, cfg), fname(kind === "pdf" ? "pdf" : "png"), ORC); }
    catch (e) { console.error(e); toast("Erro ao gerar o arquivo."); }
    btns.forEach(b => (b.disabled = false));
  };
  $$(".js-pdf").forEach(b => b.addEventListener("click", () => exportAs("pdf")));
  $$(".js-img").forEach(b => b.addEventListener("click", () => exportAs("png")));
}
