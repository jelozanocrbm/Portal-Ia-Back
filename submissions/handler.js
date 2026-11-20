// Lambda: procesamiento de solicitudes (negocio y tecnica).
// Flujo: validar -> generar PDF -> guardar en S3 -> metadata en DynamoDB -> email SES.
const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");

const { ok, created, badRequest, notFound, serverError, parseBody, logInfo, logError } = require("../shared/utils");
const { REQUIRED_BUSINESS, REQUIRED_TECHNICAL, validateRequired, isValidEmail, validateBusinessExtras } = require("../shared/validation");
const { resolveRequester, computeRiskTotal } = require("../shared/transform");
const { buildPdf } = require("../shared/pdf");
const { requireGroups } = require("../shared/auth");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});

const TABLE = process.env.DYNAMODB_SUBMISSIONS_TABLE;
const BUCKET = process.env.S3_SUBMISSIONS_BUCKET;
const RECIPIENT = process.env.RECIPIENT_EMAIL;
const SENDER = process.env.SENDER_EMAIL;


function buildRawEmail(subject, bodyText, pdfBuffer, filename) {
  const boundary = "COEIA_BOUNDARY_" + randomUUID();
  const raw = [
    `From: ${SENDER}`,
    `To: ${RECIPIENT}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    bodyText,
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    pdfBuffer.toString("base64"),
    "",
    `--${boundary}--`
  ].join("\r\n");
  return Buffer.from(raw);
}

async function handleSubmission(event, type, requiredFields, title) {
  const payload = parseBody(event);
  const missing = validateRequired(payload, requiredFields);
  if (missing.length) return badRequest(`Faltan campos obligatorios: ${missing.join(", ")}`);
  // El correo solo se valida cuando el formulario lo incluye (el de negocio).
  if (payload.email && !isValidEmail(payload.email)) return badRequest("Correo inválido");
  if (type === "business") {
    const extras = validateBusinessExtras(payload);
    if (extras.length) return badRequest(extras.join("; "));
    // El riesgo total es de solo lectura: se recalcula siempre en servidor.
    payload.riesgoTotal = computeRiskTotal(payload.matrizRiesgos);
  }

  const requesterName = resolveRequester(payload);
  const submissionId = `${type.toUpperCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const s3Key = `submissions/${type}/${createdAt.slice(0, 10)}/${submissionId}.pdf`;

  const pdf = buildPdf(title, payload);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: pdf, ContentType: "application/pdf" }));

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { submissionId, type, createdAt, s3Key, requesterName, email: payload.email || null, status: "Recibida", data: payload }
  }));

  try {
    const raw = buildRawEmail(`[CoeIA] Nueva solicitud ${type} - ${submissionId}`, `Se recibió una nueva solicitud (${type}).\nRadicado: ${submissionId}\nSolicitante: ${requesterName}`, pdf, `${submissionId}.pdf`);
    await ses.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
  } catch (e) {
    logError("ses.sendEmail", e); // no bloquea la respuesta al usuario
  }

  logInfo("submission.created", { submissionId, type });
  return created({ submissionId, type, createdAt });
}

exports.submitBusiness = (event) => handleSubmission(event, "business", REQUIRED_BUSINESS, "Solicitud - Caso de negocio IA").catch(wrap);
exports.submitTechnical = (event) => handleSubmission(event, "technical", REQUIRED_TECHNICAL, "Solicitud - Iniciativa técnica").catch(wrap);

// Admin: listar paginado
exports.listSubmissions = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const qp = event.queryStringParameters || {};
    const type = qp.type;
    let startKey;
    if (qp.nextToken) {
      try { startKey = JSON.parse(Buffer.from(qp.nextToken, "base64url").toString("utf8")); }
      catch { return badRequest("nextToken inválido"); }
    }
    const cmd = type
      ? new QueryCommand({ TableName: TABLE, IndexName: "type-createdAt-index", KeyConditionExpression: "#t = :t", ExpressionAttributeNames: { "#t": "type" }, ExpressionAttributeValues: { ":t": type }, ScanIndexForward: false, Limit: 20, ExclusiveStartKey: startKey })
      : new ScanCommand({ TableName: TABLE, Limit: 20, ExclusiveStartKey: startKey });
    const res = await ddb.send(cmd);
    const items = (res.Items || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const nextToken = res.LastEvaluatedKey ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString("base64url") : null;
    return ok({ items, nextToken, hasMore: !!nextToken });
  } catch (e) { return wrap(e); }
};

exports.getSubmission = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const id = event.pathParameters?.id;
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { submissionId: id } }));
    if (!res.Item) return notFound();
    return ok(res.Item);
  } catch (e) { return wrap(e); }
};

exports.getDownloadUrl = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const id = event.pathParameters?.id;
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { submissionId: id } }));
    if (!res.Item) return notFound();
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: res.Item.s3Key }), { expiresIn: 900 });
    return ok({ url });
  } catch (e) { return wrap(e); }
};

function wrap(e) { logError("submissions.handler", e); return serverError(e.message); }