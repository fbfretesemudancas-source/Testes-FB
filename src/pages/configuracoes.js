// Configurações em abas: empresa e PIX, ponto de partida e rotas, custos e preço, mensagens do WhatsApp.
// Tudo fica em companies/{uid}/private/settings (campo "cfg") e vale para todo o sistema.
import { pageHead } from "../components/pageHead.js";
import { esc, toast, num, brl } from "../../js/utils.js";
import { getCfg, saveCfg } from "../firebase/db.js";
import { DEFAULT_MSG, MSG_VARS, renderTpl, calcPreco } from "../../js/domain.js";
import { fillForm, bindForm, getP } from "../components/formKit.js";
import { btn, group, bar } from "../components/ui.js";
import { geocode, hasAddr, parseCoord, PRECISAO, googleRoute, googleErro } from "../../js/geo.js";

// [caminho, rótulo, tipo (money | tel | num), dica]
const EMPRESA = [["empresa", "Nome da empresa (usado nas mensagens)"], ["tel", "Telefone / WhatsApp", "tel"], ["ig", "Instagram (sem @)"], ["email", "E-mail"],
  ["regiao", "Região de atendimento"], ["cidade", "Cidade / UF"], ["pixKey", "Chave PIX"], ["pixNome", "Nome do recebedor (PIX)"], ["pixCidade", "Cidade do recebedor (PIX)"],
  ["waUrl", "Link do WhatsApp (QR da OS)"], ["reviewUrl", "Link de avaliação no Google (QR da OS)"]];
const BASE = [["base.rua", "Rua / Avenida"], ["base.num", "Nº"], ["base.bairro", "Bairro"], ["base.cidade", "Cidade"], ["base.uf", "Estado (UF), ex.: PE", "", "Usado para achar o CEP automaticamente nos orçamentos e OS. Se a cidade do cliente vier com o estado (ex.: Olinda - PE), vale o dela."]];
const BASE_COORD = [["base.coord", "Coordenadas ou link do Google Maps (opcional, deixa o ponto exato)", "", "No Google Maps, clique com o botão direito na sua casa e toque nos números que aparecem para copiar. Se preencher, vale mais que o endereço."]];
const ROTAS = [["rotas.folga", "Folga sobre a distância calculada (%)", "num", "Cobre desvios e diferenças entre o mapa e o trajeto real. 0 = sem folga"], ["rotas.fator", "Fator de estimativa em linha reta", "num", "Usado só se o serviço de rotas não responder. Ex.: 1,35"], ["rotas.servidor", "Servidor de rotas OSRM (avançado)", "", "Deixe em branco para usar o gratuito"]];
const PRECO = [["preco.combustivel", "Preço do combustível (R$ por litro)", "money", "Atualize quando o preço mudar. Consumo e manutenção por km vêm da ficha de cada veículo (Frota); a mão de obra, do valor por frete de cada funcionário (Funcionários)"],
  ["preco.margem", "Margem de lucro (%)", "num", "Aplicada sobre o custo de cada linha de serviço"], ["preco.arredondar", "Arredondar valores para múltiplo de (R$)", "num", "Ex.: 5 deixa em 245, 250…"]];
const AGENDA = [["agenda.duracao", "Duração padrão de um serviço (horas)", "num", "Usada quando a OS ou o orçamento não tem horário de término. Serve para desenhar a agenda e achar conflitos."]];
const SAVE_KEYS = [...EMPRESA, ...BASE, ...BASE_COORD, ...ROTAS, ...PRECO, ...AGENDA].map(f => f[0]).concat(["base.lat", "base.lon", "base.label", "base.precisao", "rotas.provedor", "rotas.googleKey"], ["orcamento", "os", "confirmacao", "cobranca", "conclusao"].map(k => "msgs." + k));
const TPL = [["orcamento", "Mensagem do orçamento", "Enviada junto com a imagem do orçamento."], ["os", "Mensagem do resumo da OS", "Usada no botão “Enviar resumo por WhatsApp” da OS."],
  ["confirmacao", "Mensagem de confirmação de agendamento", "Botão “Confirmar agendamento” da OS. Use depois que o cliente aprovar."],
  ["cobranca", "Mensagem de lembrete de pagamento", "Botão “Cobrar pagamento” da OS. Só funciona quando ainda há valor pendente."],
  ["conclusao", "Mensagem de serviço concluído", "Botão “Serviço concluído” da OS. Bom para agradecer e pedir a avaliação."]];

const TABS = [["empresa", "Empresa e PIX"], ["rotas", "Ponto de partida e rotas"], ["precos", "Custos e preço"], ["agenda", "Veículos e agenda"], ["mensagens", "Mensagens do WhatsApp"]];
const SHORT = { orcamento: "Orçamento", os: "Resumo da OS", confirmacao: "Confirmação", cobranca: "Cobrança", conclusao: "Conclusão" };

const field = ([k, l, kind, hint]) => `<label class="f"><span>${esc(l)}</span><input data-k="${k}" autocomplete="off" ${kind === "money" ? 'data-money inputmode="decimal"' : kind === "tel" ? 'data-mask="tel" inputmode="tel"' : kind === "num" ? 'inputmode="decimal"' : ""}>${hint ? `<small class="note">${esc(hint)}</small>` : ""}</label>`;
const grid = list => `<div class="two" style="margin-bottom:6px">${list.map(field).join("")}</div>`;
const setDeep = (o, path, v) => { const a = path.split("."), l = a.pop(); a.reduce((x, k) => (x[k] ||= {}), o)[l] = v; };

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  try { await screen(view); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Configurações") + '<div class="banner">Não foi possível carregar as configurações.</div>'; }
}

async function screen(view) {
  const C = JSON.parse(JSON.stringify(await getCfg()));
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  let tab = TABS.some(t => t[0] === q.get("aba")) ? q.get("aba") : "empresa", msg = "orcamento", dirty = false;
  const panel = (id, inner) => `<section role="tabpanel" data-panel="${id}" ${id === tab ? "" : "hidden"}>${inner}</section>`;

  view.innerHTML = pageHead("Configurações", "Escolha o tipo de ajuste. O botão salvar vale para todas as abas.") + `
    ${bar({ left: [group(btn({ label: "Salvar configurações", ico: "save", kind: "pri", cls: "js-save" })), '<span class="dirty" id="dirty" hidden>● Alterações não salvas</span>'] })}
    <div class="cfgtabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>` +
    panel("empresa", `<div class="card"><h2>Empresa e PIX</h2>${grid(EMPRESA)}<p class="note">Aparecem na folha da OS e na imagem do orçamento.</p></div>`) +
    panel("rotas", `<div class="card"><h2>Ponto de partida</h2>
      <p class="note" style="margin-bottom:10px">Sua casa ou garagem. A distância do orçamento sai daqui até a carga, da carga até a descarga e de volta.</p>
      ${grid(BASE)}${grid(BASE_COORD)}<div class="actions">${btn({ label: "Localizar no mapa", ico: "pin", cls: "js-loc" })}</div>
      <p class="note" id="baseStatus" style="margin-top:8px"></p></div>
      <div class="card"><h2>Serviço de mapas</h2>
        <p class="note" style="margin-bottom:10px">O mapa gratuito (OpenStreetMap) erra a posição de muitos endereços do Brasil. O Google Maps entende o endereço como você digita e dá a mesma quilometragem do Maps.</p>
        <div class="row"><label class="f"><span>Calcular distâncias com</span><select data-k="rotas.provedor"><option value="osm">OpenStreetMap (gratuito)</option><option value="google">Google Maps (alta precisão)</option></select></label>
          <label class="f"><span>Chave do Google (API key)</span><input data-k="rotas.googleKey" type="password" autocomplete="off" placeholder="AIza…"></label></div>
        <div class="actions">${btn({ label: "Testar chave", ico: "check", cls: "js-gtest" })}</div><p class="note" id="gStatus" style="margin-top:8px"></p>
        <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">Como conseguir a chave do Google (passo a passo)</summary>
          <ol class="note" style="margin:8px 0 0 18px;line-height:1.6">
            <li>Entre em <b>console.cloud.google.com</b> com a sua conta Google e crie um projeto.</li>
            <li>Ative o <b>faturamento</b> do projeto. O Google pede um cartão, mas existe uma cota gratuita mensal para consultas de rota.</li>
            <li>Em <b>APIs e serviços → Biblioteca</b>, procure <b>Routes API</b> e ative. Para ver o mapa dentro do orçamento, ative também a <b>Maps Embed API</b> (uso gratuito).</li>
            <li>Em <b>APIs e serviços → Credenciais</b>, crie uma <b>chave de API</b>. Restrinja a chave: em aplicativos, <b>Sites (referenciadores HTTP)</b> com o endereço onde você abre o sistema (por exemplo <b>http://127.0.0.1:5500/*</b> e depois o do Firebase); em APIs, só a <b>Routes API</b> e a <b>Maps Embed API</b>.</li>
            <li>Em <b>Google Maps Platform → Cotas</b>, limite as consultas de rota por dia (por exemplo, 100), para nunca passar da cota gratuita.</li>
            <li>Cole a chave acima, escolha “Google Maps”, toque em <b>Testar chave</b> e salve.</li></ol></details></div>
      <div class="card"><h2>Rotas</h2>${grid(ROTAS)}
      <p class="note">Endereços e rotas: © colaboradores do OpenStreetMap (Nominatim e OSRM, serviços gratuitos, sem garantia de disponibilidade).</p></div>`) +
    panel("precos", `<div class="card"><h2>Custos e preço</h2>
      <p class="note" style="margin-bottom:10px">Usados na “Calculadora de preço” do orçamento. Os valores que vieram preenchidos são só exemplos: ajuste para a sua realidade.</p>${grid(PRECO)}</div>
      <div class="card"><h2>Simulação</h2><p class="note" style="margin-bottom:6px" id="simulTit"></p><div id="simul"></div></div>`) +
    panel("agenda", `<div class="card"><h2>Veículos</h2><p class="note">Os veículos agora são cadastrados em <a href="#/frota" style="color:var(--red);font-weight:700">Frota</a>, com placa, quilometragem, consumo, manutenção e documentos. A placa continua sendo usada na agenda para evitar conflitos.</p></div>
      <div class="card"><h2>Equipes</h2><p class="note">As equipes agora são cadastradas em <a href="#/funcionarios" style="color:var(--red);font-weight:700">Funcionários e equipes</a>, com os integrantes, o responsável e o histórico de serviços. O nome da equipe continua evitando conflito na agenda: a mesma equipe não pode estar em dois serviços ao mesmo tempo.</p></div>
      <div class="card"><h2>Agenda</h2>${grid(AGENDA)}</div>`) +
    panel("mensagens", `<div class="chips" id="msgChips">${TPL.map(([k]) => `<button class="chip" type="button" data-msg="${k}" aria-pressed="${k === msg}">${SHORT[k]}</button>`).join("")}</div>` +
      TPL.map(([k, t, hint]) => `<div class="card tplbox" data-msgpanel="${k}" ${k === msg ? "" : "hidden"}><h2>${t}</h2><p class="note">${hint} Toque numa variável para inseri-la no texto. Linhas cujos valores estiverem vazios somem sozinhas (por exemplo, sem desconto a linha do desconto não aparece).</p>
      <div class="varchips">${MSG_VARS[k].map(([v, d]) => `<button class="chip" type="button" data-ins="{${v}}" title="${esc(d)}">{${v}}</button>`).join("")}</div>
      <textarea data-k="msgs.${k}" rows="9" aria-label="${t}"></textarea>
      <div class="actions" style="margin-top:8px">${btn({ label: "Restaurar texto padrão", ico: "refresh", sm: true, attrs: 'data-reset="' + k + '"' })}</div>
      <div class="sub">Como vai aparecer (com dados de exemplo)</div><div class="tplprev" id="prev_${k}"></div></div>`).join("")) +
    '<div class="actions" style="margin-top:6px">' + btn({ label: "Salvar configurações", ico: "save", kind: "pri", cls: "js-save" }) + '</div>';

  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];
  const SAMPLE = {
    orcamento: { nome: "Maria", nome_completo: "Maria Souza", numero: "000125", coleta: "Rua das Flores, 123, Boa Vista", entrega: "Av. Principal, 456, Piedade",
      servicos: "• Frete e transporte: R$ 450,00\n• Ajudantes: R$ 150,00", desconto: "R$ 50,00", total: "R$ 550,00", pagamento: "30% de entrada", validade: "13/11/2026", data_servico: "20/11/2026 09:00" },
    os: { nome: "Maria", nome_completo: "Maria Souza", numero: "0012", coleta: "Rua das Flores, 123, Boa Vista", entrega: "Av. Principal, 456, Piedade", total: "R$ 550,00", pago: "R$ 200,00", restante: "R$ 350,00", data: "20/11/2026", horario: "09:00" } };
  ["confirmacao", "cobranca", "conclusao"].forEach(k => { SAMPLE[k] = { ...SAMPLE.os, pendente: "R$ 350,00", pix: "chave-pix@exemplo.com", avaliacao: "https://g.page/r/exemplo", telefone: "(81) 99999-9999" }; });
  const previews = () => TPL.forEach(([k]) => { $("#prev_" + k).textContent = renderTpl(getP(C, "msgs." + k), { ...SAMPLE[k], empresa: C.empresa || "" }); });
  const status = () => { $("#baseStatus").textContent = C.base.lat !== "" && C.base.lat != null ? "Localizado: " + C.base.label + (C.base.precisao ? " — precisão: " + (PRECISAO[C.base.precisao] || C.base.precisao) : "") : "Ainda não localizado. Preencha o endereço e toque em “Localizar no mapa”."; };
  const simul = () => { // mostra na hora o efeito dos custos, com uma viagem de exemplo
    const r = calcPreco({ ...C.preco, consumo: "10", manutencaoKm: "0,50" }, { km: 30, extras: 0, equipe: [{ funcao: "Motorista", valor: "150,00" }, { funcao: "Ajudante", valor: "80,00" }] });
    $("#simulTit").textContent = "Exemplo: viagem de 30 km, veículo com 10 km/L e R$ 0,50 por km de manutenção, um motorista (R$ 150,00 por frete) e um ajudante (R$ 80,00 por frete). Na prática, esses valores vêm do veículo e da equipe do serviço.";
    $("#simul").innerHTML = `<div class="brk"><div><span>Custo total</span><b>${brl(r.custo)}</b></div><div class="big"><span>Preço sugerido</span><b>${brl(r.preco)}</b></div><div><span>Lucro estimado</span><b>${brl(r.lucro)} <small>(${Math.round(r.margemReal)}% sobre o custo)</small></b></div></div>`;
  };
  const markDirty = () => { dirty = true; $("#dirty").hidden = false; };
  const show = id => { // troca de aba sem recarregar: o que você digitou nas outras abas continua lá
    tab = id;
    $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== id; });
    $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    history.replaceState(null, "", "#/configuracoes?aba=" + id);
  };
  const showMsg = id => {
    msg = id;
    $$("[data-msgpanel]").forEach(p => { p.hidden = p.dataset.msgpanel !== id; });
    $$("[data-msg]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.msg === id)));
  };

  const subs = () => fillForm(view, C);
  subs(); status(); previews(); simul();
  bindForm(view, C, k => {
    markDirty();
    if (/^base\.(rua|num|bairro|cidade)$/.test(k) && !parseCoord(C.base.coord)) { C.base.lat = ""; C.base.lon = ""; C.base.label = ""; C.base.precisao = ""; status(); } // endereço mudou: precisa localizar de novo
    if (k === "base.coord") { const m = parseCoord(C.base.coord); if (m) { Object.assign(C.base, { lat: m.lat, lon: m.lon, label: "Coordenadas informadas por você", precisao: "manual" }); status(); } }
    if (k.startsWith("msgs.") || k === "empresa") previews();
    if (k.startsWith("preco.")) simul();
  });

  $(".js-loc").addEventListener("click", async () => {
    const b = $(".js-loc"), manual = parseCoord(C.base.coord);
    if ((C.base.coord || "").trim() && !manual) { toast("Coordenadas inválidas. Cole como no Google Maps, por exemplo -8.045601, -34.942107."); return; }
    if (manual) { Object.assign(C.base, { lat: manual.lat, lon: manual.lon, label: "Coordenadas informadas por você", precisao: "manual" }); status(); markDirty(); toast("Ponto de partida definido pelas coordenadas. Salve para confirmar."); return; }
    if (!hasAddr(C.base)) { toast("Preencha pelo menos a rua ou o bairro e a cidade."); return; }
    b.disabled = true; toast("Localizando o endereço…");
    try {
      const g = await geocode(C.base);
      if (!g) toast("Não encontrei esse endereço. Confira rua, bairro e cidade, ou cole as coordenadas do Google Maps.");
      else { Object.assign(C.base, { lat: g.lat, lon: g.lon, label: g.label, precisao: g.precisao }); status(); markDirty(); toast(g.precisao === "exato" || g.precisao === "rua" ? "Endereço localizado. Confira e salve." : "Localizei só " + PRECISAO[g.precisao].replace("só ", "") + ". Cole as coordenadas do Google Maps para ficar exato."); }
    } catch (e) { console.error(e); toast("Não foi possível consultar o mapa agora. Tente de novo em instantes."); }
    b.disabled = false;
  });

  $(".js-gtest").addEventListener("click", async () => { // 1 consulta de teste ao Google (Marco Zero → Boa Viagem → Rua da Aurora)
    const b = $(".js-gtest"), key = (C.rotas.googleKey || "").trim();
    if (!key) { toast("Cole a chave do Google primeiro."); return; }
    b.disabled = true; toast("Testando a chave no Google…");
    try {
      const g = await googleRoute(key, { rua: "Praça do Marco Zero", cidade: "Recife" }, { rua: "Avenida Boa Viagem", cidade: "Recife" }, { rua: "Rua da Aurora", cidade: "Recife" });
      const km = g.legs.reduce((s, l) => s + l.km, 0);
      $("#gStatus").textContent = "Chave funcionando. Rota de teste no Recife: " + String(Math.round(km * 10) / 10).replace(".", ",") + " km."; toast("Chave do Google funcionando");
    } catch (e) { console.error(e); $("#gStatus").textContent = googleErro(e); toast(googleErro(e)); }
    b.disabled = false;
  });

  view.addEventListener("click", e => {
    const c = sel => e.target.closest && e.target.closest(sel);
    const t = c("[data-tab]"), m = c("[data-msg]"), ins = c("[data-ins]"), rs = c("[data-reset]");
    if (t) return show(t.dataset.tab);
    if (m) return showMsg(m.dataset.msg);
    if (ins) { // insere a variável no texto da mensagem que está aberta
      const ta = ins.closest(".tplbox").querySelector("textarea"); ta.focus();
      ta.setRangeText(ins.dataset.ins, ta.selectionStart, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (rs) { const k = rs.dataset.reset; C.msgs[k] = DEFAULT_MSG[k]; fillForm(view, C); previews(); markDirty(); toast("Texto padrão restaurado. Salve para confirmar."); }
  });

  $$(".js-save").forEach(b => b.addEventListener("click", async () => {
    if (C.rotas.provedor === "google" && !(C.rotas.googleKey || "").trim()) { show("rotas"); toast("Para usar o Google Maps, cole a chave do Google."); return; }
    const out = {}; SAVE_KEYS.forEach(k => setDeep(out, k, getP(C, k)));
    try {
      await saveCfg(out); dirty = false; $("#dirty").hidden = true;
      const sem = (C.base.rua || C.base.bairro) && (C.base.lat === "" || C.base.lat == null);
      toast(sem ? "Salvo. Falta localizar o ponto de partida no mapa." : "Configurações salvas");
    } catch (e) { console.error(e); toast("Não foi possível salvar as configurações."); }
  }));
}
