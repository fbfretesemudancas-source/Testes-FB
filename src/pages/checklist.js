// Checklist de mudanças: um checklist por Ordem de Serviço, feito para preencher pelo celular.
//  · Antes: endereços, condição dos móveis, frágeis, fotos, materiais
//  · Durante: itens carregados, ocorrências, fotos, observações
//  · Depois: entrega, conferência dos itens, danos, conclusão (assinatura do cliente fica para depois)
// Dados: companies/{uid}/checklists (1 por OS) e, dentro dele, a subcoleção "fotos" (imagens já reduzidas).
import { pageHead } from "../components/pageHead.js";
import { esc, toast, fmtD, pad, num } from "../../js/utils.js";
import { listAll, saveItem, removeItem, photosOf, addPhoto, delPhoto } from "../firebase/db.js";
import { addrText, osStatus, label, STATUS_OS } from "../../js/domain.js";
import { icon } from "../components/icons.js";
import { btn, group, bar } from "../components/ui.js";
import { searchBarHTML, filterSec, bindListBar } from "../components/listKit.js";
import { stageProg, overall } from "../components/ckProgress.js";

const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
const STAGES = [["antes", "Antes"], ["durante", "Durante"], ["depois", "Depois"]];
const EST = [["bom", "Bom estado"], ["riscado", "Com marcas"], ["danificado", "Danificado"]];
const MATERIAIS = ["Cobertores", "Fita adesiva", "Plástico bolha / filme", "Cintas e cordas", "Carrinho / diabo", "Ferramentas de desmontagem"];
const mid = () => "x" + Math.random().toString(36).slice(2, 9);
const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const CSS = `
.ck-bar{height:10px;border-radius:6px;background:var(--line);overflow:hidden}.ck-bar i{display:block;height:100%;background:var(--ok);transition:width .2s}
.ck-stages{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.ck-stages button{padding:10px 6px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--fg);font:700 15px var(--f-body);cursor:pointer;text-align:center}
.ck-stages button small{display:block;font-weight:500;color:var(--mut);font-size:12px}
.ck-stages button[aria-selected="true"]{background:var(--red);border-color:var(--red);color:var(--red-fg)}.ck-stages button[aria-selected="true"] small{color:inherit;opacity:.9}
.ck-item{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--panel)}.ck-item.done{border-color:var(--ok)}
.ck-line{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 0;font-size:16px;cursor:pointer}
.ck-line input[type=checkbox]{width:24px;height:24px;flex:none;accent-color:var(--ok)}
.ck-f{display:block;margin:6px 0}.ck-f span{display:block;font-size:12px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.ck-in{width:100%;min-width:0;box-sizing:border-box;background:var(--field);border:1px solid var(--line);border-radius:8px;padding:11px 10px;font:inherit;font-size:16px;color:var(--fg)}
.ck-row{display:flex;gap:8px}.ck-row .ck-f:first-child{flex:1}.ck-row .ck-f.q{width:84px}
.ck-seg{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.ck-seg button{padding:9px 12px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--mut);font:600 14px var(--f-body);cursor:pointer}
.ck-seg button[aria-pressed="true"]{background:var(--red);border-color:var(--red);color:var(--red-fg)}
.ck-seg button.ok[aria-pressed="true"]{background:var(--ok);border-color:var(--ok)}
.ck-ph{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center}
.ck-ph .p{position:relative;width:78px;height:78px;border-radius:8px;overflow:hidden;border:1px solid var(--line)}
.ck-ph .p img{width:100%;height:100%;object-fit:cover;cursor:zoom-in;display:block}
.ck-ph .p button{position:absolute;top:2px;right:2px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.7);color:#fff;font-size:17px;line-height:1;cursor:pointer}
.ck-add{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.ck-add .ico{width:18px;height:18px}
.ck-status{font-size:13px;color:var(--mut);min-height:18px}.ck-flag{font-size:11px;font-weight:700;color:var(--red);border:1px solid var(--red);border-radius:999px;padding:1px 7px;margin-left:6px}
.ck-lb{position:fixed;inset:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;z-index:100;cursor:zoom-out}.ck-lb img{max-width:96vw;max-height:92vh}
.ck-oc{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.ck-oc b{color:var(--red)}
`;
const injectCss = () => { if (document.getElementById("ckCss")) return; const s = document.createElement("style"); s.id = "ckCss"; s.textContent = CSS; document.head.append(s); };

const newChecklist = os => ({
  osId: os._id, osNum: os.num, cliNome: os.cliNome || "",
  moveis: (os.itens || []).filter(i => (i.d || "").trim()).map(i => ({ id: mid(), nome: i.d.trim(), qtd: String(i.q || "").trim() || "1", tam: [i.p && "P", i.m && "M", i.g && "G"].filter(Boolean).join("/"), frag: false, estado: "", nota: "", carregado: false, entregue: false, dano: false, danoNota: "" })),
  materiais: MATERIAIS.map(n => ({ id: mid(), nome: n, ok: false })),
  resp: {}, compart: false, kmRetirada: "", kmDevolucao: "", consumoControlado: false, litrosDev: "", usoId: "", enderecosOk: false, ocorrencias: [], obsAntes: "", obsDurante: "", obsDepois: "", danosTexto: "", entregaOk: false, conclusaoOk: false, conclusaoEm: ""
});

/** Reduz a foto no próprio celular (máx. ~1280 px, JPEG) para caber no Firestore sem pesar. */
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("imagem inválida")); i.src = url; });
    for (const [max, q] of [[1280, 0.72], [1024, 0.6], [800, 0.5]]) {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q); if (out.length < 800000) return out;
    }
    throw new Error("foto grande demais");
  } finally { URL.revokeObjectURL(url); }
}

export async function render(root) {
  injectCss();
  const view = document.createElement("div"); root.append(view);
  view.innerHTML = '<p class="note">Carregando…</p>';
  try { const id = params().get("os"); id ? await detail(view, id) : await list(view); }
  catch (err) { console.error(err); view.innerHTML = pageHead("Checklist de mudanças") + '<div class="banner">Não foi possível carregar. Confira a conexão e tente de novo.</div>'; }
}

/* ---------- lista: escolher a OS ---------- */
async function list(view) {
  const [orders, cks] = await Promise.all([listAll("orders"), listAll("checklists")]);
  const byOs = Object.fromEntries(cks.map(c => [c.osId, c]));
  let filtro = "abertas", busca = "", lb;
  const FIL = [["abertas", "Em aberto"], ["concl", "Concluídas"], ["todas", "Todas"]];
  view.innerHTML = pageHead("Checklist de mudanças", "Escolha a OS para conferir antes, durante e depois do serviço") +
    searchBarHTML({ placeholder: "Buscar por cliente ou nº da OS", filtersHTML: filterSec("Situação", `<div class="chips" id="chips">${FIL.map(([k, l]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === filtro}">${l}</button>`).join("")}</div>`) }) +
    '<div class="hist" id="rows"></div>';
  const draw = () => {
    const t = busca.trim().toLowerCase();
    const rows = orders.filter(o => {
      const st = osStatus(o);
      if (filtro === "abertas" ? !["aberta", "andamento"].includes(st) : filtro === "concl" ? st !== "concluida" : false) return false;
      return !t || (String(o.cliNome || "") + " " + pad(o.num)).toLowerCase().includes(t);
    }).sort((a, b) => filtro === "abertas" ? String(a.data || "").localeCompare(String(b.data || "")) : String(b.data || "").localeCompare(String(a.data || "")));
    view.querySelector("#rows").innerHTML = rows.map(o => {
      const c = byOs[o._id], pc = c ? overall(c) : 0;
      return `<div class="h"><div class="n">${pad(o.num)}</div><div class="t"><b>${esc(o.cliNome || "Sem nome")}</b><small>${esc(fmtD(o.data))}${o.equipe ? " · " + esc(o.equipe) : ""}${o.veiculo ? " · " + esc(o.veiculo) : ""} · <span class="badge ${osStatus(o)}">${label(STATUS_OS, osStatus(o))}</span> · ${c ? "checklist " + pc + "%" : "ainda não iniciado"}</small></div>
        <div class="v"></div><div class="b">${btn({ label: c ? "Abrir checklist" : "Iniciar checklist", ico: c ? "clipboard" : "play", kind: "pri", sm: true, href: "#/checklist?os=" + esc(o._id) })}</div></div>`;
    }).join("") || '<div class="card note">Nenhuma OS encontrada neste filtro.</div>';
    if (lb) lb.refresh();
  };
  draw();
  lb = bindListBar(view, { onSearch: t => { busca = t; draw(); }, active: () => (filtro !== "abertas" ? 1 : 0), onApply: draw,
    onClear: () => { busca = ""; filtro = "abertas"; view.querySelectorAll("#chips .chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === filtro))); draw(); } });
  lb.refresh();
  view.querySelector("#chips").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; filtro = b.dataset.f; view.querySelectorAll("#chips .chip").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw(); });
}

/* ---------- checklist de uma OS ---------- */
async function detail(view, osId) {
  const [orders, cks, staffAll, vehs] = await Promise.all([listAll("orders"), listAll("checklists"), listAll("staff"), listAll("vehicles")]);
  const staffNames = staffAll.filter(x => (x.situacao || "ativo") === "ativo" && x.nome).map(x => x.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const os = orders.find(o => o._id === osId);
  if (!os) { view.innerHTML = pageHead("Checklist de mudanças") + '<div class="banner">OS não encontrada.</div><a class="btn" href="#/checklist">Voltar</a>'; return; }
  let C = cks.find(c => c.osId === osId) || newChecklist(os); // só é gravado quando houver a primeira alteração
  // Veículo da OS (a OS guarda a placa). Compartilhado = usado também fora dos serviços: pede km ao retirar e ao devolver.
  const veh = vehs.find(v => String(v.placa || "").trim().toLowerCase() === String(os.veiculo || "").trim().toLowerCase() && String(os.veiculo || "").trim());
  const shared = !!(veh && veh.compartilhado); C.compart = shared;
  let photos = C._id ? await photosOf(C._id) : [], stage = "antes", timer = null, saving = Promise.resolve();

  /* salvar sozinho: o funcionário não precisa lembrar de tocar em "Salvar" */
  const setStatus = t => { const e = view.querySelector("#ckStatus"); if (e) e.textContent = t; };
  /* uso do veículo compartilhado: o km do checklist vira (ou atualiza) um registro na Frota e atualiza o hodômetro do veículo */
  const syncUso = async () => {
    const has = num(C.kmRetirada) > 0 || num(C.kmDevolucao) > 0;
    if (shared && has) {
      const u = await saveItem("usos", { ...(C.usoId ? { _id: C.usoId } : {}), veiculoId: veh._id, veiculo: veh.placa, data: os.data || "", kmIni: C.kmRetirada || "", kmFim: C.kmDevolucao || "", controlado: !!C.consumoControlado, litros: C.litrosDev || "", origem: "checklist", checklistId: C._id, osId: os._id, osNum: os.num, cliNome: os.cliNome || "" });
      if (u._id !== C.usoId) { C.usoId = u._id; await saveItem("checklists", C); }
      const maior = Math.max(num(C.kmRetirada), num(C.kmDevolucao));
      if (maior > num(veh.kmAtual)) { // só sobe o hodômetro, nunca diminui
        const cur = (await listAll("vehicles", true)).find(v => v._id === veh._id) || veh;
        if (maior > num(cur.kmAtual)) { const nv = await saveItem("vehicles", { ...cur, kmAtual: String(Math.round(maior)) }); veh.kmAtual = nv.kmAtual; }
      }
    } else if (C.usoId) { await removeItem("usos", C.usoId); C.usoId = ""; await saveItem("checklists", C); }
  };
  const flush = () => { clearTimeout(timer); saving = saving.then(async () => {
    try { setStatus("Salvando…"); const r = await saveItem("checklists", C); C._id = r._id; } catch (e) { console.error(e); setStatus("Não salvou — confira a conexão"); throw e; }
    try { await syncUso(); setStatus("Salvo ✓"); } catch (e) { console.error(e); setStatus("Salvo, mas o uso do veículo não foi atualizado"); }
  }); return saving; };
  /* quem preencheu cada etapa: nome + data/hora da última alteração (o nome vem do cadastro de funcionários ou é digitado) */
  const norm = x => String(x || "").trim().toLowerCase();
  const lastWho = () => { try { return localStorage.getItem("ckQuem") || ""; } catch (e) { return ""; } };
  const saveWho = n => { try { localStorage.setItem("ckQuem", n); } catch (e) { /* sem armazenamento: segue sem lembrar */ } };
  const idOf = n => { const f = staffAll.find(x => norm(x.nome) === norm(n)); return f ? f._id : ""; };
  const resp = st => ((C.resp = C.resp || {})[st] = C.resp[st] || {});
  const whenText = r => r.nome ? (r.em ? "Última alteração: " + new Date(r.em).toLocaleString("pt-BR") : "") : "Informe o nome para registrar quem preencheu esta etapa.";
  const refreshWhen = () => { const e = view.querySelector("#ckWhen"), r = (C.resp || {})[stage] || {}; if (e) { e.textContent = whenText(r); e.style.color = r.nome ? "" : "var(--red)"; } };
  const stamp = keepEmpty => { const r = resp(stage); if (!r.nome && !keepEmpty && lastWho()) { r.nome = lastWho(); r.staffId = idOf(r.nome); const w = view.querySelector("#ckWho"); if (w) w.value = r.nome; drawHead(); } r.em = new Date().toISOString(); refreshWhen(); };
  const touch = keepEmpty => { stamp(keepEmpty === true); setStatus("Alterações não salvas…"); clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 700); };
  const onHide = () => { if (!view.isConnected) { document.removeEventListener("visibilitychange", onHide); return; } if (document.hidden) flush().catch(() => {}); };
  document.addEventListener("visibilitychange", onHide);

  const mv = el => (C.moveis || []).find(m => m.id === (el.closest("[data-mv]") || {}).dataset?.mv);
  const photoStrip = (etapa, ref) => `<div class="ck-ph">${photos.filter(p => p.etapa === etapa && (p.ref || "") === ref).map(p => `<div class="p"><img src="${p.dataUrl}" alt="Foto" data-act="zoom" data-id="${p._id}"><button type="button" data-act="ph-del" data-id="${p._id}" aria-label="Excluir foto">×</button></div>`).join("")}<label class="btn sm ck-add">${icon("camera")} Foto<input type="file" accept="image/*" multiple hidden data-photo data-etapa="${etapa}" data-ref="${ref}"></label></div>`;
  const note = (k, ph) => `<label class="ck-f"><span>Observações</span><textarea class="ck-in" rows="3" data-fld="${k}" placeholder="${ph}">${esc(C[k] || "")}</textarea></label>`;
  const frag = m => m.frag ? '<span class="ck-flag">FRÁGIL</span>' : "";

  /* ----- painéis ----- */
  const addrLine = (t, a) => { const tx = addrText(a || {}); return `<div class="ck-line" style="cursor:default"><div><b>${t}</b><br>${tx ? esc(tx) + (a.comp ? " — " + esc(a.comp) : "") + ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tx)}" target="_blank" rel="noopener" style="color:var(--red);font-weight:700">Mapa</a>` : '<span class="note">não informado</span>'}</div></div>`; };
  const movelEdit = m => `<div class="ck-item${m.estado ? " done" : ""}" data-mv="${m.id}">
      <div class="ck-row"><label class="ck-f"><span>Item${m.tam ? " (" + esc(m.tam) + ")" : ""}</span><input class="ck-in" data-f="nome" value="${esc(m.nome)}" placeholder="Ex.: Sofá 3 lugares" autocomplete="off"></label><label class="ck-f q"><span>Qtd</span><input class="ck-in" data-f="qtd" inputmode="numeric" value="${esc(m.qtd)}"></label></div>
      <div class="ck-seg" role="group" aria-label="Condição do item">${EST.map(([k, l]) => `<button type="button" data-act="estado" data-k="${k}" aria-pressed="${m.estado === k}">${l}</button>`).join("")}<button type="button" data-act="frag" aria-pressed="${!!m.frag}">Frágil</button></div>
      <label class="ck-f"><span>Detalhe da condição</span><input class="ck-in" data-f="nota" value="${esc(m.nota)}" placeholder="Ex.: risco na lateral esquerda" autocomplete="off"></label>
      ${photoStrip("antes", m.id)}<div style="margin-top:8px">${btn({ label: "Remover item", ico: "trash", kind: "danger", sm: true, attrs: 'data-act="mv-del"' })}</div></div>`;
  const kmAntes = () => shared ? `<div class="card"><h2>Veículo compartilhado</h2><p class="note" style="margin:0 0 8px">${esc(veh.placa)} também é usado fora dos serviços. Anote o km do hodômetro ao retirar e, no fim, ao devolver.</p>
      <label class="ck-f"><span>Km ao retirar o veículo</span><input class="ck-in" inputmode="numeric" data-fld="kmRetirada" value="${esc(C.kmRetirada || "")}" placeholder="Ex.: 45230" autocomplete="off"></label>
      <label class="ck-line"><input type="checkbox" data-chk="consumoControlado" ${C.consumoControlado ? "checked" : ""}> Medir o consumo neste uso (encher o tanque ao retirar e ao devolver)</label></div>` : "";
  const kmDepois = () => shared ? `<div class="card"><h2>Devolução do veículo</h2>
      <label class="ck-f"><span>Km ao devolver o veículo</span><input class="ck-in" inputmode="numeric" data-fld="kmDevolucao" value="${esc(C.kmDevolucao || "")}" placeholder="Ex.: 45290" autocomplete="off"></label>
      ${num(C.kmDevolucao) > 0 && num(C.kmRetirada) > 0 && num(C.kmDevolucao) <= num(C.kmRetirada) ? '<p class="note" style="margin:0;color:var(--red)">O km ao devolver precisa ser maior que o km ao retirar.</p>' : ""}
      ${C.consumoControlado ? `<label class="ck-f"><span>Litros abastecidos ao devolver (tanque cheio)</span><input class="ck-in" inputmode="decimal" data-fld="litrosDev" value="${esc(C.litrosDev || "")}" placeholder="Ex.: 8,5" autocomplete="off"></label>` : ""}
      ${num(C.kmRetirada) > 0 ? "" : '<p class="note" style="margin:0;color:var(--red)">Faltou anotar o km ao retirar (etapa Antes).</p>'}</div>` : "";
  const pAntes = () => `
    ${kmAntes()}<div class="card"><h2>Endereços</h2>${addrLine("Coleta", os.col)}${addrLine("Entrega", os.ent)}<label class="ck-line"><input type="checkbox" data-chk="enderecosOk" ${C.enderecosOk ? "checked" : ""}> Endereços confirmados com o cliente</label></div>
    <div class="card"><h2>Móveis e objetos (${(C.moveis || []).filter(m => m.estado).length}/${(C.moveis || []).length} conferidos)</h2>
      <p class="note" style="margin:0 0 10px">Confira cada item, marque a condição e fotografe o que for importante. Objetos frágeis ficam sinalizados nas outras etapas.</p>
      ${(C.moveis || []).map(movelEdit).join("") || '<p class="note">Nenhum item ainda. Toque em “+ Adicionar item”.</p>'}
      ${btn({ label: "Adicionar item", ico: "plus", kind: "pri", attrs: 'data-act="mv-add"' })}</div>
    <div class="card"><h2>Materiais necessários</h2>${(C.materiais || []).map(x => `<div class="ck-line" data-mat="${x.id}"><label class="ck-line" style="flex:1;padding:0"><input type="checkbox" data-chk="mat" ${x.ok ? "checked" : ""}> ${esc(x.nome)}</label>${btn({ ico: "x", tip: "Remover", sm: true, iconOnly: true, attrs: 'data-act="mat-del"' })}</div>`).join("")}
      <div class="ck-row" style="margin-top:8px"><label class="ck-f"><span>Outro material</span><input class="ck-in" id="matNovo" placeholder="Ex.: Corda extra" autocomplete="off"></label>${btn({ label: "Adicionar", ico: "plus", attrs: 'data-act="mat-add" style="align-self:flex-end;margin-bottom:6px"' })}</div></div>
    <div class="card"><h2>Fotos gerais</h2><p class="note" style="margin:0">Documentos, eletrônicos, objetos de valor e o estado do local.</p>${photoStrip("antes", "")}${note("obsAntes", "Algo importante antes de começar")}</div>`;
  const pDurante = () => { const mvs = C.moveis || [], n = mvs.filter(m => m.carregado).length; return `
    <div class="card"><h2>Itens carregados (${n}/${mvs.length})</h2>
      ${mvs.map(m => `<div data-mv="${m.id}"><label class="ck-line"><input type="checkbox" data-chk="carr" ${m.carregado ? "checked" : ""}> <span>${esc(m.nome || "Item sem nome")}${m.qtd && m.qtd !== "1" ? " (" + esc(m.qtd) + ")" : ""}${frag(m)}</span></label></div>`).join("") || '<p class="note">Nenhum item cadastrado. Cadastre os itens na etapa “Antes”.</p>'}
      ${mvs.length ? btn({ label: "Marcar todos como carregados", ico: "check", sm: true, attrs: 'data-act="all-carr" style="margin-top:8px"' }) : ""}</div>
    <div class="card"><h2>Ocorrências</h2>
      ${(C.ocorrencias || []).map(o => `<div class="ck-item" data-oc="${o.id}"><div class="ck-oc"><div><b>${esc(o.hora || "")}</b> ${esc(o.texto)}</div>${btn({ ico: "x", tip: "Remover ocorrência", kind: "danger", sm: true, iconOnly: true, attrs: 'data-act="oc-del"' })}</div>${photoStrip("durante", o.id)}</div>`).join("")}
      <label class="ck-f"><span>Nova ocorrência</span><textarea class="ck-in" id="ocNova" rows="2" placeholder="Ex.: Corredor estreito, desmontamos a cama"></textarea></label>
      ${btn({ label: "Registrar ocorrência", ico: "plus", kind: "pri", attrs: 'data-act="oc-add"' })}</div>
    <div class="card"><h2>Fotos e observações</h2>${photoStrip("durante", "")}${note("obsDurante", "Observações durante o serviço")}</div>`; };
  const pDepois = () => { const mvs = C.moveis || [], n = mvs.filter(m => m.entregue).length; return `
    <div class="card"><h2>Entrega</h2><label class="ck-line"><input type="checkbox" data-chk="entregaOk" ${C.entregaOk ? "checked" : ""}> Entrega confirmada no endereço</label></div>
    <div class="card"><h2>Conferir os itens (${n}/${mvs.length})</h2>
      ${mvs.map(m => `<div class="ck-item${m.entregue ? " done" : ""}" data-mv="${m.id}"><label class="ck-line"><input type="checkbox" data-chk="entr" ${m.entregue ? "checked" : ""}> <span>${esc(m.nome || "Item sem nome")}${m.qtd && m.qtd !== "1" ? " (" + esc(m.qtd) + ")" : ""}${frag(m)}</span></label>
        <div class="ck-seg"><button type="button" data-act="dano" aria-pressed="${!!m.dano}">Registrar dano</button></div>
        ${m.dano ? `<label class="ck-f"><span>O que aconteceu</span><input class="ck-in" data-f="danoNota" value="${esc(m.danoNota)}" placeholder="Descreva o dano" autocomplete="off"></label>${photoStrip("depois", m.id)}` : ""}</div>`).join("") || '<p class="note">Nenhum item cadastrado. Cadastre os itens na etapa “Antes”.</p>'}</div>
    <div class="card"><h2>Danos e observações</h2><label class="ck-f"><span>Outros danos ou avarias</span><textarea class="ck-in" rows="3" data-fld="danosTexto" placeholder="Registre qualquer dano que não seja de um item da lista">${esc(C.danosTexto || "")}</textarea></label>${photoStrip("depois", "")}${note("obsDepois", "Observações finais")}</div>
    ${kmDepois()}<div class="card"><h2>Conclusão</h2><label class="ck-line"><input type="checkbox" data-chk="conclusaoOk" ${C.conclusaoOk ? "checked" : ""}> Serviço concluído e conferido</label>${C.conclusaoOk && C.conclusaoEm ? `<p class="note" style="margin:0">Confirmado em ${esc(new Date(C.conclusaoEm).toLocaleString("pt-BR"))}</p>` : ""}
      <p class="note" style="margin-top:10px"><b>Assinatura do cliente:</b> em breve, será possível coletá-la aqui.</p></div>`; };

  const whoCard = () => { const r = (C.resp || {})[stage] || {}; return `<div class="card"><h2>Preenchido por</h2><label class="ck-f"><span>Quem está preenchendo esta etapa</span><input class="ck-in" id="ckWho" list="ckStaff" value="${esc(r.nome || "")}" placeholder="Escolha ou digite o nome" autocomplete="off"><datalist id="ckStaff">${staffNames.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label><p class="note" id="ckWhen" style="margin:0;${r.nome ? "" : "color:var(--red)"}">${esc(whenText(r))}</p></div>`; };
  const head = () => { const pc = overall(C); return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>${pc}% concluído</b><span class="ck-status" id="ckStatus"></span></div><div class="ck-bar" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pc}%"></i></div>
    <div class="ck-stages" role="tablist">${STAGES.map(([k, l]) => { const [a, b] = stageProg(C, k); return `<button type="button" role="tab" data-act="stage" data-k="${k}" aria-selected="${k === stage}">${l}<small>${a}/${b}</small></button>`; }).join("")}</div>
    <p class="note" style="margin:0">${STAGES.map(([k, l]) => `${l}: ${esc(((C.resp || {})[k] || {}).nome || "—")}`).join(" · ")}</p></div>`; };
  const draw = () => { const y = window.scrollY, st = (view.querySelector("#ckStatus") || {}).textContent || ""; view.querySelector("#ckHead").innerHTML = head(); view.querySelector("#ckPanel").innerHTML = whoCard() + (stage === "antes" ? pAntes() : stage === "durante" ? pDurante() : pDepois()); setStatus(st); window.scrollTo(0, y); };
  const drawHead = () => { const st = (view.querySelector("#ckStatus") || {}).textContent || ""; view.querySelector("#ckHead").innerHTML = head(); setStatus(st); };

  view.innerHTML = pageHead("Checklist · OS " + pad(os.num), os.cliNome || "") +
    bar({ left: [btn({ label: "Outras OS", ico: "arrowLeft", href: "#/checklist" })], right: [btn({ label: "Abrir OS", ico: "external", href: "#/ordens?id=" + esc(os._id) })], cls: "tight" }) + '<div id="ckHead"></div><div id="ckPanel"></div>';
  draw();

  /* ----- eventos ----- */
  view.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "ckWho") { const r = resp(stage); r.nome = t.value.trim(); r.staffId = idOf(r.nome); if (r.nome) saveWho(r.nome); touch(true); drawHead(); return; }
    if (t.dataset.f) { const m = mv(t); if (m) { m[t.dataset.f] = t.value; touch(); } }
    else if (t.dataset.fld) {
      const k = t.dataset.fld;
      if (k === "kmRetirada" || k === "kmDevolucao") { const v = t.value.replace(/\D/g, ""); if (v !== t.value) t.value = v; C[k] = v; }
      else if (k === "litrosDev") { const v = t.value.replace(/[^0-9,.]/g, ""); if (v !== t.value) t.value = v; C[k] = v; }
      else C[k] = t.value;
      touch(); if (k === "kmRetirada" || k === "kmDevolucao") drawHead();
    }
  });
  view.addEventListener("change", async e => {
    const t = e.target;
    if (t.dataset.chk) {
      const k = t.dataset.chk, ok = t.checked;
      if (k === "mat") { const x = (C.materiais || []).find(z => z.id === t.closest("[data-mat]").dataset.mat); if (x) x.ok = ok; }
      else if (k === "carr" || k === "entr") { const m = mv(t); if (m) { m[k === "carr" ? "carregado" : "entregue"] = ok; t.closest(".ck-item") && t.closest(".ck-item").classList.toggle("done", ok); } }
      else { C[k] = ok; if (k === "conclusaoOk") { C.conclusaoEm = ok ? new Date().toISOString() : ""; draw(); } }
      drawHead(); touch(); return;
    }
    if (t.dataset.photo !== undefined) {
      const files = [...t.files], etapa = t.dataset.etapa, ref = t.dataset.ref; t.value = "";
      if (!files.length) return;
      try { await flush(); } catch (err) { toast("Não foi possível salvar. Confira a conexão."); return; }
      toast("Salvando foto…"); let n = 0;
      for (const f of files) {
        try { const rec = { etapa, ref, ts: Date.now(), dataUrl: await compress(f) }; rec._id = await addPhoto(C._id, rec); photos.push(rec); n++; }
        catch (err) { console.error(err); toast("Uma foto não pôde ser salva."); }
      }
      if (n) { touch(); draw(); toast(n > 1 ? n + " fotos salvas" : "Foto salva"); }
    }
  });
  view.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "stage") { stage = b.dataset.k; draw(); return; }
    if (a === "zoom") { const p = photos.find(x => x._id === b.dataset.id); if (p) { const lb = document.createElement("div"); lb.className = "ck-lb"; lb.innerHTML = `<img src="${p.dataUrl}" alt="Foto ampliada">`; lb.addEventListener("click", () => lb.remove()); document.body.append(lb); } return; }
    if (a === "ph-del") { if (!window.confirm("Excluir esta foto?")) return; try { await delPhoto(C._id, b.dataset.id); photos = photos.filter(x => x._id !== b.dataset.id); draw(); } catch (err) { toast("Não foi possível excluir a foto."); } return; }
    if (a === "mv-add") { C.moveis = C.moveis || []; C.moveis.push({ id: mid(), nome: "", qtd: "1", tam: "", frag: false, estado: "", nota: "", carregado: false, entregue: false, dano: false, danoNota: "" }); draw(); touch(); const ins = view.querySelectorAll('[data-f="nome"]'); if (ins.length) ins[ins.length - 1].focus(); return; }
    if (a === "mv-del") { const m = mv(b); if (!m || !window.confirm("Remover este item do checklist?")) return; C.moveis = C.moveis.filter(x => x !== m); draw(); touch(); return; }
    if (a === "estado") { const m = mv(b); if (m) { m.estado = m.estado === b.dataset.k ? "" : b.dataset.k; draw(); touch(); } return; }
    if (a === "frag") { const m = mv(b); if (m) { m.frag = !m.frag; draw(); touch(); } return; }
    if (a === "dano") { const m = mv(b); if (m) { m.dano = !m.dano; draw(); touch(); } return; }
    if (a === "all-carr") { (C.moveis || []).forEach(m => { m.carregado = true; }); draw(); touch(); return; }
    if (a === "mat-add") { const i = view.querySelector("#matNovo"), v = (i.value || "").trim(); if (!v) return; C.materiais.push({ id: mid(), nome: v, ok: false }); draw(); touch(); return; }
    if (a === "mat-del") { const id = b.closest("[data-mat]").dataset.mat; C.materiais = C.materiais.filter(x => x.id !== id); draw(); touch(); return; }
    if (a === "oc-add") { const i = view.querySelector("#ocNova"), v = (i.value || "").trim(); if (!v) { toast("Descreva a ocorrência."); return; } (C.ocorrencias = C.ocorrencias || []).push({ id: mid(), texto: v, hora: hora() }); draw(); touch(); return; }
    if (a === "oc-del") { const id = b.closest("[data-oc]").dataset.oc; if (!window.confirm("Remover esta ocorrência?")) return; C.ocorrencias = C.ocorrencias.filter(x => x.id !== id); draw(); touch(); }
  });
}
