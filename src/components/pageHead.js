import { esc } from "../../js/utils.js";
export function pageHead(title, subtitle = "") {
  return `<header class="page-head"><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</header>`;
}
