// Peças de formulário compartilhadas por Ordens, Orçamentos e Clientes.
import { esc, MASK, money, digits } from "../../js/utils.js";
import { ITEM_SUG, clientAddresses, addrText } from "../../js/domain.js";

export const getP = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
export const setP = (o, p, v) => { const a = p.split("."), l = a.pop(); a.reduce((x, k) => x[k], o)[l] = v; };

/* ---------- blocos de HTML (mesmo visual do projeto base) ---------- */
export const addrFields = (w, full = true) => `
  <select class="addrPick" data-w="${w}" aria-label="Usar endereço já utilizado" hidden style="width:100%;margin-bottom:10px;min-height:40px;border-radius:7px;border:1px solid var(--line);background:var(--field);padding:0 8px"></select>
  <div class="row r21"><label class="f"><span>Rua / Avenida</span><input data-k="${w}.rua"></label><label class="f"><span>Nº</span><input data-k="${w}.num"></label></div>
  <div class="row"><label class="f"><span>Bairro</span><input data-k="${w}.bairro"></label><label class="f"><span>Cidade</span><input data-k="${w}.cidade"></label></div>
  <div class="row r1"><label class="f"><span>Complemento / ponto de referência</span><input data-k="${w}.comp"></label></div>
  <div class="row">${full ? `<label class="f"><span>CEP</span><input data-k="${w}.cep" data-mask="cep" inputmode="numeric"></label>` : "<span></span>"}<label class="f"><span>Data / horário previsto</span><input data-k="${w}.dh" type="datetime-local"></label></div>`;

export function itemsFields(sizes = true) {
  const cols = sizes ? "" : ' style="grid-template-columns:54px minmax(0,1fr)"';
  let h = `<datalist id="itemSug">${ITEM_SUG.map(x => `<option value="${x}">`).join("")}</datalist>`;
  for (let i = 0; i < 10; i++) {
    h += `<div class="it"${cols}><input type="number" min="0" inputmode="numeric" data-k="itens.${i}.q" placeholder="Qtd" aria-label="Quantidade do item ${i + 1}">` +
      `<input type="text" list="itemSug" data-k="itens.${i}.d" placeholder="Item ${i + 1}" aria-label="Descrição do item ${i + 1}">` +
      (sizes ? `<div class="sz">${["p", "m", "g"].map(z => `<label><input type="checkbox" data-k="itens.${i}.${z}"><span>${z.toUpperCase()}</span></label>`).join("")}</div>` : "") + `</div>`;
  }
  return `<div class="items">${h}</div>`;
}
export const checks = (list, path) => list.map(t => `<label class="chk"><input type="checkbox" data-k="${path}.${t[0]}">${t[1]}</label>`).join("");
export const options = list => list.map(t => `<option value="${t[0]}">${t[1]}</option>`).join("");

/* ---------- vínculo campo ⇄ estado ---------- */
export function fillForm(view, S) {
  view.querySelectorAll("[data-k]").forEach(el => {
    const v = getP(S, el.getAttribute("data-k"));
    if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v;
  });
}
/** Escuta digitação dentro de `view` (cada tela cria o seu, então não acumula ouvintes). */
export function bindForm(view, S, onChange) {
  view.addEventListener("input", e => {
    const el = e.target, k = el.getAttribute && el.getAttribute("data-k");
    if (!k) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    const m = el.getAttribute("data-mask"); if (m) { v = MASK[m](v); el.value = v; }
    if (k === "num") v = parseInt(v, 10) || 0;
    setP(S, k, v); onChange(k);
  });
  view.addEventListener("focusout", e => {
    const el = e.target;
    if (el.hasAttribute && el.hasAttribute("data-money")) { el.value = money(el.value); setP(S, el.getAttribute("data-k"), el.value); onChange(); }
  });
}
let rz;
export function onResize(fn) { if (rz) window.removeEventListener("resize", rz); rz = fn; window.addEventListener("resize", rz); }

/** Copia os dados do cadastro do cliente para a OS/orçamento. */
export function applyClient(S, c) {
  S.clientId = c._id; S.cliNome = c.nome; S.cliTel = c.tel || ""; S.cliEmail = c.email || "";
  if ("cliCpf" in S) S.cliCpf = c.doc || "";
}

/* ---------- seleção de cliente: preenche os dados sozinho ---------- */
export const clientLabel = c => c.nome + (c.tel ? " — " + c.tel : "");
export const clientPickerHTML = clients => `
  <div class="pickline"><label class="f"><span>Cliente cadastrado</span>
    <input id="cliPick" list="cliList" placeholder="Digite o nome ou telefone para buscar…" autocomplete="off"></label>
    <datalist id="cliList">${clients.map(c => `<option value="${esc(clientLabel(c))}">`).join("")}</datalist>
    <p class="note" id="cliObs" hidden></p></div>`;

/**
 * Liga o seletor de cliente. Ao escolher: copia nome, telefone, documento e e-mail para o estado
 * e oferece os endereços que ele já usou nos campos de coleta/entrega.
 */
export function bindClientLink(view, S, { clients, orders, orcs, onChange }) {
  const pick = view.querySelector("#cliPick"), obs = view.querySelector("#cliObs");
  if (!pick) return;
  let addrs = [];
  const current = () => clients.find(c => c._id === S.clientId);
  const refresh = () => {
    const c = current(); addrs = c ? clientAddresses(c, orders, orcs) : [];
    if (c) pick.value = clientLabel(c);
    obs.hidden = !(c && c.obs); obs.textContent = c && c.obs ? "Observação do cliente: " + c.obs : "";
    view.querySelectorAll(".addrPick").forEach(sel => {
      sel.hidden = !addrs.length;
      sel.innerHTML = '<option value="">Usar endereço já utilizado deste cliente…</option>' + addrs.map((a, i) => `<option value="${i}">${esc(addrText(a))}${a.comp ? " (" + esc(a.comp) + ")" : ""}</option>`).join("");
    });
  };
  pick.addEventListener("input", () => {
    const c = clients.find(x => clientLabel(x) === pick.value);
    if (!c) { if (!pick.value) { S.clientId = ""; refresh(); onChange(); } return; }
    applyClient(S, c);
    refresh(); fillForm(view, S); onChange();
  });
  view.addEventListener("change", e => {
    const sel = e.target.closest && e.target.closest(".addrPick"); if (!sel || sel.value === "") return;
    const a = addrs[Number(sel.value)], w = sel.getAttribute("data-w");
    Object.assign(S[w], { rua: a.rua, num: a.num, bairro: a.bairro, cidade: a.cidade, comp: a.comp, cep: a.cep, coord: a.coord || "" });
    if (a.geo) S[w].geo = a.geo; else delete S[w].geo; // reaproveita a localização já conferida
    sel.value = ""; fillForm(view, S); onChange();
  });
  refresh();
}

const norm = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
/** Acha o cadastro do cliente: pelo vínculo, pelo telefone ou (sem telefone) pelo nome exato. */
export function matchClient(S, clients) {
  const t = digits(S.cliTel), n = norm(S.cliNome);
  return clients.find(c => c._id === S.clientId)
    || (t.length >= 10 ? clients.find(c => digits(c.tel) === t) : null)
    || (!t && n ? clients.find(c => norm(c.nome) === n && !digits(c.tel)) : null) || null;
}

/* ---------- agendamento: veículo (placa) e equipe ---------- */
export const veicLabel = v => v.placa + (v.nome ? " — " + v.nome : "");
/** Opções do seletor: "não definido", os cadastrados e, se for o caso, o valor atual que não está mais na lista. */
export function resourceOptions(list, field, current, labelFn) {
  const items = (list || []).filter(x => x[field]), vals = items.map(x => x[field]);
  return '<option value="">Não definido</option>' + items.map(x => `<option value="${esc(x[field])}">${esc(labelFn(x))}</option>`).join("") +
    (current && !vals.includes(current) ? `<option value="${esc(current)}">${esc(current)} (não cadastrado)</option>` : "");
}
export function agendamentoCard(cfg, cur, note) {
  const sem = !(cfg.veiculos || []).length && !(cfg.equipes || []).length;
  return `<div class="card"><h2>Agendamento</h2><div class="row">
    <label class="f"><span>Veículo (placa)</span><select data-k="veiculo">${resourceOptions(cfg.veiculos, "placa", cur.veiculo, veicLabel)}</select></label>
    <label class="f"><span>Equipe</span><select data-k="equipe">${resourceOptions(cfg.equipes, "nome", cur.equipe, e => e.nome)}</select></label></div>
    <div class="row" style="margin-top:10px"><label class="f"><span>Pagamento por funcionário neste frete (R$)</span><input data-k="pagFunc" data-money inputmode="decimal" placeholder="0,00" autocomplete="off"></label><span></span></div>
    <p class="note" style="margin:-4px 0 10px">Uso interno (não aparece para o cliente). É o valor que cada funcionário pago <b>por frete</b> da equipe recebe neste serviço. Em branco, vale o valor padrão da ficha do funcionário.</p>
    <p class="note">${note} O sistema avisa se já houver outro serviço no mesmo horário com o mesmo veículo ou a mesma equipe.${sem ? ' Cadastre os veículos em <a href="#/frota" style="color:var(--red);font-weight:700">Frota</a> e as equipes em <a href="#/configuracoes?aba=agenda" style="color:var(--red);font-weight:700">Configurações → Equipes e agenda</a>.' : ""}</p></div>`;
}
/** Registro novo já nasce com o primeiro veículo e a primeira equipe cadastrados. */
export function defaultResources(rec, cfg) {
  if (rec._id) return;
  if (!rec.veiculo && (cfg.veiculos || [])[0]) rec.veiculo = cfg.veiculos[0].placa;
  if (!rec.equipe && (cfg.equipes || [])[0]) rec.equipe = cfg.equipes[0].nome;
}
