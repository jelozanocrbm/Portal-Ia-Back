// Lambda: procesamiento del catalogo de agentes subido como Excel a S3.
// Trigger: evento S3 (ObjectCreated) sobre el archivo agents-catalog.xlsx.
// Convierte Excel -> JSON y lo publica como agents-catalog.json para el frontend.
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const XLSX = require("xlsx");
const { logInfo, logError } = require("../shared/utils");

const s3 = new S3Client({});
const OUTPUT_KEY = process.env.CATALOG_OUTPUT_KEY || "data/agents-catalog.json";
const OUTPUT_BUCKET = process.env.CATALOG_OUTPUT_BUCKET;

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

exports.processCatalog = async (event) => {
  try {
    const record = event.Records[0].s3;
    const bucket = record.bucket.name;
    const key = decodeURIComponent(record.object.key.replace(/\+/g, " "));

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = await streamToBuffer(obj.Body);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const agents = rows.map((r) => ({
      name: r.name || r.Nombre || "",
      category: r.category || r.Categoria || "",
      description: r.description || r.Descripcion || "",
      allowedUsage: r.allowedUsage || r.UsoPermitido || ""
    }));

    await s3.send(new PutObjectCommand({
      Bucket: OUTPUT_BUCKET || bucket,
      Key: OUTPUT_KEY,
      Body: JSON.stringify(agents, null, 2),
      ContentType: "application/json"
    }));

    logInfo("catalog.processed", { count: agents.length });
    return { ok: true, count: agents.length };
  } catch (e) {
    logError("catalog.processCatalog", e);
    throw e;
  }
};
