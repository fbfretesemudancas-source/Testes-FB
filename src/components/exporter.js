// Exportação da folha em PDF ou imagem (html2canvas + jsPDF, carregados só ao exportar).
import { loadLib } from "../../js/lib.js";
import { A4 } from "./sheets.js";

async function renderCanvas(sheetHtml, size) {
  await Promise.all([loadLib("h2c"), loadLib("pdf")]);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:-10000px;top:0;width:${size.w}px;height:${size.h}px`;
  wrap.innerHTML = `<div class="${size.cls}">${sheetHtml}</div>`;
  document.body.appendChild(wrap);
  try {
    await Promise.all([...wrap.querySelectorAll("img")].map(i => (i.decode ? i.decode().catch(() => {}) : 0)));
    return await html2canvas(wrap.firstChild, { scale: size.scale, backgroundColor: "#ffffff", useCORS: true, logging: false, width: size.w, height: size.h, windowWidth: size.w });
  } finally { wrap.remove(); }
}
export function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
export async function exportPDF(sheetHtml, filename, size = A4) {
  const c = await renderCanvas(sheetHtml, size), J = window.jspdf.jsPDF;
  const pdf = new J({ unit: "mm", format: size.mm, orientation: "portrait", compress: true });
  pdf.addImage(c.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, size.mm[0], size.mm[1], undefined, "FAST");
  downloadBlob(pdf.output("blob"), filename);
}
export async function renderPNG(sheetHtml, size = A4) {
  const c = await renderCanvas(sheetHtml, size);
  return new Promise(r => c.toBlob(r, "image/png"));
}
export async function exportPNG(sheetHtml, filename, size = A4) { downloadBlob(await renderPNG(sheetHtml, size), filename); }
