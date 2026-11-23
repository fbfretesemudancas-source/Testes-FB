// Orçamento: distância da rota (ponto de partida → carga → descarga → ponto de partida) e calculadora do frete.
// Se o veículo NÃO sair da partida padrão, o campo opcional "Saída do veículo" (O.saida) vale no lugar dela.
// A volta pode ser pro mesmo endereço de saída (padrão) ou pra partida padrão (O.saidaFim === "base").
import { esc, brl, num, toast } from "../../js/utils.js";
import { addrQuery, hasAddr, geocode, osrmRoute, estimateLegs, parseCoord, mapsDirUrl, mapsEmbedUrl, PRECISAO, googleRoute, googleErro } from "../../js/geo.js";
import { calcPreco } from "../../js/domain.js";
import { equipePagHTML } from "./equipePag.js";
import { precoDoVeiculo, faltaNoVeiculo } from "../../js/frota.js";
import { fillForm } from "./formKit.js";
import { icon } from "./icons.js";

const r1 = n => Math.round(n * 10) / 10;
const fmtMin = m => (m >= 60 ? Math.floor(m / 60) + " h " + String(Math.round(m % 60)).padStart(2, "0") + " min" : Math.round(m) + " min");
const kmTxt = n => String(r1(n)).replace(".", ",") + " km";
const RUIM = { bairro: 1, cidade: 1 };
const FONTES = { google: "Google Maps", osrm: "OpenStreetMap", estimativa: "estimativa em linha reta" };

/** Bloco de distância (vai antes dos serviços). */
export const distanciaHTML = () => `
  <div class="card"><h2>Distância da rota</h2>
    <p class="note" id="baseNote"></p><p class="note" id="provNote" style="margin-top:4px"></p>
    <details class="calc" id="saidaBox" style="margin-top:10px"><summary>Saída do veículo diferente da partida padrão (opcional)</summary>
      <p class="note" style="margin:8px 0 10px">Só preencha se, neste serviço, o veículo não sair da partida padrão. Com este endereço, a rota passa a sair por este endereço. Em branco, vale a partida padrão.</p>
      <div class="row r21"><label class="f"><span>Rua / Avenida</span><input data-k="saida.rua" autocomplete="off"></label><label class="f"><span>Nº</span><input data-k="saida.num" autocomplete="off"></label></div>
      <div class="row"><label class="f"><span>Bairro</span><input data-k="saida.bairro" autocomplete="off"></label><label class="f"><span>Cidade</span><input data-k="saida.cidade" autocomplete="off"></label></div>
      <div class="row" style="grid-template-columns:1fr"><label class="f"><span>Coordenadas ou link do Google Maps (opcional)</span><input data-k="saida.coord" placeholder="-8.045601, -34.942107" autocomplete="off"></label></div>
      <div class="row" style="grid-template-columns:1fr"><label class="f"><span>Onde o veículo termina o serviço</span><select data-k="saidaFim"><option value="">Volta para este mesmo endereço de saída</option><option value="base">Termina na partida padrão (base cadastrada)</option></select></label></div>
      <p class="note" id="saidaNote" style="margin-top:4px"></p>
      <div class="actions" style="margin-top:8px"><button class="btn sm js-saida-clear" type="button">${icon("x")}<span>Voltar à partida padrão</span></button></div></details>
    <div class="row" style="margin-top:10px"><label class="f"><span>Carga: coordenadas ou link do Google Maps (opcional)</span><input data-k="col.coord" placeholder="-8.045601, -34.942107" autocomplete="off"></label>
      <label class="f"><span>Descarga: coordenadas ou link do Google Maps (opcional)</span><input data-k="ent.coord" placeholder="-8.045601, -34.942107" autocomplete="off"></label></div>
    <p class="note" style="margin-bottom:10px">Só use se o endereço digitado sair no lugar errado: no Google Maps, clique com o botão direito no ponto e toque nos números que aparecem (copia as coordenadas), ou cole o link da página do local.</p>
    <div class="actions"><button class="btn pri js-rota" type="button">${icon("route")}<span>Calcular distância</span></button><button class="btn js-maps" type="button">${icon("external")}<span>Conferir no Google Maps</span></button><button class="btn ico-only js-mapa" type="button" data-tip="Ver mapa da rota" aria-label="Ver mapa da rota" aria-pressed="false">${icon("map")}</button></div>
    <div id="mapaRota" hidden style="margin-top:10px"></div>
    <div id="rotaOut" style="margin-top:10px"></div>
    <div class="row" style="margin-top:10px"><label class="f"><span>Total de km usado no preço</span><input data-k="calc.km" id="calcKm" inputmode="decimal"></label><span></span></div>
    <p class="note">Deixe em branco para usar a distância calculada acima. Se você conferiu no Google Maps e o número for outro, digite aqui: o preço passa a usar o seu número.</p>
    <p class="note" style="margin-top:6px">Endereços e rotas: Google Maps ou © colaboradores do OpenStreetMap (Nominatim e OSRM), conforme a escolha em Configurações.</p></div>`;

/** Calculadora do frete (vai dentro de "Serviços e valores", depois das linhas de serviço). */
export const calculadoraHTML = () => `
  <details class="calc" open><summary>Calculadora do frete (opcional)</summary>
    <p class="note" id="calcSrc" style="margin:8px 0 10px"></p>
    <div style="margin:0 0 12px">${equipePagHTML()}</div>
    <div class="row"><label class="f"><span>Pedágio / extras (R$)</span><input data-k="calc.extras" data-money inputmode="decimal" placeholder="0,00"></label><span></span></div>
    <div id="calcOut"></div>
    <div class="actions" style="margin-top:10px"><button class="btn pri js-apply" type="button">${icon("check")}<span>Aplicar nas linhas de serviço</span></button></div>
    <p class="note" style="margin-top:8px">Preenche as linhas “Frete e transporte”, “Ajudante(s)” e “Pedágio / taxas” (cria se não existirem) e não apaga os outros serviços. Consumo e manutenção por km vêm da ficha do veículo (Frota); combustível, margem e arredondamento, das Configurações; a mão de obra, do valor por frete de cada funcionário da equipe (ficha, ajustável acima). Não há valor mínimo.</p></details>`;

/** Liga distância e calculadora ao orçamento O. `fleet` = fichas de veículos. Devolve { refresh }. */
export function bindPricing(view, O, cfg, { onChange, fleet = [] }) {
  const $ = s => view.querySelector(s);
  const baseOk = () => !!(cfg.base && cfg.base.lat !== "" && cfg.base.lat != null && cfg.base.lon !== "");
  const gKey = () => ((cfg.rotas && cfg.rotas.googleKey) || "").trim();
  const useGoogle = () => (cfg.rotas && cfg.rotas.provedor) === "google" && !!gKey();
  const baseDefinida = () => baseOk() || hasAddr(cfg.base) || !!parseCoord(cfg.base && cfg.base.coord);
  const saidaOn = () => hasAddr(O.saida) || !!(O.saida.coord || "").trim(); // saída diferente da partida padrão em uso?
  const fimBase = () => saidaOn() && O.saidaFim === "base"; // sai da saída diferente, mas termina na partida padrão
  const saidaQ = () => (saidaOn() ? (parseCoord(O.saida.coord) ? "coord:" + O.saida.coord.trim() : addrQuery(O.saida)) : "");
  const veh = () => fleet.find(v => v.placa && v.placa === O.veiculo);
  const P = () => precoDoVeiculo(cfg.preco, veh());
  const folga = () => Math.max(0, num(cfg.rotas && cfg.rotas.folga));
  const manualKm = () => O.calc.km !== "" && num(O.calc.km) > 0;
  const eff = () => ({
    km: manualKm() ? O.calc.km : (O.rota ? r1(O.rota.total * (1 + folga() / 100)) : 0),
    extras: O.calc.extras, equipe: (O.pagEq || []).map(x => ({ funcao: x.funcao, valor: x.valor })) });

  function rotaHTML() {
    const R = O.rota; if (!R) return '<p class="note">Ainda não calculada. Preencha os endereços de carga e descarga e toque em “Calcular distância”.</p>';
    const stale = R.qs && (R.qs[0] !== addrQuery(O.col) || R.qs[1] !== addrQuery(O.ent) || (R.qs[2] || "") !== saidaQ() || !!R.saida !== saidaOn() || (R.fim || "") !== (fimBase() ? "base" : ""));
    const pt = R.saida ? "Saída" : "Partida", fim = R.saida && R.fim !== "base" ? "Saída" : "Partida";
    const rows = [[pt + " → Carga", R.legs[0]], ["Carga → Descarga", R.legs[1]], ["Descarga → " + fim, R.legs[2]]];
    const geo = (k, a) => a.geo ? `<div><small>${k}: ${esc(a.geo.label)} — precisão: <b>${esc(PRECISAO[a.geo.precisao] || "não informada")}</b></small></div>` : "";
    const ruins = [["carga", O.col], ["descarga", O.ent], ...(R.saida ? [["saída", O.saida]] : [])].filter(([, a]) => a.geo && RUIM[a.geo.precisao]).map(x => x[0]);
    return (stale ? '<div class="banner">Os endereços mudaram desde o último cálculo. Calcule de novo.</div>' : "") +
      (R.aviso ? `<div class="banner">${esc(R.aviso)}</div>` : "") +
      (ruins.length ? `<div class="banner">A localização de ${ruins.join(" e ")} chegou só até o bairro: a distância pode errar bastante. Cole as coordenadas do Google Maps no campo acima e calcule de novo.</div>` : "") +
      (R.total < 0.2 ? '<div class="banner">Os pontos ficaram praticamente no mesmo lugar. Confira os endereços ou use as coordenadas.</div>' : "") +
      `<div class="used">${rows.map(([t, l]) => `<div>${t}: <b>${kmTxt(l.km)}</b> <small>(${fmtMin(l.min)})</small></div>`).join("")}
      <div><b>Total: ${kmTxt(R.total)}</b> · ${fmtMin(R.min)} de estrada${folga() ? ` · <small>com folga de ${String(folga()).replace(".", ",")}%: ${kmTxt(R.total * (1 + folga() / 100))}</small>` : ""}</div>
      <div><small>Fonte: ${esc(FONTES[R.fonte] || R.fonte)}</small></div>${R.saida ? geo("Saída", O.saida) : ""}${geo("Carga", O.col)}${geo("Descarga", O.ent)}</div>` +
      (manualKm() ? `<div class="banner" style="margin-top:8px;background:var(--field);border-color:var(--line)">O preço está usando <b>${kmTxt(num(O.calc.km))}</b>, o valor que você digitou, e não os ${kmTxt(R.total)} calculados.</div>` : "") +
      (R.fonte === "estimativa" ? '<p class="note" style="margin-top:6px">Estimativa em linha reta × fator (o serviço de rotas não respondeu). Digite o total de km real abaixo se souber.</p>' : "");
  }
  const faltas = () => (O.veiculo && veh() ? faltaNoVeiculo(veh()) : ["veículo"]); // o que impede de calcular (veículo e dados dele)
  function calcHTML() {
    const f = faltas(), v = veh();
    if (f[0] === "veículo") return '<div class="banner">Escolha o <b>veículo</b> em “Agendamento” para calcular o frete: o consumo e a manutenção por km vêm da ficha dele (Frota).</div>';
    if (f.length) return `<div class="banner">O veículo <b>${esc(v.placa)}</b> está sem ${esc(f.join(" e "))} na ficha. <a href="#/frota?id=${esc(v._id)}" style="color:var(--red);font-weight:700">Preencha em Frota</a> para calcular o frete.</div>`;
    const e = eff(), pv = P(), r = calcPreco(pv.preco, e), row = (t, v2, c = "") => `<div class="${c}"><span>${t}</span><b>${v2}</b></div>`, sec = t => `<h4 class="calc-h">${t}</h4>`;
    const mo = (O.pagEq || []).length ? O.pagEq.map(x => row(`${esc(x.nome)} <small>(${esc(x.funcao || "sem função")}) · valor fixo por frete</small>`, brl(num(x.valor)))).join("") : row("Mão de obra <small>(nenhum funcionário por frete na equipe)</small>", brl(0));
    const linhas = r.linhas.length ? r.linhas.map(l => `<tr><td>${esc(l.d)}</td><td>${brl(l.custo)}</td><td>${l.semMargem ? "<small>sem margem</small>" : brl(l.comMargem)}</td><td><b>${brl(l.v)}</b></td></tr>`).join("") : '<tr><td colspan="4"><small>Sem custos ainda: informe os km e a equipe.</small></td></tr>';
    return `<div class="brk">${r.km ? "" : '<div class="banner">Sem distância: calcule a rota acima ou digite o total de km.</div>'}
      ${sec("1 · Custos do frete")}
      ${row(`Combustível <small>(${kmTxt(r.km)} ÷ ${esc(pv.preco.consumo)} km/L × R$ ${esc(cfg.preco.combustivel)})</small>`, brl(r.combustivel))}
      ${row(`Manutenção e desgaste <small>(${kmTxt(r.km)} × R$ ${esc(pv.preco.manutencaoKm)}/km)</small>`, brl(r.manutencao))}
      ${mo}${row("Pedágio / taxas", brl(r.extras))}
      ${row("Custo total", brl(r.custo), "tt")}
      ${sec("2 · Como vira cada linha de serviço")}
      <div class="calc-scroll"><table class="calc-lines"><thead><tr><th>Linha de serviço</th><th>Custo</th><th>+ margem (${esc(cfg.preco.margem)}%)</th><th>Valor na linha</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="note" style="margin:4px 0 8px">Cada valor é arredondado para cima, em múltiplos de R$ ${esc(cfg.preco.arredondar)}. Pedágio e taxas entram sem margem. “Aplicar nas linhas de serviço” grava exatamente a última coluna.</p>
      ${row("Preço do frete sugerido", brl(r.preco), "big")}
      ${row("Lucro estimado", `${brl(r.lucro)} <small>(${String(r1(r.margemReal)).replace(".", ",")}% sobre o custo)</small>`)}</div>`;
  }
  function refresh() {
    const v = veh(), pv = P();
    const baseTxt = esc(cfg.base.label || [cfg.base.rua, cfg.base.num, cfg.base.bairro, cfg.base.cidade].filter(Boolean).join(", "));
    $("#baseNote").innerHTML = saidaOn() ? `<b>Saída diferente da padrão:</b> ${esc(parseCoord(O.saida.coord) ? "coordenadas informadas" : addrQuery(O.saida).replace(/, Brasil$/, ""))}. ${fimBase() ? `O veículo sai por este endereço e <b>termina na partida padrão</b>${baseDefinida() ? " (" + baseTxt + ")" : ""}.` : `A saída e a volta serão por este endereço${baseDefinida() ? ` (a partida padrão, ${baseTxt}, não entra na conta)` : ""}.`}`
      : baseDefinida() ? "Ponto de partida: " + baseTxt
      : 'Ponto de partida não definido. <a href="#/configuracoes?aba=rotas" style="color:var(--red);font-weight:700">Defina em Configurações</a> (sua casa ou garagem).';
    $("#provNote").innerHTML = useGoogle() ? "Mapa: <b>Google Maps</b> (alta precisão, usa o endereço como você digitou)."
      : 'Mapa: <b>OpenStreetMap</b> (gratuito, precisão limitada em endereços do Brasil). <a href="#/configuracoes?aba=rotas" style="color:var(--red);font-weight:700">Ativar o Google Maps</a>.';
    const sx = O.saida, parcial = !saidaOn() && ["rua", "num", "bairro", "cidade", "comp", "cep"].some(k => (sx[k] || "").trim());
    $("#saidaNote").textContent = parcial ? "Falta a rua ou o bairro: enquanto isso, a partida padrão continua valendo." : (saidaOn() ? (fimBase() ? "Em uso: sai deste endereço e termina na partida padrão." : "Em uso: sai e volta por este endereço.") : "");
    if (saidaOn() && !$("#saidaBox").open) $("#saidaBox").open = true;
    $(".js-saida-clear").hidden = !(saidaOn() || parcial);
    $("#rotaOut").innerHTML = rotaHTML(); $("#calcOut").innerHTML = calcHTML();
    const f = faltas();
    $("#calcSrc").textContent = !f.length ? `Veículo ${v.placa}${v.nome ? " (" + v.nome + ")" : ""}: consumo ${pv.preco.consumo} km/L e manutenção R$ ${pv.preco.manutencaoKm}/km, da ficha. Combustível, margem e arredondamento vêm das Configurações; a mão de obra, da equipe.` : "";
    $(".js-apply").disabled = f.length > 0;
    $("#calcKm").placeholder = O.rota ? String(r1(O.rota.total * (1 + folga() / 100))).replace(".", ",") + " (da rota)" : "da rota";
  }

  $(".js-rota").addEventListener("click", async () => {
    const btn = $(".js-rota"), google = useGoogle();
    const saida = saidaOn(), fim = fimBase();
    if ((!saida || fim) && !(google ? baseDefinida() : baseOk())) { toast(google ? "Defina o ponto de partida em Configurações primeiro." : "Defina e localize o ponto de partida em Configurações primeiro."); return; }
    if (saida && (O.saida.coord || "").trim() && !parseCoord(O.saida.coord)) { toast("Coordenadas da saída inválidas. Cole como no Google Maps, por exemplo -8.045601, -34.942107."); return; }
    for (const [k, nome] of [["col", "carga"], ["ent", "descarga"]]) {
      if (!hasAddr(O[k]) && !(O[k].coord || "").trim()) { toast("Preencha o endereço de " + nome + "."); return; }
      if ((O[k].coord || "").trim() && !parseCoord(O[k].coord)) { toast(`Coordenadas de ${nome} inválidas. Cole como no Google Maps, por exemplo -8.045601, -34.942107.`); return; }
    }
    btn.disabled = true; toast("Calculando a rota…");
    try {
      let legs = null, fonte = "", aviso = "";
      if (google) { // alta precisão: manda os endereços digitados para o Google
        try {
          const g = await googleRoute(gKey(), saida ? O.saida : cfg.base, O.col, O.ent, fim ? cfg.base : undefined);
          legs = g.legs; fonte = "google";
          [["col", "Endereço enviado ao Google: "], ["ent", "Endereço enviado ao Google: "]].forEach(([k, t]) => { const a = O[k], manual = parseCoord(a.coord); a.geo = { q: addrQuery(a), label: manual ? "Coordenadas informadas por você" : t + addrQuery(a), precisao: g.precisao[k] || null, fonte: "google" }; });
        } catch (err) { console.error("Google:", err); aviso = googleErro(err) + " Usei o mapa gratuito (OpenStreetMap) desta vez."; toast(googleErro(err)); }
      }
      if (!legs) { // mapa gratuito (padrão, ou plano B se o Google falhou)
        if ((!saida || fim) && !baseOk()) { toast("O Google falhou e o ponto de partida ainda não foi localizado no mapa gratuito. Veja em Configurações."); refresh(); btn.disabled = false; return; }
        const geos = [];
        for (const [k, nome] of [...(saida ? [["saida", "saída"]] : []), ["col", "carga"], ["ent", "descarga"]]) {
          const a = O[k], q = addrQuery(a), manual = parseCoord(a.coord);
          if (manual) a.geo = { q, lat: manual.lat, lon: manual.lon, label: "Coordenadas informadas por você", precisao: "manual", aprox: false };
          else if (!(a.geo && a.geo.q === q && a.geo.precisao !== "manual" && a.geo.lat != null)) { // só consulta o mapa se o endereço mudou
            const g = await geocode(a, baseOk() ? cfg.base : null);
            if (!g) { toast(`Não encontrei o endereço de ${nome}. Confira rua, bairro e cidade, ou cole as coordenadas.`); refresh(); btn.disabled = false; return; }
            a.geo = g;
          }
          geos.push(a.geo);
        }
        const pts = saida ? [geos[0], geos[1], geos[2], fim ? cfg.base : geos[0]] : [cfg.base, geos[0], geos[1], cfg.base]; // sai, carga, descarga e volta ao ponto de saída
        fonte = "osrm";
        try { legs = await osrmRoute(pts, cfg.rotas && cfg.rotas.servidor); }
        catch (err) { console.error("Rota:", err); legs = estimateLegs(pts, num(cfg.rotas && cfg.rotas.fator) || 1.35); fonte = "estimativa"; }
      }
      const L = legs.map(l => ({ km: r1(l.km), min: Math.round(l.min) }));
      O.rota = { legs: L, total: r1(L.reduce((s, l) => s + l.km, 0)), min: L.reduce((s, l) => s + l.min, 0), fonte, aviso, saida, fim: fim ? "base" : "", qs: [addrQuery(O.col), addrQuery(O.ent), saidaQ()], em: new Date().toISOString() };
      O.calc.km = ""; // volta a usar a distância calculada
      fillForm(view, O); onChange(); toast("Distância total: " + kmTxt(O.rota.total));
    } catch (err) { console.error(err); toast("Não foi possível consultar o mapa agora. Digite o total de km à mão."); }
    refresh(); btn.disabled = false;
    if (!mapaBox().hidden && gKey()) desenharMapa(); // mapa aberto: acompanha o endereço recém-calculado
  });

  /** Pontos da rota como foram digitados: saída → carga → descarga → destino final.
   *  Respeita a "saída do veículo" e "onde termina" (sem eles: partida padrão → carga → descarga → partida padrão). null (com aviso) se faltar algo. */
  const pontosRota = () => {
    const txt = a => { const m = parseCoord(a.coord); return m ? m.lat + "," + m.lon : addrQuery(a); };
    const mb = parseCoord(cfg.base && cfg.base.coord), basePadrao = mb ? mb.lat + "," + mb.lon : hasAddr(cfg.base) ? addrQuery(cfg.base) : baseOk() ? cfg.base.lat + "," + cfg.base.lon : "";
    const base = saidaOn() ? txt(O.saida) : basePadrao, destino = fimBase() ? basePadrao : base; // saída diferente vale no lugar da partida padrão; a volta pode ser pra base
    if (!base || !destino) { toast("Defina o ponto de partida em Configurações primeiro."); return null; }
    if (!hasAddr(O.col) && !(O.col.coord || "").trim()) { toast("Preencha o endereço de carga."); return null; }
    if (!hasAddr(O.ent) && !(O.ent.coord || "").trim()) { toast("Preencha o endereço de descarga."); return null; }
    return { base, via: [txt(O.col), txt(O.ent)], destino };
  };
  $(".js-maps").addEventListener("click", () => { // abre a MESMA rota no Google Maps, com os endereços como foram digitados
    const p = pontosRota(); if (!p) return;
    window.open(mapsDirUrl(p.base, p.via, p.destino), "_blank", "noopener");
  });

  /* Mapa do Google dentro da tela (Maps Embed API, modo direções), só para conferir o percurso. Não entra no documento do cliente.
   * Não é redesenhado a cada alteração (refresh roda o tempo todo): só ao abrir, em "Atualizar mapa" e depois de calcular a distância. */
  const mapaBox = () => $("#mapaRota");
  const mapaBtn = aberto => { // botão só de ícone: a dica e o estado mudam conforme o mapa está aberto ou fechado
    const b = $(".js-mapa"); if (!b) return; const t = aberto ? "Ocultar mapa da rota" : "Ver mapa da rota";
    b.dataset.tip = t; b.setAttribute("aria-label", t); b.setAttribute("aria-pressed", String(aberto)); b.classList.toggle("on", aberto);
  };
  const mapaFechar = () => { const box = mapaBox(); box.hidden = true; box.innerHTML = ""; mapaBtn(false); };
  function desenharMapa() {
    const box = mapaBox(), key = gKey(); if (!box) return;
    if (!key) {
      box.innerHTML = '<div class="banner">O mapa do Google dentro do orçamento precisa da chave do Google. Cole a chave em <a href="#/configuracoes?aba=rotas" style="color:var(--red);font-weight:700">Configurações → Rotas</a>, com a <b>Maps Embed API</b> ativada nela. Enquanto isso, use “Conferir no Google Maps”.</div>';
      return;
    }
    const p = pontosRota(); if (!p) { mapaFechar(); return; }
    const de = saidaOn() ? "saída" : "partida", ate = !saidaOn() || fimBase() ? "partida" : "saída";
    box.innerHTML = `<iframe title="Mapa da rota" loading="lazy" allowfullscreen src="${esc(mapsEmbedUrl(key, p.base, p.via, p.destino))}" style="width:100%;height:380px;border:1px solid var(--line);border-radius:10px;background:var(--field)"></iframe>
      <p class="note" style="margin-top:6px">Rota: ${de} → carga → descarga → ${ate}. Se o mapa mostrar um erro do Google, ative a <b>Maps Embed API</b> no projeto da chave e libere-a nas restrições da chave.</p>
      <div class="actions" style="margin-top:6px"><button class="btn sm js-mapa-upd" type="button">${icon("refresh")}<span>Atualizar mapa</span></button></div>`;
  }
  $(".js-mapa").addEventListener("click", () => {
    const box = mapaBox();
    if (!box.hidden) { mapaFechar(); return; }
    if (gKey() && !pontosRota()) return; // já avisou o que falta
    box.hidden = false; mapaBtn(true); desenharMapa();
  });
  mapaBox().addEventListener("click", e => { if (e.target.closest(".js-mapa-upd")) desenharMapa(); });

  $(".js-saida-clear").addEventListener("click", () => {
    O.saida = { rua: "", num: "", bairro: "", cidade: "", comp: "", cep: "", dh: "", coord: "" }; O.saidaFim = "";
    fillForm(view, O); onChange(); refresh(); toast("Voltou a valer a partida padrão. Calcule a distância de novo.");
    if (!mapaBox().hidden && gKey()) desenharMapa();
  });

  const MATCH = [[/^frete/i, "Frete"], [/^ajudante/i, "Ajudante"], [/^ped[aá]gio/i, "Ped"]];
  $(".js-apply").addEventListener("click", () => {
    if (faltas().length) { toast("Escolha o veículo (com consumo e manutenção na ficha) para calcular o frete."); return; }
    const r = calcPreco(P().preco, eff());
    if (!(r.preco > 0)) { toast("Nada para aplicar: confira os custos."); return; }
    // cada resultado vai para a linha que já tem aquele nome; se não houver, usa a primeira linha livre (sem apagar outros serviços)
    const livres = O.servicos.map((x, i) => (!(x.d || "").trim() && !num(x.v) ? i : -1)).filter(i => i >= 0);
    const plano = r.lines.map(l => { const re = (MATCH.find(m => l.d.startsWith(m[1])) || MATCH[2])[0]; return { l, i: O.servicos.findIndex(x => re.test((x.d || "").trim())) }; });
    const precisam = plano.filter(p => p.i < 0).length;
    if (precisam > livres.length) { toast("Não há linhas livres nos serviços. Apague ou junte alguma linha e aplique de novo."); return; }
    plano.forEach(p => { const i = p.i >= 0 ? p.i : livres.shift(); O.servicos[i] = { d: p.l.d, v: p.l.v }; });
    O.custoEstimado = Math.round(r.custo * 100) / 100;
    fillForm(view, O); onChange(); toast("Frete aplicado nas linhas de serviço. Total do frete: " + brl(r.preco));
  });
  return { refresh };
}
