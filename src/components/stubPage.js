// Página provisória: mantém a rota funcionando até a tela ser construída.
import { pageHead } from "./pageHead.js";
import { esc } from "../../js/utils.js";

export function stubPage(root, { title, desc }) {
  root.innerHTML = pageHead(title, desc) +
    `<div class="card"><h2>Em construção</h2><p class="note">${esc(title)} ainda não foi implementada. A rota, a proteção de acesso e o menu já estão funcionando.</p></div>`;
}
