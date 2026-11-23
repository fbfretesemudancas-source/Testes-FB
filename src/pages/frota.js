// Frota: veículos, quilometragem, combustível, manutenção, documentos e despesas por veículo.
// Todo gasto vai para "despesas" (a coleção que o Painel lê), com o veículo marcado.
// #/frota lista · #/frota?novo=1 novo veículo · #/frota?id=ID&aba=manutencao ficha
import { pageHead } from "../components/pageHead.js";
import { esc, toast, today, num, money, brl, fmtD, isUrl, pad } from "../../js/utils.js";
import { listAll, saveItem, removeItem, getCfg, saveCfg, migrateFleet } from "../firebase/db.js";
import { fillForm, bindForm, options } from "../components/formKit.js";
import { btn, group, bar, armBtn } from "../components/ui.js";
import { MANUT, DESP_OUTRAS, DOC_TIPOS, COMBUSTIVEIS, INTERVALO, labelDesp, labelDoc, blankVehicle, blankDoc, consumoMedido, ultimoPreco,
  manutStatus, docStatus, avisos, gastoMes, leituras, custoPorKm, manutencaoPorKm, precoDoVeiculo } from "../../js/frota.js";
import { resumoUsos, usoCompleto, kmUso, semDevolucao, kmInvalido, custoEmpresa, consumoControlado, valorPainel } from "../../js/uso.js";

const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
const TABS = [["dados", "Dados"], ["km", "Quilometragem"], ["usos", "Usos da empresa"], ["combustivel", "Combustível"], ["manutencao", "Manutenção"], ["documentos", "Documentos"], ["despesas", "Despesas"]];
const kmTxt = n => Math.round(num(n)).toLocaleString("pt-BR") + " km";
const f1 = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
const nome = v => v.nome || v.modelo || "Sem nome";
const NIVEL = { vencido: ["Vencido", "vencido"], proximo: ["Atenção", "aguardando"], ok: ["Em dia", "concluida"], sem: ["Sem registro", ""] };
const badge = n => `<span class="badge ${NIVEL[n][1]}">${NIVEL[n][0]}</span>`;
const byDateDesc = (a, b) => (b.data || "").localeCompare(a.data || "") || (Number(b.km) || 0) - (Number(a.km) || 0);

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  const q = params();
  try { await (q.has("id") || q.has("novo") ? ficha(view, q) : list(view)); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Frota") + '<div class="banner">Não foi possível carregar a frota. Confira a conexão e as regras do Firestore.</div>'; }
}

/* ============================ LISTA ============================ */
async function list(view) {
  const criados = await migrateFleet(blankVehicle); // veículos que estavam em Configurações viram fichas
  const [vehicles, desp] = await Promise.all([listAll("vehicles"), listAll("despesas")]);
  vehicles.sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
  const mes = today().slice(0, 7), mine = v => desp.filter(d => d.veiculoId === v._id);
  const alertas = vehicles.filter(v => v.ativo !== false).flatMap(v => avisos(v, mine(v)).map(a => ({ ...a, v })));
  view.innerHTML = pageHead("Frota", "Veículos, manutenção, combustível e documentação") +
    (criados ? `<div class="banner">Importei ${criados} veículo(s) que estavam em Configurações. Abra cada ficha e complete os dados.</div>` : "") +
    bar({ left: [btn({ label: "Novo veículo", ico: "plus", kind: "pri", href: "#/frota?novo=1" })] }) +
    (alertas.length ? `<div class="card"><h2>Avisos</h2><div class="hist">${alertas.map(a => `<div class="h"><div class="n" style="font-size:16px">${esc(a.v.placa)}</div><div class="t"><b>${esc(a.texto)}</b><small>${badge(a.nivel)} ${esc(nome(a.v))}</small></div><div class="b">${btn({ label: "Resolver", ico: "wrench", sm: true, href: "#/frota?id=" + esc(a.v._id) + "&aba=" + a.aba })}</div></div>`).join("")}</div></div>` : "") +
    `<div class="hist">${vehicles.map(v => {
      const d = mine(v), med = consumoMedido(d);
      return `<div class="h"><div class="n" style="font-size:16px">${esc(v.placa)}</div>
        <div class="t"><b>${esc(nome(v))}${v.ano ? " · " + esc(v.ano) : ""}${v.ativo === false ? " (inativo)" : ""}</b>${v.compartilhado ? ' <span class="badge aguardando">Compartilhado</span>' : ""}
          <small>${v.kmAtual ? kmTxt(v.kmAtual) : "sem hodômetro"} · consumo ${v.consumo ? esc(v.consumo) + " km/L" : "não informado"}${med && !v.compartilhado ? " (medido " + f1(med.kmL) + ")" : ""} · manutenção ${v.manutencaoKm ? "R$ " + esc(v.manutencaoKm) + "/km" : "padrão"}</small></div>
        <div class="v">${brl(gastoMes(d, mes))}<br><small style="font-weight:500;color:var(--mut)">no mês</small></div>
        <div class="b">${btn({ label: "Abrir ficha", ico: "eye", sm: true, href: "#/frota?id=" + esc(v._id) })}</div></div>`;
    }).join("") || '<div class="card note">Nenhum veículo cadastrado. Toque em “Novo veículo”.</div>'}</div>`;
}

/* ============================ FICHA ============================ */
async function ficha(view, q) {
  const [vehicles, all, cfg, allUsos] = await Promise.all([listAll("vehicles"), listAll("despesas"), getCfg(), listAll("usos")]);
  let V, SV = null; // V = o que está na tela · SV = último salvo
  if (q.get("id")) {
    const r = vehicles.find(x => x._id === q.get("id"));
    if (!r) { view.innerHTML = pageHead("Frota") + '<div class="banner">Veículo não encontrado.</div><a class="btn" href="#/frota">Voltar</a>'; return; }
    SV = r; V = { ...blankVehicle(), ...r, docs: (r.docs || []).map(x => ({ ...blankDoc(), ...x })) };
  } else V = blankVehicle();
  const saved = !!V._id, hoje = today(), mes = hoje.slice(0, 7);
  let desp = saved ? all.filter(d => d.veiculoId === V._id) : [], usos = saved ? allUsos.filter(u => u.veiculoId === V._id) : [], dirty = false;
  let tab = saved && TABS.some(t => t[0] === q.get("aba")) && (q.get("aba") !== "usos" || V.compartilhado) ? q.get("aba") : "dados";
  const F = { data: hoje, valor: "", litros: "", km: "", cheio: false };
  const M = { data: hoje, tipo: "oleo", descricao: "", valor: "", km: "", proxKm: "", proxData: "", oficina: "", _manual: false };
  const X = { data: hoje, tipo: "pedagio", descricao: "", valor: "" };
  const U = { data: hoje, kmIni: "", kmFim: "", controlado: false, litros: "" }; // novo uso avulso

  const panel = (id, inner) => `<section role="tabpanel" data-panel="${id}" ${id === tab ? "" : "hidden"}>${inner}</section>`;
  const need = id => saved ? `<div id="${id}"></div>` : '<div class="card"><p class="note">Salve os dados do veículo primeiro para usar esta aba.</p></div>';
  view.innerHTML = pageHead(saved ? V.placa + " — " + nome(V) : "Novo veículo", "Ficha do veículo") + `
    ${bar({ left: [group(btn({ label: "Salvar ficha", ico: "save", kind: "pri", cls: "js-save" })), '<span class="dirty" id="dirty" hidden>● Alterações não salvas</span>'],
      right: [saved && btn({ label: "Excluir veículo", ico: "trash", kind: "danger", cls: "js-del" }), btn({ label: "Voltar à frota", ico: "arrowLeft", href: "#/frota" })].filter(Boolean) })}
    ${saved ? '<div id="sum"></div>' : ""}
    <div class="cfgtabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}" ${k === "usos" && !V.compartilhado ? "hidden" : ""}>${l}</button>`).join("")}</div>` +
    panel("dados", `<div id="pDados"><div class="card"><h2>Veículo</h2>
      <div class="row"><label class="f"><span>Placa</span><input data-k="placa" data-mask="placa" placeholder="ABC1D23" autocomplete="off"></label><label class="f"><span>Apelido</span><input data-k="nome" placeholder="Ex.: Strada branca"></label></div>
      <div class="row"><label class="f"><span>Modelo</span><input data-k="modelo" placeholder="Ex.: Fiat Strada Freedom"></label><label class="f"><span>Ano</span><input data-k="ano" data-mask="ano" inputmode="numeric" placeholder="2023"></label></div>
      <div class="row"><label class="f"><span>Combustível</span><select data-k="combustivel">${options(COMBUSTIVEIS)}</select></label><label class="chk" style="align-self:end"><input type="checkbox" data-k="ativo"> Veículo ativo (aparece na agenda e nas OS)</label></div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" data-k="compartilhado"> Veículo compartilhado (usado também fora dos serviços)</label>
      <p class="note" style="margin:4px 0 0">Liga o registro do km ao retirar e ao devolver (no checklist da OS e na aba Usos da empresa) e o rateio dos gastos de manutenção e documentos no Painel.</p></div>
      <div class="card"><h2>Custos usados no preço dos fretes</h2>
        <p class="note" style="margin-bottom:10px">O orçamento usa estes valores quando este veículo é escolhido. Em branco, vale o padrão das Configurações.</p>
        <div class="row"><label class="f"><span>Consumo (km por litro) · obrigatório</span><input data-k="consumo" inputmode="decimal" placeholder="ex.: 10"></label>
          <label class="f"><span>Manutenção (R$ por km) · obrigatório</span><input data-k="manutencaoKm" data-money inputmode="decimal" placeholder="ex.: 0,50"></label></div>
        <p class="note">Consumo e manutenção por km entram no cálculo do frete dos orçamentos (pneus, óleo, revisões e peças contam na manutenção). Use 0,00 na manutenção se não quiser cobrar.</p><div id="refs"></div></div>
      <div class="card"><h2>Observações</h2><div class="row r1"><label class="f"><span>Anotações sobre o veículo</span><textarea data-k="obs" rows="3"></textarea></label></div></div></div>`) +
    panel("km", need("pKm")) + panel("usos", need("pUsos")) + panel("combustivel", need("pFuel")) + panel("manutencao", need("pManut")) + panel("documentos", need("pDocs")) + panel("despesas", need("pDesp"));

  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];
  const markDirty = () => { dirty = true; $("#dirty").hidden = false; };
  const show = id => { tab = id; $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== id; }); $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    history.replaceState(null, "", "#/frota?id=" + (V._id || "") + "&aba=" + id); };
  const own = () => desp; // despesas deste veículo
  const precoV = () => precoDoVeiculo(cfg.preco, V).preco;
  const syncTabs = () => { const b = $('[data-tab="usos"]'); if (b) b.hidden = !V.compartilhado; if (!V.compartilhado && tab === "usos") show("dados"); };

  /* ---------- peças de cada aba ---------- */
  function drawSummary() {
    if (!saved) return;
    const sh = !!V.compartilhado, med = sh ? null : consumoMedido(own()), cpk = sh ? null : custoPorKm(own()), R = resumoUsos(usos), ce = custoEmpresa(R.km, precoV());
    $("#sum").innerHTML = `<div class="kpis"><div class="kpi big"><small>Quilometragem</small><b>${V.kmAtual ? kmTxt(V.kmAtual) : "—"}</b></div>
      <div class="kpi"><small>Consumo usado no preço</small><b>${V.consumo ? esc(V.consumo) + " km/L" : "—"}</b><em>${V.consumo ? "da ficha" : "preencha na ficha"}${med ? " · medido " + f1(med.kmL) : ""}</em></div>
      <div class="kpi"><small>Gasto no mês</small><b>${brl(gastoMes(own(), mes))}</b></div>
      ${sh ? `<div class="kpi"><small>Custo por km da empresa</small><b>${ce.porKm != null ? brl(ce.porKm) : "—"}</b><em>consumo e manutenção da ficha</em></div>
        <div class="kpi"><small>Uso da empresa</small><b>${R.parcela != null ? Math.round(R.parcela * 100) + "%" : "—"}</b><em>${R.parcela != null ? kmTxt(R.km) + " de " + kmTxt(R.total) : "precisa de 2 usos completos"}</em></div>`
        : `<div class="kpi"><small>Custo por km (estimado)</small><b>${cpk != null ? brl(cpk) : "—"}</b><em>${cpk != null ? "gastos ÷ km rodados" : "precisa de 2 leituras de km"}</em></div>`}</div>`;
  }
  function drawRefs() {
    if (!saved) return;
    if (V.compartilhado) { // abastecimentos e km de outras pessoas distorcem o consumo medido e o custo por km
      const cc = consumoControlado(usos);
      $("#refs").innerHTML = '<p class="note"><b>Veículo compartilhado.</b> O consumo medido pelos abastecimentos e o custo por km não são confiáveis aqui, porque há abastecimentos e km de outras pessoas. Use consumo e manutenção fixos na ficha.</p>' +
        (cc ? `<p class="note">Consumo medido nos usos controlados da empresa: <b>${f1(cc.kmL)} km/L</b> (${cc.n} uso(s), ${Math.round(cc.dist)} km). ${btn({ label: "Usar este valor", ico: "check", sm: true, attrs: 'data-act="use-consumo-ctrl"' })}</p>`
          : '<p class="note">Para medir o consumo com segurança, marque “Medir consumo” em um uso (tanque cheio ao retirar e ao devolver) na aba Usos da empresa ou no checklist.</p>');
      return;
    }
    const med = consumoMedido(own()), mpk = manutencaoPorKm(own());
    $("#refs").innerHTML = (med ? `<p class="note">Consumo medido nos abastecimentos com tanque cheio: <b>${f1(med.kmL)} km/L</b> (${Math.round(med.dist)} km, ${f1(med.litros)} L). ${btn({ label: "Usar este valor", ico: "check", sm: true, attrs: 'data-act="use-consumo"' })}</p>`
      : '<p class="note">Consumo medido: indisponível. Precisa de dois abastecimentos com tanque cheio e hodômetro.</p>') +
      (mpk != null ? `<p class="note">Manutenção real por km rodado: <b>R$ ${money(mpk)}</b> (estimativa dos registros). ${btn({ label: "Usar este valor", ico: "check", sm: true, attrs: 'data-act="use-manut"' })}</p>`
      : '<p class="note">Manutenção real por km: indisponível. Precisa de registros com hodômetro.</p>');
  }
  function drawKm() {
    if (!saved) return;
    const L = leituras(own()), reads = own().filter(r => num(r.km) > 0).sort((a, b) => num(b.km) - num(a.km)).slice(0, 30);
    $("#pKm").innerHTML = `<div class="card"><h2>Hodômetro</h2><div class="row"><label class="f"><span>Quilometragem atual (km)</span><input data-k="kmAtual" data-mask="km" inputmode="numeric"></label><span></span></div>
      <div class="actions">${btn({ label: "Salvar quilometragem", ico: "save", kind: "pri", attrs: 'data-act="save-km"' })}</div>
      <p class="note" style="margin-top:8px">Abastecimentos e manutenções com hodômetro também atualizam este valor.</p></div>
      <div class="card"><h2>Leituras</h2>${L ? `<p class="note" style="margin-bottom:8px">Rodados entre a primeira e a última leitura: <b>${kmTxt(L.rod)}</b>.</p>` : '<p class="note" style="margin-bottom:8px">Registre o hodômetro em abastecimentos e manutenções para acompanhar os km rodados.</p>'}
      <div class="used">${reads.map(r => `<div>${esc(fmtD(r.data))} · <b>${kmTxt(r.km)}</b> <small>(${esc(labelDesp(r.tipo))})</small></div>`).join("") || "<div><small>Nenhuma leitura ainda.</small></div>"}</div></div>`;
    fillForm($("#pKm"), V);
  }
  const fuelRow = r => `<div class="h"><div class="n" style="font-size:15px">${esc(fmtD(r.data))}</div><div class="t"><b>${brl(num(r.valor))}${num(r.litros) > 0 ? " · " + f1(num(r.litros)) + " L" : ""}</b>
    <small>${num(r.litros) > 0 ? "R$ " + money(num(r.valor) / num(r.litros)) + "/L" : "litros não informados"}${num(r.km) > 0 ? " · " + kmTxt(r.km) : ""}${r.cheio ? " · tanque cheio" : ""}</small></div><div class="v"></div>
    <div class="b">${btn({ ico: "trash", tip: "Excluir lançamento", kind: "danger", sm: true, iconOnly: true, attrs: 'data-act="del" data-id="' + esc(r._id) + '"' })}</div></div>`;
  function drawFuel() {
    if (!saved) return;
    const fuel = own().filter(r => r.tipo === "combustivel").sort(byDateDesc), up = ultimoPreco(fuel), med = consumoMedido(fuel);
    $("#pFuel").innerHTML = `<div class="card"><h2>Novo abastecimento</h2>
      <p class="note" style="margin-bottom:10px">${V.compartilhado ? "Veículo compartilhado: lance só os abastecimentos pagos pela empresa. O consumo é medido na aba Usos da empresa." : "Pode registrar só o valor (e os litros, se souber). O consumo medido só aparece com dois tanques cheios e o hodômetro."}</p>
      <div class="row"><label class="f"><span>Data</span><input data-k="data" type="date"></label><label class="f"><span>Valor pago (R$)</span><input data-k="valor" data-money inputmode="decimal" placeholder="0,00"></label></div>
      <div class="row"><label class="f"><span>Litros (opcional)</span><input data-k="litros" inputmode="decimal"></label><label class="f"><span>Hodômetro (km, opcional)</span><input data-k="km" data-mask="km" inputmode="numeric"></label></div>
      <label class="chk"><input type="checkbox" data-k="cheio"> Encheu o tanque</label><p class="note" id="fuelPreco" style="margin:6px 0"></p>
      <div class="actions">${btn({ label: "Registrar abastecimento", ico: "plus", kind: "pri", attrs: 'data-act="fuel-add"' })}</div></div>
      <div class="card"><h2>Resumo</h2>${up ? `<p class="note">Último preço pago: <b>R$ ${money(up.preco)}/L</b> em ${esc(fmtD(up.data))}. Preço padrão das Configurações: R$ ${esc(cfg.preco.combustivel)}. ${btn({ label: "Usar como preço padrão", ico: "check", sm: true, attrs: 'data-act="use-preco"' })}</p>` : '<p class="note">Registre abastecimentos com litros para ver o preço por litro.</p>'}
      <p class="note" style="margin-top:6px">${V.compartilhado ? "Consumo medido: não se aplica a veículo compartilhado (veja a aba Usos da empresa)." : med ? `Consumo medido: <b>${f1(med.kmL)} km/L</b>.` : "Consumo medido: indisponível."}</p></div>
      <div class="card"><h2>Abastecimentos</h2><div class="hist">${fuel.map(fuelRow).join("") || '<p class="note">Nenhum abastecimento registrado.</p>'}</div></div>`;
    fillForm($("#pFuel"), F); fuelPreco();
  }
  const fuelPreco = () => { const el = $("#fuelPreco"); if (el) el.textContent = num(F.litros) > 0 && num(F.valor) > 0 ? "Preço por litro: R$ " + money(num(F.valor) / num(F.litros)) : ""; };
  function drawMaint() {
    if (!saved) return;
    const kmAtual = Math.round(num(V.kmAtual)), hist = own().filter(r => MANUT.some(m => m[0] === r.tipo)).sort(byDateDesc);
    const cards = MANUT.slice(0, 4).map(([t, l]) => {
      const s = manutStatus(own(), t, kmAtual, hoje);
      const txt = s.nivel === "sem" ? "Sem registro" : s.proxKm != null && s.falta != null ? (s.falta > 0 ? "Faltam " + s.falta.toLocaleString("pt-BR") + " km" : "Passou " + (-s.falta).toLocaleString("pt-BR") + " km") : s.dias != null ? (s.dias >= 0 ? "Em " + s.dias + " dia(s)" : "Atrasada " + (-s.dias) + " dia(s)") : "Registrada";
      return `<div class="kpi"><small>${l}</small><b style="font-size:18px">${txt}</b><em>${s.ultimo ? "Última: " + esc(fmtD(s.ultimo.data)) + (num(s.ultimo.km) > 0 ? " em " + kmTxt(s.ultimo.km) : "") + (s.proxKm ? " · próxima: " + kmTxt(s.proxKm) : "") : "Registre a primeira abaixo"}</em>${badge(s.nivel)}</div>`;
    }).join("");
    $("#pManut").innerHTML = `<div class="kpis">${cards}</div>
      <div class="card"><h2>Registrar manutenção</h2>
        <div class="row"><label class="f"><span>Data</span><input data-k="data" type="date"></label><label class="f"><span>Tipo</span><select data-k="tipo">${options(MANUT)}</select></label></div>
        <div class="row"><label class="f"><span>Valor (R$)</span><input data-k="valor" data-money inputmode="decimal" placeholder="0,00"></label><label class="f"><span>Hodômetro (km)</span><input data-k="km" data-mask="km" inputmode="numeric"></label></div>
        <div class="row"><label class="f"><span>Próxima em (km)</span><input data-k="proxKm" data-mask="km" inputmode="numeric"></label><label class="f"><span>Ou próxima em (data)</span><input data-k="proxData" type="date"></label></div>
        <div class="row"><label class="f"><span>Descrição</span><input data-k="descricao" placeholder="Ex.: óleo 5W30 + filtro"></label><label class="f"><span>Oficina</span><input data-k="oficina"></label></div>
        <p class="note">A próxima troca é sugerida pelo tipo (óleo: +5.000 km, pneus: +40.000 km, revisão: +10.000 km). Ajuste se precisar.</p>
        <div class="actions" style="margin-top:8px">${btn({ label: "Registrar manutenção", ico: "plus", kind: "pri", attrs: 'data-act="maint-add"' })}</div></div>
      <div class="card"><h2>Histórico de manutenção</h2><div class="hist">${hist.map(r => `<div class="h"><div class="n" style="font-size:15px">${esc(fmtD(r.data))}</div><div class="t"><b>${esc(labelDesp(r.tipo))} · ${brl(num(r.valor))}</b>
        <small>${esc(r.descricao || "")}${num(r.km) > 0 ? " · " + kmTxt(r.km) : ""}${r.oficina ? " · " + esc(r.oficina) : ""}${num(r.proxKm) > 0 ? " · próxima: " + kmTxt(r.proxKm) : ""}</small></div><div class="v"></div>
        <div class="b">${btn({ ico: "trash", tip: "Excluir lançamento", kind: "danger", sm: true, iconOnly: true, attrs: 'data-act="del" data-id="' + esc(r._id) + '"' })}</div></div>`).join("") || '<p class="note">Nenhuma manutenção registrada.</p>'}</div></div>`;
    fillForm($("#pManut"), M);
  }
  function drawDocs() {
    if (!saved) return;
    $("#pDocs").innerHTML = `<div class="card"><h2>Seguro e documentos</h2>
      <p class="note" style="margin-bottom:10px">Controle de vencimentos. “Quem paga” = outra pessoa não entra em despesas nem no custo do frete.</p>
      ${V.docs.map((d, i) => { const s = docStatus(d, hoje); return `<div class="docrow">
        <label class="f"><span>Tipo</span><select data-k="docs.${i}.tipo">${options(DOC_TIPOS)}</select></label>
        <label class="f"><span>Descrição</span><input data-k="docs.${i}.descricao" placeholder="Ex.: Porto Seguro"></label>
        <label class="f"><span>Vencimento</span><input data-k="docs.${i}.vencimento" type="date"></label>
        <label class="f"><span>Valor (R$)</span><input data-k="docs.${i}.valor" data-money inputmode="decimal" placeholder="0,00"></label>
        <label class="f"><span>Quem paga</span><select data-k="docs.${i}.pagoPor"><option value="outro">Outra pessoa</option><option value="empresa">Empresa</option></select></label>
        <label class="f"><span>Link do arquivo</span><input data-k="docs.${i}.link" inputmode="url" placeholder="https://…"></label>
        <div><div style="margin-bottom:6px">${badge(s.nivel)}${s.dias != null ? ` <small>${s.dias >= 0 ? "em " + s.dias + " dia(s)" : "há " + (-s.dias) + " dia(s)"}</small>` : ""}</div>
          <div class="actions">${btn({ label: "Abrir arquivo", ico: "external", sm: true, attrs: 'data-open="' + i + '"' })}${d.pagoPor === "empresa" && num(d.valor) > 0 ? `${btn({ label: "Lançar como despesa", ico: "dollar", kind: "ok", sm: true, attrs: 'data-act="doc-desp" data-i="' + i + '"' })}` : ""}${btn({ label: "Remover", ico: "trash", kind: "danger", sm: true, attrs: 'data-rm="' + i + '"' })}</div></div></div>`; }).join("") || '<p class="note">Nenhum documento cadastrado.</p>'}
      ${btn({ label: "Adicionar documento", ico: "plus", sm: true, attrs: 'data-add="doc"' })}
      <p class="note" style="margin-top:8px">Guarde o arquivo no Google Drive ou similar e cole o link de compartilhamento. Lembre de tocar em “Salvar ficha”.</p></div>`;
    fillForm($("#pDocs"), V);
  }
  function drawDesp() {
    if (!saved) return;
    const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); });
    const porTipo = {}; own().forEach(r => { porTipo[r.tipo] = (porTipo[r.tipo] || 0) + num(r.valor); });
    $("#pDesp").innerHTML = `<div class="card"><h2>Gastos por mês</h2><div class="used">${meses.map(k => `<div>${k.slice(5)}/${k.slice(0, 4)}: <b>${brl(gastoMes(own(), k))}</b></div>`).join("")}</div>
      <div class="sub">Por tipo (todo o período)</div><div class="used">${Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => `<div>${esc(labelDesp(t))}: <b>${brl(v)}</b></div>`).join("") || "<div><small>Nenhuma despesa ainda.</small></div>"}</div></div>
      <div class="card"><h2>Outra despesa deste veículo</h2>
        <div class="row"><label class="f"><span>Data</span><input data-k="data" type="date"></label><label class="f"><span>Tipo</span><select data-k="tipo">${options(DESP_OUTRAS)}</select></label></div>
        <div class="row"><label class="f"><span>Descrição</span><input data-k="descricao"></label><label class="f"><span>Valor (R$)</span><input data-k="valor" data-money inputmode="decimal" placeholder="0,00"></label></div>
        <div class="actions">${btn({ label: "Registrar despesa", ico: "plus", kind: "pri", attrs: 'data-act="desp-add"' })}</div>
        <p class="note" style="margin-top:8px">Combustível e manutenção são registrados nas suas abas. Todas as despesas aparecem no Painel.</p></div>
      <div class="card"><h2>Lançamentos</h2><div class="hist">${[...own()].sort(byDateDesc).slice(0, 60).map(r => `<div class="h"><div class="n" style="font-size:15px">${esc(fmtD(r.data))}</div><div class="t"><b>${esc(labelDesp(r.tipo))} · ${brl(num(r.valor))}</b><small>${esc(r.descricao || "")}</small></div><div class="v"></div>
        <div class="b">${btn({ ico: "trash", tip: "Excluir lançamento", kind: "danger", sm: true, iconOnly: true, attrs: 'data-act="del" data-id="' + esc(r._id) + '"' })}</div></div>`).join("") || '<p class="note">Nenhum lançamento.</p>'}</div></div>`;
    fillForm($("#pDesp"), X);
  }
  const usoRow = u => {
    const ok = usoCompleto(u), inval = kmInvalido(u), pend = semDevolucao(u);
    const origem = u.origem === "checklist" ? `Checklist da OS ${esc(pad(u.osNum || 0))}${u.cliNome ? " · " + esc(u.cliNome) : ""}` : "Registro avulso";
    const flag = inval ? '<span class="badge vencido">km de devolução menor que o de retirada</span>' : pend ? '<span class="badge aguardando">falta o km de devolução</span>' : "";
    const acao = u.origem === "checklist"
      ? (u.osId ? `${btn({ label: "Abrir checklist", ico: "clipboard", sm: true, href: "#/checklist?os=" + esc(u.osId) })}` : "")
      : `${ok ? "" : `${btn({ label: "Informar devolução", ico: "undo", sm: true, attrs: 'data-act="uso-fim" data-id="' + esc(u._id) + '"' })}`}${btn({ ico: "trash", tip: "Excluir uso", kind: "danger", sm: true, iconOnly: true, attrs: 'data-act="uso-del" data-id="' + esc(u._id) + '"' })}`;
    return `<div class="h"><div class="n" style="font-size:15px">${esc(fmtD(u.data))}</div><div class="t"><b>${ok ? kmTxt(kmUso(u)) + " rodados" : "Uso em aberto"} <small style="font-weight:500">(${num(u.kmIni) > 0 ? kmTxt(u.kmIni) : "—"} → ${num(u.kmFim) > 0 ? kmTxt(u.kmFim) : "—"})</small></b>
      <small>${origem}${u.controlado ? " · consumo medido" + (num(u.litros) > 0 ? " (" + f1(num(u.litros)) + " L)" : "") : ""} ${flag}</small></div><div class="v"></div><div class="b">${acao}</div></div>`;
  };
  function drawUsos() {
    const box = $("#pUsos"); if (!box) return;
    if (!V.compartilhado) { box.innerHTML = ""; return; }
    const R = resumoUsos(usos), ce = custoEmpresa(R.km, precoV()), cc = consumoControlado(usos);
    const mesDesp = own().filter(d => (d.data || "").startsWith(mes)), tot = mesDesp.reduce((x, d) => x + num(d.valor), 0), painel = mesDesp.reduce((x, d) => x + valorPainel(d, { [V._id]: V }, { [V._id]: R.parcela }), 0);
    const sorted = [...usos].sort((a, b) => (b.data || "").localeCompare(a.data || "") || num(b.kmIni) - num(a.kmIni));
    box.innerHTML = `<div class="card"><h2>Uso da empresa neste veículo</h2>
      <div class="kpis"><div class="kpi"><small>Km da empresa</small><b>${kmTxt(R.km)}</b><em>${R.completos} uso(s) completo(s)</em></div>
        <div class="kpi"><small>Total rodado no período</small><b>${R.total ? kmTxt(R.total) : "—"}</b><em>do menor ao maior hodômetro anotado</em></div>
        <div class="kpi"><small>Parcela de uso da empresa</small><b>${R.parcela != null ? Math.round(R.parcela * 100) + "%" : "—"}</b></div>
        <div class="kpi"><small>Custo estimado da empresa</small><b>${brl(ce.total)}</b><em>${brl(ce.combustivel)} combustível + ${brl(ce.manutencao)} manutenção</em></div></div>
      <p class="note" style="margin-top:8px">${R.parcela != null ? `Manutenção e documentos pagos pela empresa entram no Painel na proporção de <b>${Math.round(R.parcela * 100)}%</b>. Combustível e as demais despesas entram como foram lançados.` : "A parcela aparece com pelo menos 2 usos completos (km ao retirar e ao devolver). Até lá, todos os gastos entram inteiros no Painel."}</p>
      <p class="note" style="margin:4px 0 0">Neste mês: lançado ${brl(tot)} · entra no Painel ${brl(painel)}. O custo estimado usa o consumo e a manutenção por km da ficha e o preço do combustível das Configurações (a mesma conta do orçamento).</p>
      ${R.semDev ? `<p class="note" style="margin:4px 0 0;color:var(--red)">${R.semDev} uso(s) sem o km de devolução: eles ainda não entram na conta.</p>` : ""}</div>
      <div class="card"><h2>Registrar um uso avulso</h2><p class="note" style="margin-bottom:10px">Os usos de serviços vêm sozinhos do checklist da OS. Use este formulário para um uso sem OS.</p>
        <div class="row"><label class="f"><span>Data</span><input data-k="data" type="date"></label><label class="f"><span>Km ao retirar</span><input data-k="kmIni" data-mask="km" inputmode="numeric"></label></div>
        <div class="row"><label class="f"><span>Km ao devolver</span><input data-k="kmFim" data-mask="km" inputmode="numeric"></label><label class="f"><span>Litros abastecidos ao devolver</span><input data-k="litros" inputmode="decimal" placeholder="só se mediu o consumo"></label></div>
        <label class="chk"><input type="checkbox" data-k="controlado"> Medir consumo neste uso (tanque cheio ao retirar e ao devolver)</label>
        <div class="actions">${btn({ label: "Registrar uso", ico: "plus", kind: "pri", attrs: 'data-act="uso-add"' })}</div></div>
      ${cc ? `<div class="card"><h2>Consumo medido nos usos controlados</h2><p class="note">${f1(cc.kmL)} km/L (${cc.n} uso(s), ${Math.round(cc.dist)} km, ${f1(cc.litros)} L). ${btn({ label: "Usar este valor na ficha", ico: "check", sm: true, attrs: 'data-act="use-consumo-ctrl"' })}</p></div>` : ""}
      <div class="card"><h2>Usos registrados</h2><div class="hist">${sorted.slice(0, 40).map(usoRow).join("") || '<p class="note">Nenhum uso registrado ainda.</p>'}</div></div>`;
    fillForm(box, U);
  }
  const redraw = () => { drawSummary(); drawRefs(); drawKm(); drawFuel(); drawMaint(); drawDesp(); drawUsos(); };

  /* ---------- ligações ---------- */
  fillForm($("#pDados"), V);
  bindForm($("#pDados"), V, k => { markDirty(); if (k === "compartilhado") { syncTabs(); if (saved) { drawSummary(); drawRefs(); drawFuel(); drawUsos(); } } });
  if (saved) {
    bindForm($("#pKm"), V, () => markDirty()); bindForm($("#pDocs"), V, () => markDirty());
    bindForm($("#pFuel"), F, k => { if (k === "valor" || k === "litros") fuelPreco(); });
    bindForm($("#pManut"), M, k => {
      if (k === "proxKm") M._manual = true;
      else if ((k === "km" || k === "tipo") && !M._manual) { const iv = INTERVALO[M.tipo]; M.proxKm = num(M.km) > 0 && iv ? String(Math.round(num(M.km)) + iv) : ""; fillForm($("#pManut"), M); }
    });
    bindForm($("#pDesp"), X, () => {}); bindForm($("#pUsos"), U, () => {});
    redraw();
  }

  async function saveVehicle() {
    if (!(V.placa || "").trim()) { show("dados"); toast("Informe a placa do veículo."); return false; }
    if (vehicles.some(x => x._id !== V._id && x.placa === V.placa.trim())) { show("dados"); toast("Já existe um veículo com esta placa."); return false; }
    if (!(num(V.consumo) > 0)) { show("dados"); toast("Informe o consumo do veículo (km por litro): ele entra no cálculo do frete."); return false; }
    if (!String(V.manutencaoKm == null ? "" : V.manutencaoKm).trim()) { show("dados"); toast("Informe a manutenção do veículo (R$ por km, pode ser 0,00): ela entra no cálculo do frete."); return false; }
    const bad = V.docs.find(d => (d.link || "").trim() && !isUrl(d.link)); if (bad) { show("documentos"); toast("Link inválido: " + bad.link); return false; }
    const rec = { ...V, placa: V.placa.trim(), docs: V.docs.filter(d => (d.descricao || "").trim() || d.vencimento || num(d.valor) || (d.link || "").trim()).map(d => ({ ...d, link: (d.link || "").trim() })) };
    try {
      SV = await saveItem("vehicles", rec); V.docs = rec.docs; V._id = SV._id; dirty = false; $("#dirty").hidden = true;
      if (!saved) { toast("Veículo salvo"); location.hash = "#/frota?id=" + SV._id; return true; } // abre a ficha completa
      drawSummary(); drawDocs(); toast("Ficha salva"); return true;
    } catch (e) { console.error(e); toast("Não foi possível salvar a ficha."); return false; }
  }
  /** Hodômetro novo (de um abastecimento ou manutenção) atualiza só a quilometragem, sem salvar edições soltas da ficha. */
  async function bumpKm(km) {
    if (!(num(km) > num(V.kmAtual))) return;
    const v = String(Math.round(num(km))); SV = await saveItem("vehicles", { ...SV, kmAtual: v }); V.kmAtual = v;
  }
  const addDespesa = async rec => { const s = await saveItem("despesas", { ...rec, veiculoId: V._id, veiculo: V.placa }); desp.push(s); return s; };

  $$(".js-save").forEach(b => b.addEventListener("click", saveVehicle));
  $$(".js-del").forEach(b => b.addEventListener("click", async () => {
    if (!armBtn(b)) return;
    try { await removeItem("vehicles", V._id); toast("Veículo excluído. Os lançamentos dele foram mantidos."); location.hash = "#/frota"; }
    catch (e) { console.error(e); toast("Não foi possível excluir."); }
  }));

  view.addEventListener("click", async e => {
    const c = sel => e.target.closest && e.target.closest(sel), t = c("[data-tab]"), a = c("[data-act]");
    if (t) return show(t.dataset.tab);
    const ad = c("[data-add]"), rm = c("[data-rm]"), op = c("[data-open]");
    if (ad) { V.docs.push(blankDoc()); drawDocs(); markDirty(); return; }
    if (rm) { V.docs.splice(Number(rm.dataset.rm), 1); drawDocs(); markDirty(); return; }
    if (op) { const u = (V.docs[Number(op.dataset.open)] || {}).link; if (isUrl(u)) window.open(u.trim(), "_blank", "noopener"); else toast("Cole um link válido (começando com https://)"); return; }
    if (!a) return;
    const act = a.dataset.act;
    try {
      if (act === "save-km") await saveVehicle();
      if (act === "use-consumo") { const m = consumoMedido(own()); if (m) { V.consumo = f1(m.kmL); fillForm($("#pDados"), V); markDirty(); drawSummary(); toast("Consumo medido colocado na ficha. Salve para confirmar."); } }
      if (act === "use-manut") { const m = manutencaoPorKm(own()); if (m != null) { V.manutencaoKm = money(m); fillForm($("#pDados"), V); markDirty(); toast("Manutenção por km colocada na ficha. Salve para confirmar."); } }
      if (act === "use-preco") { const up = ultimoPreco(own()); if (up) { await saveCfg({ preco: { combustivel: money(up.preco) } }); cfg.preco.combustivel = money(up.preco); drawFuel(); toast("Preço do combustível das Configurações atualizado para R$ " + money(up.preco) + "/L"); } }
      if (act === "fuel-add") {
        if (!(num(F.valor) > 0)) { toast("Informe o valor pago."); return; }
        const l = num(F.litros);
        await addDespesa({ tipo: "combustivel", data: F.data || hoje, valor: money(F.valor), litros: l > 0 ? String(F.litros).trim() : "", preco: l > 0 ? money(num(F.valor) / l) : "", km: F.km || "", cheio: !!F.cheio, descricao: "Abastecimento" + (l > 0 ? " de " + f1(l) + " L" : "") });
        await bumpKm(F.km); Object.assign(F, { valor: "", litros: "", km: "", cheio: false }); redraw(); toast("Abastecimento registrado");
      }
      if (act === "maint-add") {
        if (!M.data) { toast("Informe a data."); return; }
        await addDespesa({ tipo: M.tipo, data: M.data, valor: money(M.valor || 0), km: M.km || "", proxKm: M.proxKm || "", proxData: M.proxData || "", oficina: M.oficina || "", descricao: M.descricao || labelDesp(M.tipo) });
        await bumpKm(M.km); Object.assign(M, { descricao: "", valor: "", km: "", proxKm: "", proxData: "", oficina: "", _manual: false }); redraw(); toast("Manutenção registrada");
      }
      if (act === "desp-add") {
        if (!(num(X.valor) > 0)) { toast("Informe o valor."); return; }
        await addDespesa({ tipo: X.tipo, data: X.data || hoje, valor: money(X.valor), descricao: X.descricao || labelDesp(X.tipo) });
        Object.assign(X, { descricao: "", valor: "" }); redraw(); toast("Despesa registrada");
      }
      if (act === "doc-desp") {
        const d = V.docs[Number(a.dataset.i)];
        if (!d || d.pagoPor !== "empresa" || !(num(d.valor) > 0)) { toast("Só dá para lançar documentos pagos pela empresa e com valor."); return; }
        if (!window.confirm(`Lançar ${brl(num(d.valor))} como despesa de hoje?`)) return;
        await addDespesa({ tipo: d.tipo === "outro" ? "outros" : d.tipo, data: hoje, valor: money(d.valor), descricao: labelDoc(d) + " (pagamento)" }); redraw(); toast("Despesa lançada");
      }
      if (act === "use-consumo-ctrl") { const m = consumoControlado(usos); if (m) { V.consumo = f1(m.kmL); fillForm($("#pDados"), V); markDirty(); drawSummary(); toast("Consumo medido colocado na ficha. Salve para confirmar."); } }
      if (act === "uso-add") {
        const a0 = Math.round(num(U.kmIni)), b0 = Math.round(num(U.kmFim));
        if (!(a0 > 0)) { toast("Informe o km ao retirar o veículo."); return; }
        if (b0 > 0 && b0 <= a0) { toast("O km ao devolver precisa ser maior que o km ao retirar."); return; }
        const sv = await saveItem("usos", { veiculoId: V._id, veiculo: V.placa, data: U.data || hoje, kmIni: String(a0), kmFim: b0 > 0 ? String(b0) : "", controlado: !!U.controlado, litros: U.litros || "", origem: "avulso" });
        usos.push(sv); await bumpKm(b0 > 0 ? b0 : a0); Object.assign(U, { kmIni: "", kmFim: "", controlado: false, litros: "" }); redraw(); toast("Uso registrado");
      }
      if (act === "uso-fim") {
        const u = usos.find(x => x._id === a.dataset.id); if (!u) return;
        const v = Math.round(num(window.prompt("Km no hodômetro ao devolver o veículo:") || ""));
        if (!(v > num(u.kmIni))) { toast("Informe um km maior que o da retirada."); return; }
        const sv = await saveItem("usos", { ...u, kmFim: String(v) }); usos = usos.map(x => (x._id === sv._id ? sv : x)); await bumpKm(v); redraw(); toast("Devolução registrada");
      }
      if (act === "uso-del") {
        if (!window.confirm("Excluir este uso?")) return;
        await removeItem("usos", a.dataset.id); usos = usos.filter(x => x._id !== a.dataset.id); redraw(); toast("Uso excluído");
      }
      if (act === "del") {
        if (!window.confirm("Excluir este lançamento?")) return;
        await removeItem("despesas", a.dataset.id); desp = desp.filter(d => d._id !== a.dataset.id); redraw(); toast("Lançamento excluído");
      }
    } catch (err) { console.error(err); toast("Não foi possível concluir a ação."); }
  });
}
