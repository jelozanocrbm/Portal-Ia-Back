// Pruebas del handler de FAQs con DynamoDB simulado.
// Intercepta require() de los paquetes AWS (compatible con Node 18/20/22, sin mock.module).
const { test } = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

let sendQueue = [];
let sendCalls = [];

const cmd = (type) => class { constructor(input) { this.input = input; this.__type = type; } };
const stubs = {
  "@aws-sdk/lib-dynamodb": {
    DynamoDBDocumentClient: {
      from: () => ({
        send: async (c) => {
          sendCalls.push(c);
          const next = sendQueue.shift();
          if (next instanceof Error) throw next;
          return next ?? {};
        }
      })
    },
    ScanCommand: cmd("Scan"),
    PutCommand: cmd("Put"),
    DeleteCommand: cmd("Delete"),
    GetCommand: cmd("Get")
  },
  "@aws-sdk/client-dynamodb": { DynamoDBClient: class {} }
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (stubs[request]) return stubs[request];
  return originalLoad.apply(this, arguments);
};
const handler = require("../faqs/handler");
Module._load = originalLoad; // el handler ya capturo los stubs

const ADMIN = { requestContext: { authorizer: { claims: { "cognito:groups": "Admin" } } } };

function reset() { sendQueue = []; sendCalls = []; }

test("listPublic agrupa las FAQs por categoria", async () => {
  reset();
  sendQueue.push({ Items: [
    { id: "1", category: "Uso", question: "a", order: 1 },
    { id: "2", category: "Uso", question: "b", order: 2 }
  ] });
  const res = await handler.listPublic();
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body[0].category, "Uso");
  assert.strictEqual(body[0].items.length, 2);
});

test("create rechaza payload incompleto con 400", async () => {
  reset();
  const res = await handler.create({ ...ADMIN, body: JSON.stringify({ question: "solo pregunta" }) });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(sendCalls.length, 0);
});

test("create guarda y responde 201 con el item", async () => {
  reset();
  sendQueue.push({});
  const res = await handler.create({ ...ADMIN, body: JSON.stringify({ category: "Uso", question: "p", answer: "r" }) });
  assert.strictEqual(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.category, "Uso");
  assert.ok(body.id);
  assert.strictEqual(sendCalls[0].__type, "Put");
});

test("remove responde 204", async () => {
  reset();
  sendQueue.push({});
  const res = await handler.remove({ ...ADMIN, pathParameters: { id: "123" } });
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(sendCalls[0].__type, "Delete");
});
test("create rechaza con 403 a quien no es Admin", async () => {
  reset();
  const res = await handler.create({ requestContext: { authorizer: { claims: { "cognito:groups": "COE" } } }, body: JSON.stringify({ category: "Uso", question: "p", answer: "r" }) });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(sendCalls.length, 0);
});
