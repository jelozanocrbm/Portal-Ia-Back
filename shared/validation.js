// Validacion de payloads de formularios en el backend.

// Campos obligatorios de la Ficha de Caso de Uso de IA
// (alineados con requiredBusinessFields del esquema del frontend).
const REQUIRED_BUSINESS = [
  "nombre", "area", "responsable", "descripcionProblema", "procesoImpactado",
  "objetivoPrincipal", "descripcionFuncional", "entradaInformacion", "salidaEsperada",
  "usuariosSolucion", "canalUso", "frecuenciaUso", "nivelExplicabilidad", "toleranciaError",
  "fuentesDatos", "datosSuficientes", "tipoValor", "beneficioEsperado", "indicadorBase",
  "metaEsperada", "horizonteValor", "alcancePrototipo", "alcancePiloto", "criteriosExitoPiloto"
];

// Campos obligatorios del formulario de Iniciativa tecnica
// (alineados con requiredTechnicalFields del esquema del frontend).
const REQUIRED_TECHNICAL = ["nombre", "fecha", "area", "lider", "tipo", "resumen", "problema", "riesgoInherente", "riesgoEscenarios"];

function validateRequired(payload, fields) {
  const missing = fields.filter((f) => {
    const v = payload[f];
    if (Array.isArray(v)) return v.length === 0;
    return !v || String(v).trim() === "";
  });
  return missing;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
}

// Elementos impactados validos (sincronizar con ELEMENTOS_IMPACTADOS en src/schemas/catalogs.js;
// el backend es CommonJS y no puede importar el ESM del frontend).
const IMPACTED_ELEMENTS = ["Proceso", "Producto", "Servicio", "Sistema", "Canal", "Función"];
const MAX_COLLECTION_ITEMS = 50;
const MAX_PAYLOAD_BYTES = 300000;
const KPI_REQUIRED = ["nombre", "lineaBase", "meta", "fuente"];

function isBlank(v) {
  return v == null || String(v).trim() === "";
}

// Validaciones adicionales de la Ficha v1.0.1. Devuelve lista de mensajes (vacia si todo ok).
// Los payloads sin schemaVersion '1.0.1' (clientes antiguos) solo se validan por tamaño.
function validateBusinessExtras(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") return errors;

  // El tope de tamaño aplica a todo payload de negocio, con o sin schemaVersion.
  let size = 0;
  try { size = Buffer.byteLength(JSON.stringify(payload)); } catch { size = Infinity; }
  if (size > MAX_PAYLOAD_BYTES) {
    errors.push("Solicitud demasiado grande");
    return errors;
  }

  if (payload.schemaVersion !== "1.0.1") return errors;

  for (const key of ["objetivosSecundarios", "tiposInformacion", "kpis"]) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v)) errors.push(`${key} debe ser una lista`);
    else if (v.length > MAX_COLLECTION_ITEMS) errors.push(`${key} excede el máximo de ${MAX_COLLECTION_ITEMS} elementos`);
  }

  const tipo = payload.procesoImpactado;
  if (!IMPACTED_ELEMENTS.includes(tipo)) {
    errors.push("procesoImpactado inválido");
  } else {
    const detalle = payload.detalleElemento && payload.detalleElemento[tipo];
    if (!detalle || typeof detalle !== "object" || isBlank(detalle.nombre)) {
      errors.push(`Falta el nombre del elemento impactado (${tipo})`);
    }
    if (tipo === "Servicio" && detalle && !isBlank(detalle.disponibilidadRequerida)) {
      const raw = String(detalle.disponibilidadRequerida).trim();
      const n = Number(raw.replace(",", "."));
      if (!/^\d+([.,]\d+)?$/.test(raw) || n < 0 || n > 100) {
        errors.push("Disponibilidad requerida debe estar entre 0 y 100");
      }
    }
  }

  if (!Array.isArray(payload.kpis) || payload.kpis.length === 0) {
    errors.push("Debe registrar al menos un KPI");
  } else if (payload.kpis.length <= MAX_COLLECTION_ITEMS) {
    payload.kpis.forEach((k, i) => {
      const miss = KPI_REQUIRED.filter((f) => !k || typeof k !== "object" || isBlank(k[f]));
      if (miss.length) errors.push(`KPI ${i + 1}: faltan ${miss.join(", ")}`);
    });
  }

  return errors;
}

module.exports = { REQUIRED_BUSINESS, REQUIRED_TECHNICAL, IMPACTED_ELEMENTS, validateRequired, isValidEmail, validateBusinessExtras };
