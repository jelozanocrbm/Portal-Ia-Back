// Autorizacion por rol. El authorizer de Cognito en API Gateway valida el token;
// aqui se valida que el usuario pertenezca a uno de los grupos permitidos.
const { response } = require("./utils");

const GROUPS = Object.freeze({
  ADMIN: "Admin",
  COMITE_TECNICO: "ComiteTecnico",
  COE: "COE",
  USUARIO: "Usuario"
});

/** @returns {string[]} grupos de Cognito del usuario (claim cognito:groups). */
function getGroups(event) {
  const raw = event?.requestContext?.authorizer?.claims?.["cognito:groups"];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // API Gateway entrega el claim como string: "Admin" o "[Admin COE]"
  return String(raw).replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean);
}

/** @returns {object|null} respuesta 403 si no tiene el grupo, o null si puede continuar. */
function requireGroups(event, allowed = [GROUPS.ADMIN]) {
  const groups = getGroups(event);
  if (groups.some((g) => allowed.includes(g))) return null;
  return response(403, { error: "No tiene permisos para esta operación" });
}

module.exports = { GROUPS, getGroups, requireGroups };
