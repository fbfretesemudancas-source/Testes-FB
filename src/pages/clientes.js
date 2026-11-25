// Clientes: cada cliente tem uma ficha (cadastro, contatos, endereços, fotos/documentos por link,
// observações e histórico). #/clientes lista · #/clientes?id=ID ficha · #/clientes?novo=1 novo
import { pageHead } from "../components/pageHead.js";
import { esc, brl, pad, padO, fmtD, toast, waLink, isUrl, digits, firstName, numCurto } from "../../js/utils.js";
import { listAll, saveItem, removeItem } from "../firebase/db.js";
import { STATUS_OS, STATUS_ORC, label, blankClient, clientStats, clientAddresses, ofClient, osStatus, totals, addrText } from "../../js/domain.js";
import { fillForm, bindForm } from "../components/formKit.js";
import { btn, group, bar, armBtn } from "../components/ui.js";
import { searchBarHTML, bindListBar } from "../components/listKit.js";

const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
const link = (href, txt, cls = "btn sm") => `<a class="${cls}" href="${href}">${txt}</a>`;

export async function render(root) {
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  const q = params();
  try { await (q.has("id") || q.has("novo") ? ficha(view, q) : list(view)); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Clientes") + '<div class="banner">Não foi possível carregar. Confira a conexão e as regras do Firestore.</div>'; }
}

/* ============================ LISTA ============================ */
async function list(view) {
  const [clients, orders] = await Promise.all([listAll("clients"), listAll("orders")]);
  clients.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  let busca = "", lb;
  view.innerHTML = pageHead("Clientes", "Fichas com cadastro, histórico, contatos e endereços") +
    bar({ left: [btn({ label: "Novo cliente", ico: "plus", kind: "pri", href: "#/clientes?novo=1" }), btn({ label: "Importar das ordens existentes", ico: "upload", attrs: 'id="imp"' })] }) +
    searchBarHTML({ placeholder: "Buscar por nome, telefone ou CPF/CNPJ" }) +
    '<div class="hist" id="rows"></div>';
  const $ = s => view.querySelector(s);
  const draw = (texto = busca) => {
    busca = texto; const t = busca.toLowerCase().trim();
    $("#rows").innerHTML = clients.filter(c => !t || (c.nome + " " + c.tel + " " + c.doc).toLowerCase().includes(t)).map(c => {
      const st = clientStats(c, orders), last = ofClient(c, orders).map(o => o.data || "").sort().pop();
      return `<div class="h"><div class="n">${esc((c.nome || "?")[0].toUpperCase())}</div>
        <div class="t"><b>${esc(c.nome)}</b><small>${esc(c.tel || "sem telefone")} · ${st.qtd} serviço${st.qtd === 1 ? "" : "s"}${last ? " · último em " + fmtD(last) : ""}</small></div>
        <div class="v">${brl(st.gasto)}</div>
        <div class="b">${group(c.tel && btn({ label: "WhatsApp", ico: "whatsapp", kind: "wa", sm: true, href: esc(waLink(c.tel, "Olá, " + firstName(c.nome) + "!")), attrs: 'target="_blank" rel="noopener"' }))}${group(btn({ label: "Abrir ficha", ico: "eye", sm: true, href: "#/clientes?id=" + esc(c._id) }))}</div></div>`;
    }).join("") || '<div class="card note">Nenhum cliente encontrado. Cadastre um novo ou importe das ordens que você já tem.</div>';
    if (lb) lb.refresh();
  };
  draw();
  lb = bindListBar(view, { onSearch: draw, onClear: () => draw(""), active: () => 0 }); lb.refresh();
  $("#imp").addEventListener("click", async () => {
    // Cria clientes a partir das OS antigas (agrupando por telefone). Não altera nenhuma OS.
    const known = new Set(clients.map(c => digits(c.tel)).filter(Boolean)), novos = new Map(); let semTel = 0;
    orders.forEach(o => {
      const t = digits(o.cliTel);
      if (t.length < 10) { if ((o.cliNome || "").trim()) semTel++; return; }
      if (!known.has(t) && !novos.has(t) && (o.cliNome || "").trim()) novos.set(t, { ...blankClient(), nome: o.cliNome.trim(), tel: o.cliTel, doc: o.cliCpf || "", email: o.cliEmail || "" });
    });
    if (!novos.size) { toast(semTel ? `Nada a importar. ${semTel} OS estão sem telefone e foram ignoradas.` : "Nada a importar: todos os clientes já estão cadastrados."); return; }
    if (!window.confirm(`Criar ${novos.size} cliente(s) a partir das ordens existentes?${semTel ? `\n${semTel} OS sem telefone serão ignoradas.` : ""}`)) return;
    $("#imp").disabled = true;
    try { for (const c of novos.values()) clients.push(await saveItem("clients", c)); clients.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")); draw(); toast(novos.size + " cliente(s) importado(s)"); }
    catch (e) { console.error(e); toast("A importação parou no meio. Rode de novo para completar."); }
    $("#imp").disabled = false;
  });
}

/* ============================ FICHA ============================ */
async function ficha(view, q) {
  const [clients, orders, orcs] = await Promise.all([listAll("clients"), listAll("orders"), listAll("orcamentos")]);
  let C;
  if (q.get("id")) {
    const r = clients.find(c => c._id === q.get("id"));
    if (!r) { view.innerHTML = pageHead("Clientes") + '<div class="banner">Cliente não encontrado.</div><a class="btn" href="#/clientes">Voltar</a>'; return; }
    C = { ...blankClient(), ...r, contatos: [...(r.contatos || [])].map(x => ({ ...x })), enderecos: [...(r.enderecos || [])].map(x => ({ ...x })), links: [...(r.links || [])].map(x => ({ ...x })) };
  } else C = blankClient();

  const saved = !!C._id, st = saved ? clientStats(C, orders) : null;
  const myOrders = saved ? ofClient(C, orders).sort((a, b) => (Number(b.num) || 0) - (Number(a.num) || 0)) : [];
  const myOrcs = saved ? ofClient(C, orcs).sort((a, b) => (Number(b.num) || 0) - (Number(a.num) || 0)) : [];
  const used = saved ? clientAddresses(C, orders, orcs).filter(a => a.origem !== "cadastrado") : [];

  const actions = bar({
    left: [group(btn({ label: "Salvar", ico: "save", kind: "pri", cls: "js-save" })),
      group(saved && C.tel && btn({ label: "WhatsApp", ico: "whatsapp", kind: "wa", href: esc(waLink(C.tel, "Olá, " + firstName(C.nome) + "!")), attrs: 'target="_blank" rel="noopener"' })),
      group(saved && btn({ label: "Novo orçamento", ico: "plus", href: "#/orcamentos?novo=1&cliente=" + esc(C._id) }), saved && btn({ label: "Nova OS", ico: "plus", href: "#/ordens?novo=1&cliente=" + esc(C._id) }))],
    right: [saved && btn({ label: "Excluir", ico: "trash", kind: "danger", cls: "js-del" }), btn({ label: "Voltar à lista", ico: "arrowLeft", href: "#/clientes" })].filter(Boolean) });
  const hist = (list, kind) => list.map(o => {
    const s = kind === "os" ? osStatus(o) : (o.status || "rascunho");
    return `<div class="h"><div class="n"${kind === "os" ? "" : ' style="font-size:16px"'}>${numCurto(o.num)}</div><div class="t"><b>${esc([o.col && o.col.bairro, o.ent && o.ent.bairro].filter(Boolean).join(" → ") || "Sem endereço")}</b>
      <small>${fmtD(o.data)} · <span class="badge ${s}">${label(kind === "os" ? STATUS_OS : STATUS_ORC, s)}</span></small></div><div class="v">${brl(totals(o).tot)}</div>
      <div class="b">${btn({ label: "Abrir", ico: "eye", sm: true, href: (kind === "os" ? "#/ordens?id=" : "#/orcamentos?id=") + esc(o._id) })}</div></div>`;
  }).join("") || '<p class="note">Nada por aqui ainda.</p>';

  view.innerHTML = pageHead(saved ? C.nome : "Novo cliente", "Ficha do cliente") + actions + (saved ? `
    <div class="kpis"><div class="kpi big"><small>Total gasto na empresa</small><b>${brl(st.gasto)}</b></div><div class="kpi"><small>Serviços</small><b>${st.qtd}</b></div>
      <div class="kpi"><small>Já pago</small><b>${brl(st.pago)}</b></div><div class="kpi"><small>Em aberto</small><b>${brl(st.aberto)}</b></div></div>` : "") + `
    <div class="card"><h2>Cadastro</h2>
      <div class="row r1"><label class="f"><span>Nome completo</span><input data-k="nome" autocomplete="off"></label></div>
      <div class="row"><label class="f"><span>Telefone / WhatsApp</span><input data-k="tel" data-mask="tel" inputmode="tel" placeholder="(81) 99999-9999"></label>
        <label class="f"><span>CPF / CNPJ</span><input data-k="doc" data-mask="doc" inputmode="numeric"></label></div>
      <div class="row r1"><label class="f"><span>E-mail</span><input data-k="email" type="email"></label></div></div>
    <div class="card"><h2>Contatos</h2><div class="sublist" id="subContatos"></div>${btn({ label: "Adicionar contato", ico: "plus", sm: true, attrs: 'data-add="contatos"' })}
      <p class="note" style="margin-top:8px">Outras pessoas para falar sobre o serviço (cônjuge, porteiro, responsável pelo imóvel).</p></div>
    <div class="card"><h2>Endereços</h2><div class="sublist" id="subEnd"></div>${btn({ label: "Adicionar endereço", ico: "plus", sm: true, attrs: 'data-add="enderecos"' })}
      ${used.length ? `<div class="sub">Já utilizados em serviços</div><div class="used">${used.map(a => `<div>${esc(addrText(a))}${a.comp ? " · " + esc(a.comp) : ""} <small>(${a.origem})</small></div>`).join("")}</div>` : ""}
      <p class="note" style="margin-top:8px">Os endereços de coleta e entrega de cada serviço aparecem aqui sozinhos e podem ser reaproveitados numa nova OS.</p></div>
    <div class="card"><h2>Fotos e documentos</h2><div class="sublist" id="subLinks"></div>${btn({ label: "Adicionar link", ico: "plus", sm: true, attrs: 'data-add="links"' })}
      <p class="note" style="margin-top:8px">Guarde as fotos e documentos no Google Drive, Google Fotos ou iCloud e cole aqui o link de compartilhamento. O sistema guarda o link e abre com um toque.</p></div>
    <div class="card"><h2>Observações importantes</h2><div class="row r1"><label class="f"><span>Ex.: portaria exige agendamento, escada estreita, cliente prefere ligação</span><textarea data-k="obs" rows="4"></textarea></label></div>
      <p class="note">Aparece como aviso quando você escolher este cliente numa OS ou orçamento.</p></div>
    ${saved ? `<div class="card"><h2>Histórico de serviços</h2><div class="hist">${hist(myOrders, "os")}</div></div><div class="card"><h2>Orçamentos</h2><div class="hist">${hist(myOrcs, "orc")}</div></div>` : ""}
    ${actions}`;

  const $ = s => view.querySelector(s), $$ = s => [...view.querySelectorAll(s)];
  const subs = () => {
    $("#subContatos").innerHTML = C.contatos.map((x, i) => `<div class="subrow"><label class="f"><span>Nome / relação</span><input data-k="contatos.${i}.nome"></label><label class="f"><span>Telefone</span><input data-k="contatos.${i}.tel" data-mask="tel" inputmode="tel"></label>${btn({ label: "Remover", ico: "trash", kind: "danger", sm: true, attrs: 'data-rm="contatos" data-i="' + i + '"' })}</div>`).join("");
    $("#subEnd").innerHTML = C.enderecos.map((x, i) => `<div class="subrow addr"><label class="f"><span>Rua / Avenida</span><input data-k="enderecos.${i}.rua"></label><label class="f"><span>Nº</span><input data-k="enderecos.${i}.num"></label><label class="f"><span>Bairro</span><input data-k="enderecos.${i}.bairro"></label><label class="f"><span>Cidade</span><input data-k="enderecos.${i}.cidade"></label>${btn({ label: "Remover", ico: "trash", kind: "danger", sm: true, attrs: 'data-rm="enderecos" data-i="' + i + '"' })}</div>`).join("");
    $("#subLinks").innerHTML = C.links.map((x, i) => `<div class="subrow"><label class="f"><span>Descrição</span><input data-k="links.${i}.titulo" placeholder="Ex.: Fotos antes da mudança"></label><label class="f"><span>Link</span><input data-k="links.${i}.url" inputmode="url" placeholder="https://…"></label><div class="actions">${btn({ label: "Abrir", ico: "external", sm: true, attrs: 'data-open="' + i + '"' })}${btn({ label: "Remover", ico: "trash", kind: "danger", sm: true, attrs: 'data-rm="links" data-i="' + i + '"' })}</div></div>`).join("");
    fillForm(view, C);
  };
  subs();
  bindForm(view, C, () => {});
  view.addEventListener("click", e => {
    const add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]"), op = e.target.closest("[data-open]");
    if (add) { const k = add.dataset.add; C[k].push(k === "contatos" ? { nome: "", tel: "" } : k === "enderecos" ? { rua: "", num: "", bairro: "", cidade: "" } : { titulo: "", url: "" }); subs(); }
    if (rm) { C[rm.dataset.rm].splice(Number(rm.dataset.i), 1); subs(); }
    if (op) { const u = (C.links[Number(op.dataset.open)] || {}).url; if (isUrl(u)) window.open(u.trim(), "_blank", "noopener"); else toast("Cole um link válido (começando com https://)"); }
  });

  async function save() {
    if (!(C.nome || "").trim()) { toast("Informe o nome do cliente"); return; }
    const bad = C.links.find(l => (l.url || "").trim() && !isUrl(l.url)); if (bad) { toast("Link inválido: " + bad.url); return; }
    const rec = { ...C, nome: C.nome.trim(),
      contatos: C.contatos.filter(x => (x.nome || "").trim() || (x.tel || "").trim()),
      enderecos: C.enderecos.filter(x => (x.rua || "").trim() || (x.bairro || "").trim()),
      links: C.links.filter(x => (x.url || "").trim()).map(x => ({ titulo: (x.titulo || "").trim(), url: x.url.trim() })) };
    try { const s = await saveItem("clients", rec); toast("Cliente salvo"); if (!saved) location.hash = "#/clientes?id=" + s._id; else Object.assign(C, s); }
    catch (e) { console.error(e); toast("Não foi possível salvar o cliente."); }
  }
  $$(".js-save").forEach(b => b.addEventListener("click", save));
  $$(".js-del").forEach(b => b.addEventListener("click", async () => {
    if (!armBtn(b)) return;
    try { await removeItem("clients", C._id); toast("Cliente excluído. As ordens dele foram mantidas."); location.hash = "#/clientes"; }
    catch (e) { console.error(e); toast("Não foi possível excluir."); }
  }));
}
