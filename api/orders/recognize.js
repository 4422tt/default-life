const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ORDER_CATEGORIES = new Set(["快餐", "正餐", "轻食", "饮品", "甜点", "夜宵", "其他"]);
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://4422tt.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const SYSTEM_INSTRUCTION = `你是一个订单截图识别助手。

你的任务是从外卖订单截图中提取结构化信息。

请只返回 JSON。
不要返回 Markdown。
不要解释。
不要输出额外文字。

需要识别：
1. 商家名称 merchantName
2. 菜品列表 items，每个菜品包含 dishName、quantity、price、category
3. 订单信息 totalPrice、discount、deliveryFee、orderTime

分类只能从：快餐、正餐、轻食、饮品、甜点、夜宵、其他。
如果无法确定，返回 null。不要猜测。

返回格式：
{
  "merchantName": null,
  "items": [{ "dishName": null, "quantity": null, "price": null, "category": null }],
  "totalPrice": null,
  "discount": null,
  "deliveryFee": null,
  "orderTime": null,
  "confidence": 0
}`;

function allowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function reply(res, status, body, origin) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return res.status(status).send(JSON.stringify(body));
}

async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function parseMultipartImage(body, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || "");
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) return null;

  const delimiter = Buffer.from(`--${boundary}`);
  const headerDivider = Buffer.from("\r\n\r\n");
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`);
  let offset = body.indexOf(delimiter) + delimiter.length;

  while (offset >= delimiter.length) {
    if (body.subarray(offset, offset + 2).toString() === "--") break;
    if (body.subarray(offset, offset + 2).toString() === "\r\n") offset += 2;
    const headerEnd = body.indexOf(headerDivider, offset);
    if (headerEnd < 0) break;

    const headers = body.subarray(offset, headerEnd).toString("utf8");
    const contentStart = headerEnd + headerDivider.length;
    const contentEnd = body.indexOf(nextDelimiter, contentStart);
    if (contentEnd < 0) break;

    const disposition = /content-disposition:\s*form-data;[^\r\n]*/i.exec(headers)?.[0] ?? "";
    const fieldName = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const mimeType = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim().toLowerCase();
    if ((fieldName === "image" || fieldName === "file") && filename && mimeType) {
      return { filename, mimeType, bytes: body.subarray(contentStart, contentEnd) };
    }
    offset = contentEnd + nextDelimiter.length;
  }
  return null;
}

function hasExpectedImageSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}

function numberOrNull(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseQwenResponse(content) {
  if (typeof content !== "string") return null;
  const jsonText = content.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    const raw = JSON.parse(jsonText);
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return null;
    const items = raw.items.map((item) => ({
      dishName: stringOrNull(item?.dishName),
      quantity: Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0 ? Math.round(Number(item.quantity)) : null,
      price: numberOrNull(item?.price),
      category: ORDER_CATEGORIES.has(item?.category) ? item.category : null,
    }));
    const confidence = Number(raw.confidence);
    return {
      merchantName: stringOrNull(raw.merchantName),
      items,
      totalPrice: numberOrNull(raw.totalPrice),
      discount: numberOrNull(raw.discount),
      deliveryFee: numberOrNull(raw.deliveryFee),
      orderTime: stringOrNull(raw.orderTime),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    };
  } catch {
    return null;
  }
}

async function recognizeWithQwen(image) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const model = process.env.DASHSCOPE_VISION_MODEL || "qwen3.6-flash";
    const endpoint = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const imageUrl = `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: "请从这张外卖订单截图提取订单信息。" },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[Qwen order recognition] Provider request failed", {
        status: response.status,
        detail: detail.slice(0, 1000),
      });
      return null;
    }
    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content;
    return parseQwenResponse(text);
  } finally {
    clearTimeout(timeout);
  }
}

const handler = async function handler(req, res) {
  const origin = Array.isArray(req.headers?.origin) ? req.headers.origin[0] : req.headers?.origin;
  if (origin && !allowedOrigins().has(origin)) return reply(res, 403, { error: "来源不被允许" }, origin);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (origin && allowedOrigins().has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(204).end();
  }
  if (req.method !== "POST") return reply(res, 405, { error: "请求方式不被支持" }, origin);
  if (!process.env.DASHSCOPE_API_KEY) return reply(res, 503, { error: "自动识别暂时不可用，请确认订单信息。" }, origin);

  try {
    const image = parseMultipartImage(await readBuffer(req), req.headers?.["content-type"]);
    if (!image || !ALLOWED_IMAGE_TYPES.has(image.mimeType) || image.bytes.length === 0 || image.bytes.length > MAX_IMAGE_SIZE || !hasExpectedImageSignature(image.bytes, image.mimeType)) {
      return reply(res, 400, { error: "请上传不超过 3MB 的 JPG、PNG 或 WEBP 图片。" }, origin);
    }
    const recognized = await recognizeWithQwen(image);
    if (!recognized) return reply(res, 502, { error: "自动识别暂时不可用，请确认订单信息。" }, origin);
    return reply(res, 200, recognized, origin);
  } catch (error) {
    console.error("[Qwen order recognition] Provider request threw", {
      name: error?.name,
      message: error?.message,
    });
    return reply(res, 502, { error: "自动识别暂时不可用，请确认订单信息。" }, origin);
  }
};

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
