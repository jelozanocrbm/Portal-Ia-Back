const { test } = require("node:test");
const assert = require("node:assert");
const { validateRequired, isValidEmail, REQUIRED_BUSINESS, REQUIRED_TECHNICAL } = require("../shared/validation");

test("validateRequired detecta campos faltantes (caso de uso)", () => {
  const missing = validateRequired({ nombre: "Chatbot soporte" }, REQUIRED_BUSINESS);
  assert.ok(missing.includes("area"));
  assert.ok(missing.includes("descripcionProblema"));
  assert.ok(missing.includes("objetivoPrincipal"));
  assert.ok(!missing.includes("nombre"));
});

test("validateRequired detecta obligatorios del formulario tecnico", () => {
  const missing = validateRequired({ nombre: "Splunk AI" }, REQUIRED_TECHNICAL);
  assert.ok(missing.includes("fecha"));
  assert.ok(missing.includes("riesgoInherente"));
  assert.ok(missing.includes("riesgoEscenarios"));
  assert.ok(!missing.includes("nombre"));
});

test("validateRequired trata arrays vacios como faltantes", () => {
  const missing = validateRequired({ riesgoTipo: [] }, ["riesgoTipo"]);
  assert.deepStrictEqual(missing, ["riesgoTipo"]);
  const ok = validateRequired({ riesgoTipo: ["PCI"] }, ["riesgoTipo"]);
  assert.deepStrictEqual(ok, []);
});

test("isValidEmail valida correctamente", () => {
  assert.strictEqual(isValidEmail("user@company.com"), true);
  assert.strictEqual(isValidEmail("no-arroba"), false);
  assert.strictEqual(isValidEmail(""), false);
});

const { validateBusinessExtras, IMPACTED_ELEMENTS } = require("../shared/validation");

function validV101() {
  return {
    schemaVersion: "1.0.1",
    procesoImpactado: "Servicio",
    detalleElemento: { Servicio: { nombre: "Pagos", disponibilidadRequerida: "99.9" } },
    kpis: [{ nombre: "TMO", lineaBase: "10", meta: "5", fuente: "CRM" }],
    objetivosSecundarios: ["a"]
  };
}

test("IMPACTED_ELEMENTS contiene los 6 tipos exactos", () => {
  assert.deepStrictEqual(IMPACTED_ELEMENTS, ["Proceso", "Producto", "Servicio", "Sistema", "Canal", "Función"]);
});

test("validateBusinessExtras acepta payload v1.0.1 valido", () => {
  assert.deepStrictEqual(validateBusinessExtras(validV101()), []);
});

test("validateBusinessExtras ignora payloads sin schemaVersion", () => {
  assert.deepStrictEqual(validateBusinessExtras({ procesoImpactado: "x" }), []);
});

test("validateBusinessExtras rechaza sin kpis, sin nombre, disponibilidad invalida y tipo invalido", () => {
  assert.ok(validateBusinessExtras({ ...validV101(), kpis: [] }).length > 0);
  assert.ok(validateBusinessExtras({ ...validV101(), detalleElemento: { Servicio: { nombre: " " } } }).length > 0);
  assert.ok(validateBusinessExtras({ ...validV101(), detalleElemento: { Servicio: { nombre: "P", disponibilidadRequerida: "101" } } }).length > 0);
  assert.ok(validateBusinessExtras({ ...validV101(), detalleElemento: { Servicio: { nombre: "P", disponibilidadRequerida: "-1" } } }).length > 0);
  assert.ok(validateBusinessExtras({ ...validV101(), procesoImpactado: "Otro" }).length > 0);
  assert.ok(validateBusinessExtras({ ...validV101(), kpis: [{ nombre: "x" }] }).length > 0);
});

test("validateBusinessExtras rechaza colecciones >50 y payload gigante", () => {
  assert.ok(validateBusinessExtras({ ...validV101(), objetivosSecundarios: new Array(51).fill("a") }).length > 0);
  assert.ok(validateBusinessExtras({ ...validV101(), observaciones: "x".repeat(300001) }).length > 0);
});
