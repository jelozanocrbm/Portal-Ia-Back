// Utilidades compartidas para las funciones Lambda (Node.js 20, AWS SDK v3).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: body === undefined ? "" : JSON.stringify(body)
  };
}

const ok = (body) => response(200, body);
const created = (body) => response(201, body);
const noContent = () => response(204);
const badRequest = (msg) => response(400, { error: msg });
const notFound = (msg = "No encontrado") => response(404, { error: msg });
const serverError = (msg = "Error interno") => response(500, { error: msg });

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error("JSON inválido en el cuerpo de la solicitud");
  }
}

function logInfo(context, data) {
  console.log(JSON.stringify({ level: "INFO", context, ...data }));
}
function logError(context, error) {
  console.error(JSON.stringify({ level: "ERROR", context, message: error.message, stack: error.stack }));
}

module.exports = {
  CORS_HEADERS,
  response,
  ok,
  created,
  noContent,
  badRequest,
  notFound,
  serverError,
  parseBody,
  logInfo,
  logError
};
