const { test } = require("node:test");
const assert = require("node:assert");
const { buildPdf } = require("../shared/pdf");

test("buildPdf genera cabecera, EOF y WinAnsiEncoding", () => {
  const s = buildPdf("Título", { campo: "Descripción (con) paréntesis \\ y €" }).toString("latin1");
  assert.ok(s.startsWith("%PDF-"));
  assert.ok(s.endsWith("%%EOF"));
  assert.ok(s.includes("/Encoding /WinAnsiEncoding"));
  assert.ok(s.includes("Descripci\xf3n \\(con\\) par\xe9ntesis \\\\ y ?"));
});

test("buildPdf pagina textos largos y xref apunta a los objetos", () => {
  const largo = Array.from({ length: 1500 }, (_, i) => `palabra${i}`).join(" ");
  const s = buildPdf("T", { a: largo, kpis: [{ nombre: "k", meta: "1" }] }).toString("latin1");
  const count = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(count > 1);
  const startxref = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.slice(startxref).startsWith("xref"));
  assert.ok(!s.includes("[object Object]"));
  const off1 = Number(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(s)[1]);
  assert.ok(s.slice(off1).startsWith("1 0 obj"));
});
