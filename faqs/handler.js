// Lambda: FAQs — lectura publica (GET /faqs) y CRUD admin.
const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ok, created, noContent, badRequest, notFound, serverError, parseBody, logError } = require("../shared/utils");
const { groupByCategory } = require("../shared/transform");
const { requireGroups } = require("../shared/auth");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.DYNAMODB_FAQS_TABLE;


// GET /faqs (publico) — agrupado por categoria
exports.listPublic = async () => {
  try {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE }));
    return ok(groupByCategory(res.Items || []));
  } catch (e) { return wrap(e); }
};

// GET /admin/faqs — igual, incluye todas las entradas
exports.listAdmin = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE }));
    return ok(groupByCategory(res.Items || []));
  } catch (e) { return wrap(e); }
};

// POST /admin/faqs
exports.create = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const body = parseBody(event);
    if (!body.category || !body.question || !body.answer) return badRequest("category, question y answer son obligatorios");
    const item = { id: randomUUID(), category: body.category, question: body.question, answer: body.answer, order: body.order ?? 0, updatedAt: new Date().toISOString() };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return created(item);
  } catch (e) { return wrap(e); }
};

// PUT /admin/faqs/{id}
exports.update = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const id = event.pathParameters?.id;
    const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
    if (!existing.Item) return notFound("FAQ no encontrada");
    const body = parseBody(event);
    const item = { ...existing.Item, category: body.category ?? existing.Item.category, question: body.question ?? existing.Item.question, answer: body.answer ?? existing.Item.answer, order: body.order ?? existing.Item.order, updatedAt: new Date().toISOString() };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
    return ok(item);
  } catch (e) { return wrap(e); }
};

// DELETE /admin/faqs/{id}
exports.remove = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const id = event.pathParameters?.id;
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
    return noContent();
  } catch (e) { return wrap(e); }
};

// PUT /admin/faqs/reorder
exports.reorder = async (event) => {
  const denied = requireGroups(event); if (denied) return denied;
  try {
    const { orderedIds } = parseBody(event);
    if (!Array.isArray(orderedIds)) return badRequest("orderedIds debe ser un arreglo");
    await Promise.all(orderedIds.map((id, index) =>
      ddb.send(new GetCommand({ TableName: TABLE, Key: { id } })).then((r) => {
        if (r.Item) return ddb.send(new PutCommand({ TableName: TABLE, Item: { ...r.Item, order: index } }));
      })
    ));
    return noContent();
  } catch (e) { return wrap(e); }
};

function wrap(e) { logError("faqs.handler", e); return serverError(e.message); }
