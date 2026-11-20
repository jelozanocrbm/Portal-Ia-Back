// Funciones puras de transformacion compartidas por los handlers Lambda.
// Separadas para poder probarlas sin dependencias de AWS.

// Agrupa una lista plana de FAQs por categoria, respetando el campo "order".
function groupByCategory(items) {
  const map = new Map();
  for (const f of [...items].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    if (!map.has(f.category)) map.set(f.category, []);
    map.get(f.category).push(f);
  }
  return Array.from(map.entries()).map(([category, list]) => ({ category, items: list }));
}

// Normaliza un valor para mostrarlo en el PDF.
// Arrays -> lista separada por comas; objetos (matriz de riesgos, aprobaciones) -> pares aplanados.
// Aplana recursivamente un valor a texto sin producir "[object Object]".
function flatten(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(flatten).filter((s) => s.trim() !== "").join(", ");
  if (typeof v === "object") {
    return Object.entries(v)
      .map(([k, val]) => {
        const inner = flatten(val);
        return inner.trim() ? `${k}: ${inner}` : "";
      })
      .filter((s) => s !== "")
      .join("; ");
  }
  return String(v);
}

// Etiquetas de bloque para arrays de objetos (por clave del payload).
const BLOCK_LABELS = { kpis: "KPI", tiposInformacion: "Tipo de información" };

function displayValue(v, key) {
  if (v == null) return "";
  if (Array.isArray(v)) {
    if (v.some((x) => x && typeof x === "object")) {
      const label = BLOCK_LABELS[key] || "Elemento";
      return v
        .map((x, i) => {
          const text = x && typeof x === "object" ? flatten(x) : String(x ?? "");
          return text.trim() ? `${label} ${i + 1}: ${text}` : "";
        })
        .filter((s) => s !== "")
        .join("\n");
    }
    return v.join(", ");
  }
  if (typeof v === "object") {
    return Object.entries(v)
      .map(([k, val]) => {
        const isObj = val && typeof val === "object" && !Array.isArray(val);
        // detalleElemento emite "clave: valor"; matrizRiesgos y demás conservan el formato compacto.
        const inner = isObj && key !== "detalleElemento"
          ? Object.values(val).map(flatten).filter((x) => x.trim() !== "").join(" / ")
          : flatten(val);
        return inner.trim() ? `${k}: ${inner}` : "";
      })
      .filter((s) => s !== "")
      .join(" | ");
  }
  return String(v);
}

// Riesgo total = nivel maximo de la matriz de riesgos; "No calculado" si no hay niveles validos.
const RISK_VALUE = { bajo: 1, medio: 2, alto: 3, critico: 4 };
const RISK_NAME = { 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Crítico" };
function computeRiskTotal(matriz) {
  if (!matriz || typeof matriz !== "object") return "No calculado";
  let max = 0;
  for (const row of Object.values(matriz)) {
    const raw = row && typeof row === "object" ? row.nivel : "";
    if (typeof raw !== "string") continue;
    const val = RISK_VALUE[raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()] || 0;
    if (val > max) max = val;
  }
  return max ? RISK_NAME[max] : "No calculado";
}

// Nombre del solicitante segun el tipo de formulario.
function resolveRequester(payload) {
  return payload.requesterName || payload.responsable || payload.lider || payload.area || "No especificado";
}

module.exports = { groupByCategory, displayValue, computeRiskTotal, resolveRequester };