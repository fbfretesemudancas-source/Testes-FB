// Folhas A4 (OS e Orçamento): mesmo layout do projeto base, em módulo.
// O Orçamento reaproveita cabeçalho, caixas e rodapé da OS, só com menos campos.
import { esc, num, brl, pad, padO, fmtD, fmtDT, money, digits } from "../../js/utils.js";
import { pixPayload } from "../../js/pix.js";
import { TIPOS, INFOS, PGTOS, totals, orcSub } from "../../js/domain.js";

const ASSET = { lt: "./assets/logo_lt.png", tag: "./assets/logo_lt_tagline.png", dk: "./assets/logo_dk.png", truck: "./assets/truckuri.jpg" };
const igName = cfg => String(cfg.ig || "").replace("@", "");

/* ---------- QR (usa a biblioteca qrcode-generator, carregada sob demanda) ---------- */
const qrCache = {};
export function clearQrCache() { for (const k in qrCache) delete qrCache[k]; }
export function qrURI(text) {
  if (!text || typeof qrcode === "undefined") return "";
  if (qrCache[text]) return qrCache[text];
  try {
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), k = 10, pad2 = 2, sz = (n + pad2 * 2) * k;
    const cv = document.createElement("canvas"); cv.width = cv.height = sz;
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, sz, sz); cx.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cx.fillRect((c + pad2) * k, (r + pad2) * k, k, k);
    return (qrCache[text] = cv.toDataURL("image/png"));
  } catch (e) { return ""; }
}

/* ---------- peças comuns ---------- */
const logoHTML = (cfg, v) => `<img src="${cfg.logo || (v === "dk" ? ASSET.dk : v === "tag" ? ASSET.tag : ASSET.lt)}" alt="FB Fretes e Mudanças">`;
const cbx = on => `<i class="cb${on ? " on" : ""}">${on ? "✓" : ""}</i>`;
const ln = (l, v, cls) => `<div class="ln${cls ? " " + cls : ""}"><span class="l">${l}</span><span class="v">${esc(v)}</span></div>`;

function addrBox(title, a, full = true) {
  return `<div class="bx"><div class="tg">${title}</div>` +
    `<div style="display:grid;grid-template-columns:1fr 64px;gap:10px">${ln("Rua / Avenida:", a.rua)}${ln("Nº:", a.num)}</div>` +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${ln("Bairro:", a.bairro)}${ln("Cidade:", a.cidade)}</div>` +
    ln("Complemento / ponto de referência:", a.comp) +
    (full
      ? `<div class="ln"><span class="v"></span></div><div style="display:grid;grid-template-columns:110px 1fr;gap:10px">${ln("CEP:", a.cep)}${ln("Data / horário previsto:", fmtDT(a.dh))}</div>`
      : ln("Data / horário previsto:", fmtDT(a.dh))) + `</div>`;
}
function itemsHalf(arr, sizes = true) {
  const cols = sizes ? "" : ' style="grid-template-columns:34px 1fr"';
  let h = `<div><div class="ith"${cols}><div>QUANT.</div><div>DESCRIÇÃO DO ITEM</div>` +
    (sizes ? `<div class="tm"><span>TAMANHO</span><div><i>P</i><i>M</i><i>G</i></div></div>` : "") + `</div>`;
  arr.forEach(r => {
    h += `<div class="itr"${cols}><div>${esc(r.q)}</div><div>${esc(r.d)}</div>` +
      (sizes ? `<div class="sz3"><span>${cbx(r.p)}</span><span>${cbx(r.m)}</span><span>${cbx(r.g)}</span></div>` : "") + `</div>`;
  });
  return h + `</div>`;
}
function obsLines(t) {
  const out = [];
  String(t || "").split(/\n/).forEach(l => { while (l.length > 64) { let cut = l.lastIndexOf(" ", 64); if (cut < 30) cut = 64; out.push(l.slice(0, cut)); l = l.slice(cut).trim(); } out.push(l); });
  let h = ""; for (let i = 0; i < Math.max(4, Math.min(out.length, 5)); i++) h += `<div class="ln"><span class="v" style="font-size:9.5px">${esc(out[i] || "")}</span></div>`;
  return h;
}
const empresaBox = cfg => `<div class="bx"><div class="tg">Dados da empresa</div><div class="co"><div class="lg">${logoHTML(cfg, "dk")}</div><div class="tx"><b>FB Fretes e Mudanças</b><br>${esc(cfg.cidade)}<br>WhatsApp: ${esc(cfg.tel)}<br>Instagram: @${esc(igName(cfg))}<br>E-mail: ${esc(cfg.email)}</div></div></div>`;
const tipoBox = s => `<div class="bx"><div class="tg">Tipo de serviço</div>${TIPOS.map(t => `<div class="opt">${cbx(s.tipo[t[0]])}${t[1]}</div>`).join("")}<div class="opt">${cbx(!!s.tipoOutro)}Outro:<span class="v">${esc(s.tipoOutro)}</span></div></div>`;
const valoresBox = (s, T) => `<div class="bx vals"><div class="tg">Valores</div>${ln("Valor do frete / diária: R$", money(s.frete))}${ln("Desconto: R$", money(s.desconto))}<div class="vtot"><small>Valor total</small><div>${brl(T.tot)}</div></div></div>`;

function header(cfg, o) {
  return `<div class="hd"><div class="hl"><div class="hl1"><div class="logo">${logoHTML(cfg, "tag")}</div><div class="truck"><img src="${cfg.truck || ASSET.truck}" alt=""></div></div>` +
    `<div class="strip"><div><b>${esc(cfg.tel)}</b><small>Fale conosco pelo WhatsApp</small></div><div><b style="font-size:12px;line-height:1.1">${esc(cfg.regiao)}</b><small>Atendimento local e regional</small></div><div><b>@${esc(igName(cfg))}</b><small>Siga nosso Instagram</small></div></div></div>` +
    `<div class="hr"><div class="ostit"><div class="a"><b>${o.titulo}</b><small>${o.sub}</small></div><div class="b"><small>${o.rotulo}</small><b>${pad(o.num)}</b></div></div><div class="osd">${o.datas}</div></div></div>`;
}
function footer(cfg) {
  const waNum = "55" + digits(cfg.tel).replace(/^55/, "");
  const wa = qrURI(cfg.waUrl || ("https://wa.me/" + waNum)), ig = qrURI("https://instagram.com/" + igName(cfg)), rv = cfg.reviewUrl ? qrURI(cfg.reviewUrl) : "";
  return `<div class="ft"><div class="qc"><b>Fale conosco<br>via WhatsApp</b><img src="${wa}" alt=""><small>Escaneie o QR Code</small></div>` +
    `<div class="qc"><b>Avalie nosso<br>serviço</b>${rv ? `<img src="${rv}" alt="">` : `<div class="soon">Em breve</div>`}<small>Deixe sua avaliação</small></div>` +
    `<div class="qc"><b>Siga nosso<br>Instagram</b><img src="${ig}" alt=""><small>@${esc(igName(cfg))}</small></div>` +
    `<div class="why"><h4>Por que escolher a FB Fretes e Mudanças?</h4><ul><li>Atendimento rápido e personalizado</li><li>Agilidade e pontualidade</li><li>Transporte seguro e confiável</li><li>Cuidado com seus bens</li><li>Preços justos e transparentes</li></ul><div class="lg2">${logoHTML(cfg)}</div></div></div>` +
    `<div class="bar"><span>Seu conforto é o nosso compromisso!</span><span>♥ Obrigado pela confiança!</span></div>`;
}
const sign = (titulo, data) => `<div><b class="h">${titulo}</b><div class="sgn"><i>x</i></div><div class="ln" style="margin-top:5px"><span class="l">Data:</span><span class="v">${fmtD(data)}</span></div></div>`;

/* ---------- Ordem de Serviço ---------- */
export function sheetOS(s, cfg) {
  const T = totals(s), o = s.itens, rest = T.res, payAmt = s.pixValor ? (rest > 0 ? rest : T.tot) : 0;
  const pixP = pixPayload(cfg.pixKey, cfg.pixNome, cfg.pixCidade, payAmt, "OS" + pad(s.num));
  const pixImg = pixP ? `<img src="${qrURI(pixP)}" alt="QR PIX">` : `<div class="no">Informe a chave PIX em Ajustes</div>`;
  const I = (k, l) => `<div class="opt">${cbx(s.info[k])}${l}</div>`;
  let h = header(cfg, { titulo: "Ordem de Serviço", sub: "Comprovante de frete", rotulo: "Nº DA O.S.", num: s.num,
    datas: ln("Data:", fmtD(s.data)) + `<div class="l2">${ln("Hora início:", s.horaIni)}${ln("Hora término:", s.horaFim)}</div>` });
  h += `<div class="bd">`;
  h += `<div class="gr" style="grid-template-columns:1fr 1.18fr">${empresaBox(cfg)}<div class="bx"><div class="tg">Dados do cliente</div>${ln("Nome completo:", s.cliNome)}${ln("Telefone / WhatsApp:", s.cliTel)}${ln("CPF (opcional):", s.cliCpf)}${ln("E-mail (opcional):", s.cliEmail)}</div></div>`;
  h += `<div class="gr" style="grid-template-columns:1fr 1fr">${addrBox("Endereço de coleta (carga)", s.col)}${addrBox("Endereço de entrega (descarga)", s.ent)}</div>`;
  h += `<div class="bx" style="padding-top:17px"><div class="tg">Itens transportados</div><div class="gr" style="grid-template-columns:1fr 1fr;gap:6px">${itemsHalf(o.slice(0, 5))}${itemsHalf(o.slice(5, 10))}</div><div style="font-size:7.5px;margin-top:3px;color:#555;font-weight:500"><span style="color:var(--r);font-weight:700">(!)</span> Informar qualquer item especial ou de valor no campo de observações.</div></div>`;
  h += `<div class="gr" style="grid-template-columns:.95fr 1.7fr .95fr">${tipoBox(s)}` +
    `<div class="bx"><div class="tg">Informações do serviço</div><div class="gr" style="grid-template-columns:1fr 1fr;gap:6px">` +
    `<div>${I("acompanha", "Cliente acompanha o transporte")}${I("apenas", "Apenas transporte")}${I("carreg", "Carregamento")}${I("descarreg", "Descarregamento")}<div class="opt">${cbx(s.info.escadas)}Subida por escadas</div><div class="opt" style="padding-left:15px">Andar:<span class="v">${esc(s.andar)}</span></div></div>` +
    `<div>${I("desmont", "Necessita desmontagem")}${I("mont", "Necessita montagem")}${I("fragil", "Material frágil")}${I("embal", "Embalagem por conta do cliente")}<div class="opt" style="margin-top:3px">Outros:<span class="v">${esc(s.infoOutros)}</span></div></div></div>` +
    `<div class="opt" style="margin-top:2px">${cbx(s.info.elevador)}Elevador</div></div>${valoresBox(s, T)}</div>`;
  h += `<div class="gr" style="grid-template-columns:.8fr .85fr 1.2fr;"><div class="bx" style="display:grid;grid-template-columns:1fr auto;gap:6px;padding-right:6px"><div class="tg">Forma de pagamento</div><div>${PGTOS.map(t => `<div class="opt" style="height:19px">${cbx(s.pgto[t[0]])}${t[1]}</div>`).join("")}</div><div class="pix"><small style="font-weight:700;color:#fff;background:var(--r);padding:1px 5px;border-radius:2px">PIX DA EMPRESA</small>${pixImg}</div></div>` +
    `<div class="bx"><div class="tg">Pagamento</div><div class="vals" style="margin-top:3px">${ln("Valor pago: R$", money(s.pago))}${ln("Valor restante: R$", money(rest))}</div></div>` +
    `<div class="bx obs"><div class="tg">Observações gerais</div>${obsLines(s.obs)}</div></div>`;
  h += `<div class="bx term" style="padding:7px 0 7px;display:grid"><div><b class="h"><span style="color:var(--r)">◆</span> Termo de responsabilidade e aceite</b><p>Declaro que as informações acima estão corretas e que o serviço foi contratado conforme acordado entre as partes. Estou ciente de que a empresa não se responsabiliza por objetos não informados, materiais frágeis não identificados ou valores não declarados. A conferência dos itens é de responsabilidade do cliente no momento da coleta e da entrega.</p></div>` +
    sign("Assinatura do cliente", s.dataCli) + sign("Assinatura do responsável<br>FB Fretes e Mudanças", s.dataResp) + `</div>`;
  return h + `</div>` + footer(cfg);
}

/* ---------- Orçamento: imagem vertical 2:3 (768 x 1152), feita para enviar pelo WhatsApp ---------- */
// Ícones em traço (estilo Feather, licença MIT), embutidos como imagem para sair certo no PNG/PDF.
const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  thumb: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
  truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'
};
ICONS.wa = '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><g transform="translate(6.9 6.7) scale(.42)">' + ICONS.phone + '</g>';
const icon = (name, color, size, w = 2) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return `<img class="ic" style="width:${size}px;height:${size}px" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="">`;
};
const daysBetween = (a, b) => {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(a || ""), pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b || "");
  return pa && pb ? Math.round((Date.UTC(+pb[1], pb[2] - 1, +pb[3]) - Date.UTC(+pa[1], pa[2] - 1, +pa[3])) / 86400000) : NaN;
};

export function sheetOrc(o, cfg) {
  const T = totals(o), sub = orcSub(o), desc = num(o.desconto), RED = "#d7141a";
  const linhas = (o.servicos || []).filter(x => (x.d || "").trim() || num(x.v));
  const dias = daysBetween(o.data, o.validade);
  const validade = dias > 0 ? dias + (dias === 1 ? " dia" : " dias") : (o.validade ? "até " + fmtD(o.validade) : "a combinar");
  const local = (k, a, ic) => `<div class="col">${icon("home", RED, 46, 1.8)}<div><small class="k">${k}</small><b>${esc([a.rua, a.num].filter(Boolean).join(", ") || "—")}</b><span>${esc([a.bairro, a.cidade].filter(Boolean).join(" – "))}</span></div></div>`;
  const row = (d, v, cls = "") => `<div class="r ${cls}"><span>${d}</span><b>${v}</b></div>`;
  let h = `<div class="oh"><i class="sl a"></i><i class="sl b"></i><i class="sw"></i>` +
    `<img class="lg" src="${cfg.logo || ASSET.tag}" alt="FB Fretes e Mudanças"><div class="tk"><img src="${cfg.truck || ASSET.truck}" alt=""><i class="fade"></i></div></div>` +
    `<div class="ob">${icon("doc", "#fff", 48, 1.7)}<div class="t">Orçamento</div><div class="n"><b>Nº ${padO(o.num)}</b><small>Emitido em: ${fmtD(o.data)}</small></div></div>` +
    `<div class="om">` +
    `<div class="oc cl">${icon("user", RED, 58, 1.6)}<div><small class="k">Dados do cliente</small><div class="nm">${esc(o.cliNome || "—")}</div>${o.cliTel ? `<div class="ph">${icon("phone", "#14171a", 17, 2)}${esc(o.cliTel)}</div>` : ""}</div></div>` +
    `<div class="oc tp"><div class="hd">${icon("pin", RED, 22, 2)}Detalhes do transporte</div><div class="bd">${local("Local de carga", o.col)}${local("Local de descarga", o.ent)}</div></div>` +
    `<div class="oc sv${linhas.length > 4 ? " dn" : ""}"><div class="hd"><span>${icon("check", "#fff", 24, 2)}Serviços contratados</span><span>Valor</span></div>` +
    (linhas.length ? linhas.map(x => row(esc(x.d), num(x.v) ? brl(num(x.v)) : "")).join("") : row("—", "")) +
    row("Subtotal", brl(sub), "st") + (desc > 0 ? row("Desconto", "- " + brl(desc), "dc") : "") + `</div>` +
    `<div class="ot"><div class="rg">${icon("dollar", "#fff", 32, 2)}</div><i class="sep"></i><div><small>Valor total do orçamento</small><b>${brl(T.tot)}</b></div></div>` +
    `<div class="cd"><div class="tab">${icon("doc", "#fff", 18, 2)}Condições do orçamento</div><div class="oc">` +
    `<div class="ci">${icon("cal", RED, 34, 1.8)}<div><small>Validade:</small><b>${esc(validade)}</b></div></div>` +
    `<div class="ci">${icon("card", RED, 34, 1.8)}<div><small>Pagamento:</small><b>${esc(o.condPgto || "a combinar")}</b></div></div>` +
    `<div class="ci">${icon("info", RED, 34, 1.8)}<div><small>Data do serviço:</small><b>${esc(fmtDT(o.col && o.col.dh) || "a combinar")}</b></div></div></div></div>` +
    ((o.obs || "").trim() ? `<div class="oc obs"><b>Observações:</b> ${esc(o.obs.replace(/\s+/g, " "))}</div>` : "") +
    `<div class="ok">${icon("thumb", "#0a0a0a", 44, 1.8)}<i class="vb"></i><div><b>Obrigado pela preferência!</b><small>Será um prazer realizar seu transporte. Conte com a FB Fretes e Mudanças.</small></div></div></div>` +
    `<div class="of"><i class="sl a"></i><i class="sl b"></i><div class="tx"><b>FB Fretes e Mudanças</b><small>Seu transporte, nossa responsabilidade.</small></div>` +
    `<div class="rt">${icon("wa", "#fff", 40, 1.6)}<span>${esc(cfg.tel)}</span><i class="sep"></i>${icon("truck", "#fff", 40, 1.6)}</div></div>`;
  return h;
}

/* ---------- tamanhos das folhas e prévia ---------- */
export const A4  = { w: 794, h: 1123, cls: "sheet", scale: 3.2, mm: [210, 297] };
export const ORC = { w: 768, h: 1152, cls: "orc",   scale: 2,   mm: [160, 240] };

/** Desenha a folha na prévia, escalando para caber na largura disponível. */
export function paintPreview(host, html, size = A4) {
  if (!host || host.offsetParent === null) return;
  let sh = host.firstChild;
  if (!(sh && sh.classList && sh.classList.contains(size.cls))) { host.innerHTML = `<div class="${size.cls}"></div>`; sh = host.firstChild; }
  sh.innerHTML = html;
  const k = Math.min(1, host.clientWidth / size.w);
  sh.style.transform = `scale(${k})`; host.style.height = (size.h * k) + "px";
}
