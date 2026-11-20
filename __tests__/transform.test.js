const { test } = require("node:test");
const assert = require("node:assert");
const { groupByCategory, displayValue, computeRiskTotal, resolveRequester } = require("../shared/transform");

test("groupByCategory agrupa por categoria respetando order", () => {
  const items = [
    { id: "1", category: "Uso", question: "a", order: 2 },
    { id: "2", category: "Datos", question: "b", order: 1 },
    { id: "3", category: "Uso", question: "c", order: 1 }
  ];
  const result = groupByCategory(items);
  const uso = result.find((c) => c.category === "Uso");
  assert.ok(uso);
  // dentro de "Uso", order 1 ("c") va antes que order 2 ("a")
  assert.deepStrictEqual(uso.items.map((i) => i.id), ["3", "1"]);
});

test("groupByCategory no muta el arreglo original", () => {
  const items = [{ id: "1", category: "X", order: 3 }, { id: "2", category: "X", order: 1 }];
  const copy = JSON.parse(JSON.stringify(items));
  groupByCategory(items);
  assert.deepStrictEqual(items, copy);
});

test("groupByCategory con lista vacia devuelve []", () => {
  assert.deepStrictEqual(groupByCategory([]), []);
});

test("displayValue formatea strings, arrays y vacios", () => {
  assert.strictEqual(displayValue("hola"), "hola");
  assert.strictEqual(displayValue(["a", "b"]), "a, b");
  assert.strictEqual(displayValue(null), "");
  assert.strictEqual(displayValue(undefined), "");
});

test("displayValue aplana objetos anidados (matriz de riesgos)", () => {
  const matriz = {
    "Privacidad de datos": { nivel: "Alto", descripcion: "fuga", control: "cifrado" },
    "Riesgo operacional": { nivel: "", descripcion: "", control: "" }
  };
  const out = displayValue(matriz);
  assert.ok(out.includes("Privacidad de datos: Alto / fuga / cifrado"));
  // la fila totalmente vacia se omite
  assert.ok(!out.includes("Riesgo operacional"));
});

test("displayValue aplana tabla de aprobaciones (valores planos)", () => {
  const ap = { "Requiere revision Juridica": "Si", "Requiere revision de Seguridad": "" };
  const out = displayValue(ap);
  assert.ok(out.includes("Requiere revision Juridica: Si"));
  assert.ok(!out.includes("Requiere revision de Seguridad"));
});

test("resolveRequester prioriza requesterName, luego responsable, lider, area", () => {
  assert.strictEqual(resolveRequester({ requesterName: "Ana", responsable: "X" }), "Ana");
  assert.strictEqual(resolveRequester({ responsable: "Beto" }), "Beto");
  assert.strictEqual(resolveRequester({ lider: "Caro" }), "Caro");
  assert.strictEqual(resolveRequester({ area: "Riesgos" }), "Riesgos");
  assert.strictEqual(resolveRequester({}), "No especificado");
});
test("computeRiskTotal devuelve el maximo y 'No calculado' sin niveles", () => {
  assert.strictEqual(computeRiskTotal({ a: { nivel: "Bajo" }, b: { nivel: "Crítico" }, c: { nivel: "Medio" } }), "Crítico");
  assert.strictEqual(computeRiskTotal({ a: { nivel: "Medio" }, b: { nivel: "" } }), "Medio");
  assert.strictEqual(computeRiskTotal({ a: { nivel: "" } }), "No calculado");
  assert.strictEqual(computeRiskTotal(undefined), "No calculado");
});

test("displayValue etiqueta los campos de detalleElemento", () => {
  const out = displayValue({ Sistema: { nombre: "Core", owner: "Ana", proveedor: "SAP", vacio: "" } }, "detalleElemento");
  assert.strictEqual(out, "Sistema: nombre: Core; owner: Ana; proveedor: SAP");
});

test("displayValue formatea arrays de objetos como bloques sin [object Object]", () => {
  const out = displayValue([{ nombre: "TMO", meta: "5" }, { nombre: "NPS", meta: "" }], "kpis");
  assert.ok(out.includes("KPI 1: nombre: TMO; meta: 5"));
  assert.ok(out.includes("KPI 2: nombre: NPS"));
  assert.ok(!out.includes("[object Object]"));
  const nested = displayValue({ Proceso: { nombre: "X", sub: { a: "1" } } });
  assert.ok(!nested.includes("[object Object]"));
});
