// Bibliotecas pesadas são carregadas só quando precisam (QR, imagem e PDF).
const URLS = {
  qr:  "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
  h2c: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  pdf: "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js"
};
const pending = {};
export function loadLib(name) {
  if (!pending[name]) pending[name] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = URLS[name]; s.onload = resolve;
    s.onerror = () => { delete pending[name]; reject(new Error("Falha ao carregar " + name)); };
    document.head.appendChild(s);
  });
  return pending[name];
}
