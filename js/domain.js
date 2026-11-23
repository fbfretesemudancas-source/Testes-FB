// Regras de negócio e modelos (sem DOM, fácil de testar). Campos das OS iguais ao projeto base.
import { num, today, digits, fmtD, fmtDT, brl, pad, padO, money, firstName } from "./utils.js";

export const TIPOS = [["frete","Frete"],["mudanca","Mudança"],["diaria","Diária"],["moveis","Transporte de móveis"],["eletro","Transporte de eletrodomésticos"]];
export const INFOS = [["acompanha","Cliente acompanha o transporte"],["apenas","Apenas transporte"],["carreg","Carregamento"],["descarreg","Descarregamento"],["escadas","Subida por escadas"],["elevador","Elevador"],["desmont","Necessita desmontagem"],["mont","Necessita montagem"],["fragil","Material frágil"],["embal","Embalagem por conta do cliente"]];
export const PGTOS = [["pix","PIX"],["dinheiro","Dinheiro"],["cartao","Cartão"],["transf","Transferência"]];
export const ITEM_SUG = ["Geladeira","Fogão","Máquina de lavar","Sofá","Cama box","Cama de solteiro","Guarda-roupa","Mesa de jantar","Cadeiras","Rack / painel de TV","Televisão","Colchão","Caixas","Micro-ondas","Ar-condicionado","Estante","Penteadeira","Bicicleta"];
export const SERV_SUG = ["Frete e transporte","Ajudantes","Embalagem","Montagem e desmontagem","Subida por escadas","Seguro da carga","Taxa de deslocamento"];
export const COND_SUG = ["a combinar","50% de entrada e 50% na entrega","30% de entrada e o restante na entrega","À vista (PIX)","Pagamento na entrega"];
export const STATUS_OS  = [["aberta","Aberta"],["andamento","Em andamento"],["concluida","Concluída"],["cancelada","Cancelada"]];
export const STATUS_ORC = [["rascunho","Rascunho"],["aguardando","Aguardando aprovação"],["convertido","Aprovado"],["recusado","Recusado"]];
export const label = (list, k) => (list.find(x => x[0] === k) || [0, k])[1];

export const blankAddr = () => ({ rua: "", num: "", bairro: "", cidade: "", comp: "", cep: "", dh: "" });
const blankItens = () => Array.from({ length: 10 }, () => ({ q: "", d: "", p: false, m: false, g: false }));

export function blankOS(n) {
  return { num: n, data: today(), status: "aberta", clientId: "", orcamentoId: "", horaIni: "", horaFim: "",
    cliNome: "", cliTel: "", cliCpf: "", cliEmail: "", col: blankAddr(), ent: blankAddr(), itens: blankItens(),
    veiculo: "", equipe: "", pagFunc: "", tipo: {}, tipoOutro: "", info: {}, andar: "", infoOutros: "", frete: "", desconto: "", pago: "", pgto: {}, // pagFunc: quanto cada funcionário pago por frete recebe neste serviço (uso interno)
    pixValor: false, obs: "", dataCli: "", dataResp: "" };
}
export function blankOrc(n) {
  return { num: n, data: today(), validade: today(7), status: "rascunho", clientId: "", osId: "",
    cliNome: "", cliTel: "", cliEmail: "", col: blankAddr(), ent: blankAddr(), saida: blankAddr(), saidaFim: "", // saida: só se o veículo NÃO sair da partida padrão · saidaFim: "" = volta ao mesmo endereço · "base" = termina na partida padrão
    veiculo: "", equipe: "", pagFunc: "", servicos: Array.from({ length: 6 }, () => ({ d: "", v: "" })), condPgto: "",
    calc: { km: "", horas: "", ajudantes: "", extras: "" }, rota: null,
    tipo: {}, tipoOutro: "", frete: "", desconto: "", obs: "" };
}
/** Subtotal = soma dos serviços. O campo "frete" guarda esse subtotal (assim totals() e a conversão em OS seguem iguais). */
export const orcSub = o => (o.servicos || []).reduce((s, x) => s + num(x.v), 0);
export function syncOrc(o) { const s = orcSub(o); o.frete = s ? money(s) : ""; return o; }

export const totals = s => { const t = Math.max(0, num(s.frete) - num(s.desconto)); return { tot: t, res: Math.max(0, t - num(s.pago)) }; };
/** OS antiga (sem campo status): passada = concluída, futura/hoje = aberta. */
export const osStatus = o => o.status || (o.data && o.data < today() ? "concluida" : "aberta");

/** Ordens/orçamentos de um cliente: por clientId, ou pelo mesmo telefone (pega as OS antigas). */
export function ofClient(c, list) {
  const t = digits(c.tel);
  return list.filter(o => (c._id && o.clientId === c._id) || (!o.clientId && t.length >= 10 && digits(o.cliTel) === t));
}
export function clientStats(c, orders) {
  const mine = ofClient(c, orders).filter(o => osStatus(o) !== "cancelada");
  const gasto = mine.reduce((s, o) => s + totals(o).tot, 0);
  const pago = mine.reduce((s, o) => s + Math.min(num(o.pago), totals(o).tot), 0);
  return { qtd: mine.length, gasto, pago, aberto: Math.max(0, gasto - pago) };
}
/** Endereços do cliente: os cadastrados à mão + todos que já apareceram em OS/orçamentos dele. */
export function clientAddresses(c, orders, orcs) {
  const out = [], seen = new Set();
  const add = (a, origem) => {
    if (!a || !(a.rua || a.bairro)) return;
    const k = [a.rua, a.num, a.bairro, a.cidade].map(x => String(x || "").trim().toLowerCase()).join("|");
    if (seen.has(k)) return; seen.add(k);
    out.push({ rua: a.rua || "", num: a.num || "", bairro: a.bairro || "", cidade: a.cidade || "", comp: a.comp || "", cep: a.cep || "", coord: a.coord || "", geo: a.geo || null, origem });
  };
  (c.enderecos || []).forEach(a => add(a, "cadastrado"));
  [...ofClient(c, orders), ...ofClient(c, orcs)].forEach(o => { add(o.col, "coleta"); add(o.ent, "entrega"); });
  return out;
}
export const addrText = a => [[a.rua, a.num].filter(Boolean).join(", "), a.bairro, a.cidade].filter(Boolean).join(" - ");

/** Orçamento aprovado → nova OS (mesmos dados, sem digitar de novo). */
export function orcToOS(orc, n) {
  const s = blankOS(n), dh = (orc.col && orc.col.dh) || "";
  const linhas = (orc.servicos || []).filter(x => (x.d || "").trim() || num(x.v));
  let obs = orc.obs || "";
  if (linhas.length) obs += (obs ? "\n" : "") + "Orçamento " + padO(orc.num) + ": " + linhas.map(x => x.d + (num(x.v) ? " (R$ " + x.v + ")" : "")).join("; ");
  if (orc.condPgto) obs += (obs ? "\n" : "") + "Pagamento combinado: " + orc.condPgto;
  Object.assign(s, { veiculo: orc.veiculo || "", equipe: orc.equipe || "", pagFunc: orc.pagFunc || "", clientId: orc.clientId || "", orcamentoId: orc._id || "", cliNome: orc.cliNome, cliTel: orc.cliTel, cliEmail: orc.cliEmail || "",
    col: { ...blankAddr(), ...orc.col }, ent: { ...blankAddr(), ...orc.ent }, tipo: { ...(orc.tipo || {}) }, tipoOutro: orc.tipoOutro || "",
    frete: orc.frete || (orcSub(orc) ? money(orcSub(orc)) : ""), desconto: orc.desconto || "", obs });
  if (/^\d{4}-\d{2}-\d{2}T/.test(dh)) { s.data = dh.slice(0, 10); s.horaIni = dh.slice(11, 16); }
  return s;
}

/* ---------- Textos do WhatsApp (modelos editáveis em Configurações) ---------- */
export const DEFAULT_MSG = {
  orcamento: "Olá, {nome}! Segue o orçamento {numero} da {empresa}.\nColeta: {coleta}\nEntrega: {entrega}\n{servicos}\nDesconto: {desconto}\nValor total: {total}\nPagamento: {pagamento}\nVálido até {validade}\nPara aprovar, é só responder esta mensagem.",
  os: "Olá, {nome}! Segue o resumo da OS {numero} da {empresa}.\nColeta: {coleta}\nEntrega: {entrega}\nValor total: {total}\nJá pago: {pago}\nRestante: {restante}",
  confirmacao: "Olá, {nome}! Seu serviço com a {empresa} está confirmado.\nOrdem de serviço: {numero}\nData: {data}\nHorário: {horario}\nColeta: {coleta}\nEntrega: {entrega}\nValor total: {total}\nJá pago: {pago}\nQualquer dúvida, é só chamar neste número.",
  cobranca: "Olá, {nome}! Tudo bem? Passando para lembrar do pagamento da OS {numero} ({empresa}).\nValor pendente: {pendente}\nChave PIX: {pix}\nAssim que pagar, pode me enviar o comprovante por aqui. Obrigado!",
  conclusao: "Olá, {nome}! Seu serviço foi concluído. Obrigado por escolher a {empresa}!\nOS: {numero}\nValor pendente: {pendente}\nChave PIX: {pix}\nSe puder, avalie nosso atendimento: {avaliacao}\nQualquer necessidade, estamos à disposição!"
};
export const MSG_VARS = {
  orcamento: [["nome", "Primeiro nome do cliente"], ["nome_completo", "Nome completo"], ["numero", "Número do orçamento"], ["empresa", "Nome da empresa"], ["coleta", "Endereço de carga"], ["entrega", "Endereço de descarga"], ["servicos", "Lista de serviços com valores"], ["desconto", "Desconto"], ["total", "Valor total"], ["pagamento", "Condição de pagamento"], ["validade", "Data de validade"], ["data_servico", "Data do serviço"]],
  os: [["nome", "Primeiro nome do cliente"], ["nome_completo", "Nome completo"], ["numero", "Número da OS"], ["empresa", "Nome da empresa"], ["coleta", "Endereço de carga"], ["entrega", "Endereço de descarga"], ["total", "Valor total"], ["pago", "Valor já pago"], ["restante", "Valor restante"], ["data", "Data do serviço"], ["horario", "Hora de início"]]
};
// As mensagens ligadas à OS (resumo, confirmação, cobrança, conclusão) usam as mesmas variáveis.
const OS_VARS = MSG_VARS.os.concat([["pendente", "Valor que ainda falta pagar"], ["pix", "Chave PIX (só aparece se ainda há valor a pagar)"], ["avaliacao", "Link de avaliação"], ["telefone", "Telefone da empresa"]]);
MSG_VARS.os = MSG_VARS.confirmacao = MSG_VARS.cobranca = MSG_VARS.conclusao = OS_VARS;
/** Troca {chaves} pelos valores. Linha cujos valores estão todos vazios é omitida (ex.: sem desconto, some a linha do desconto). */
export function renderTpl(tpl, vars) {
  return String(tpl || "").split("\n").map(line => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    if (keys.length && keys.every(k => k in vars && !String(vars[k] == null ? "" : vars[k]).trim())) return null;
    return line.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] == null ? "" : vars[k]) : m));
  }).filter(l => l !== null).join("\n").replace(/Olá,\s*!/g, "Olá!");
}
const addrLine = a => (a && (a.bairro || a.rua)) ? [a.rua, a.num, a.bairro].filter(Boolean).join(", ") : "";
export function varsOrc(o, cfg = {}) {
  const T = totals(o), ls = (o.servicos || []).filter(x => (x.d || "").trim());
  return { nome: firstName(o.cliNome), nome_completo: o.cliNome || "", numero: padO(o.num), empresa: cfg.empresa || "FB Fretes e Mudanças",
    coleta: addrLine(o.col), entrega: addrLine(o.ent), servicos: ls.map(x => "• " + x.d + (num(x.v) ? ": " + brl(num(x.v)) : "")).join("\n"),
    desconto: num(o.desconto) > 0 ? brl(num(o.desconto)) : "", total: brl(T.tot), pagamento: o.condPgto || "",
    validade: o.validade ? fmtD(o.validade) : "", data_servico: fmtDT(o.col && o.col.dh) };
}
export function varsOS(s, cfg = {}) {
  const T = totals(s), pago = num(s.pago);
  return { nome: firstName(s.cliNome), nome_completo: s.cliNome || "", numero: pad(s.num), empresa: cfg.empresa || "FB Fretes e Mudanças",
    coleta: addrLine(s.col), entrega: addrLine(s.ent), total: brl(T.tot), pago: pago > 0 ? brl(pago) : "", restante: pago > 0 ? brl(T.res) : "",
    data: fmtD(s.data), horario: s.horaIni || "", pendente: T.res > 0 ? brl(T.res) : "",
    pix: T.res > 0 ? (cfg.pixKey || "") : "", avaliacao: cfg.reviewUrl || "", telefone: cfg.tel || "" };
}
export const waTextOrc = (o, cfg = {}) => renderTpl((cfg.msgs && cfg.msgs.orcamento) || DEFAULT_MSG.orcamento, varsOrc(o, cfg));
/** kind: "os" (resumo), "confirmacao", "cobranca" ou "conclusao". */
export const waTextOS = (s, cfg = {}, kind = "os") => renderTpl((cfg.msgs && cfg.msgs[kind]) || DEFAULT_MSG[kind], varsOS(s, cfg));

/* ---------- Cálculo do preço sugerido (valores vêm de Configurações) ---------- */
export const DEFAULT_PRECO = { consumo: "10", combustivel: "6,20", manutencaoKm: "0,50", horaMotorista: "40,00", horaAjudante: "25,00",
  ajudantes: "1", horasServico: "2", pctDeslocamento: "100", custoFixo: "0,00", margem: "30", minimo: "150,00", arredondar: "5" };
/**
 * Custo = combustível + manutenção + mão de obra (serviço + viagem) + custo fixo + extras.
 * Preço = custo × (1 + margem), arredondado e respeitando o mínimo. Devolve também as linhas prontas para o orçamento.
 */
export function calcPreco(p, i) {
  const n = k => num(p[k]), km = Math.max(0, num(i.km)), hServ = Math.max(0, num(i.horas)), aj = Math.max(0, Math.floor(num(i.ajudantes))), extras = Math.max(0, num(i.extras));
  const hViagem = Math.max(0, num(i.minViagem)) / 60 * Math.min(100, Math.max(0, n("pctDeslocamento"))) / 100, horas = hServ + hViagem;
  const combustivel = n("consumo") > 0 ? km / n("consumo") * n("combustivel") : 0, manutencao = km * n("manutencaoKm");
  const motorista = horas * n("horaMotorista"), ajudantes = horas * aj * n("horaAjudante"), fixo = n("custoFixo");
  const custo = combustivel + manutencao + motorista + ajudantes + fixo + extras;
  const m = 1 + n("margem") / 100, step = Math.max(1, n("arredondar") || 1), up = v => Math.ceil(v / step - 1e-9) * step;
  const lines = [{ d: "Frete e transporte", v: up((combustivel + manutencao + motorista + fixo) * m) }];
  if (ajudantes > 0) lines.push({ d: "Ajudante" + (aj > 1 ? "s (" + aj + ")" : ""), v: up(ajudantes * m) });
  if (extras > 0) lines.push({ d: "Pedágio / taxas", v: extras });
  let preco = lines.reduce((s, l) => s + l.v, 0), abaixoMin = false;
  if (preco < n("minimo")) { lines[0].v += up(n("minimo") - preco); preco = lines.reduce((s, l) => s + l.v, 0); abaixoMin = true; }
  return { km, hServ, hViagem, horas, aj, combustivel, manutencao, motorista, ajudantes, fixo, extras, custo, preco, lucro: preco - custo,
    margemReal: custo > 0 ? (preco - custo) / custo * 100 : 0, abaixoMin, lines: lines.map(l => ({ d: l.d, v: money(l.v) })) };
}

/** Completa um registro salvo (inclusive OS antigas) com todos os campos do modelo. */
export function normOS(rec) {
  const b = blankOS(rec.num), s = { ...b, ...rec };
  s.col = { ...blankAddr(), ...rec.col }; s.ent = { ...blankAddr(), ...rec.ent };
  s.itens = b.itens.map((x, i) => ({ ...x, ...((rec.itens || [])[i] || {}) }));
  s.tipo = { ...rec.tipo }; s.info = { ...rec.info }; s.pgto = { ...rec.pgto };
  s.status = osStatus(rec);
  return s;
}
export function normOrc(rec) {
  const b = blankOrc(rec.num), s = { ...b, ...rec };
  s.col = { ...blankAddr(), ...rec.col }; s.ent = { ...blankAddr(), ...rec.ent }; s.saida = { ...blankAddr(), ...rec.saida }; s.tipo = { ...rec.tipo };
  s.servicos = b.servicos.map((x, i) => ({ ...x, ...((rec.servicos || [])[i] || {}) }));
  s.calc = { ...b.calc, ...(rec.calc || {}) };
  // orçamento criado antes das linhas de serviço: o frete vira a primeira linha
  if (!(rec.servicos || []).some(x => x.d || x.v) && num(rec.frete) > 0) s.servicos[0] = { d: "Frete e transporte", v: rec.frete };
  return syncOrc(s);
}
export const blankClient = () => ({ nome: "", tel: "", doc: "", email: "", obs: "", contatos: [], enderecos: [], links: [] });
