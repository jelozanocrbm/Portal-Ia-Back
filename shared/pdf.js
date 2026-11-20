// Generador de PDF minimo (sin dependencias): multipagina, ajuste de linea y WinAnsiEncoding.
const { displayValue } = require("./transform");

const MAX_CHARS = 95;
const LINES_PER_PAGE = 50;

// Deja solo caracteres representables en WinAnsi/latin1; el resto -> "?".
function sanitize(text) {
  let out = "";
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c === 9) out += " ";
    else if (c < 32 || (c >= 127 && c <= 159) || c > 255) out += "?";
    else out += ch;
  }
  return out;
}

// Parte una linea en tramos de hasta MAX_CHARS, cortando en espacios cuando es posible.
function wrapLine(line) {
  if (line.length <= MAX_CHARS) return [line];
  const out = [];
  let rest = line;
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf(" ", MAX_CHARS);
    if (cut <= 0) cut = MAX_CHARS;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^ +/, "");
  }
  out.push(rest);
  return out;
}

function escapePdf(s) {
  return s.replace(/[\\()]/g, (m) => "\\" + m);
}

function buildPdf(title, fields) {
  const entries = Object.entries(fields || {})
    .map(([k, v]) => [k, displayValue(v, k)])
    .filter(([, v]) => v.trim() !== "");
  const rawLines = [title, ""];
  entries.forEach(([k, v]) => {
    String(`${k}: ${v}`).split(/\r?\n/).forEach((l) => rawLines.push(l));
  });
  const lines = [];
  rawLines.forEach((l) => wrapLine(sanitize(l)).forEach((w) => lines.push(w)));

  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (pages.length === 0) pages.push([""]);

  // Objetos: 1 catalogo, 2 paginas, 3 fuente, luego (pagina, contenido) por cada pagina.
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ];
  pages.forEach((pageLines, i) => {
    const body = pageLines.map((l) => `(${escapePdf(l)}) Tj T*`).join("\n");
    const content = `BT /F1 10 Tf 14 TL 50 750 Td\n${body}\nET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  // Todos los caracteres son <= 0xFF (latin1): longitud en caracteres == bytes.
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

module.exports = { buildPdf, wrapLine, sanitize };
