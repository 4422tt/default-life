const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ORDER_CATEGORIES = new Set(["快餐", "正餐", "轻食", "饮品", "甜点", "夜宵", "其他"]);
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
// Visual models can take longer than a text completion on a cold start. Keep
// this below Vercel Hobby's 60s function ceiling while allowing a real order
// screenshot enough time to be processed.
const QWEN_REQUEST_TIMEOUT_MS = 50_000;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://4422tt.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const ORDER_EXTRACTION_PROMPT = `请从这张中文外卖截图提取一笔订单的真实信息，并且只返回 JSON。

截图可能是订单详情页，也可能是订单历史或列表页。优先提取最新或最显眼的一张订单卡片；请仔细读取其中可见的商家、菜品和金额文字。

规则：
- merchantName 填截图中可见的店铺或餐厅名称。
- items[0].dishName 填订单中的菜品、套餐或商品名称。
- price 填该菜品金额；若菜品金额不清晰，填订单 totalPrice。
- 只在单个字段确实看不清时填写 null；只要截图里能读到商家、食物或金额，不能把 merchantName、dishName 和价格全部留空。
- 不要臆造内容；不要把 0 当作“未识别”的占位值。0 仅可用于明确显示为 0 的优惠或配送费。
- category 只能是：快餐、正餐、轻食、饮品、甜点、夜宵、其他；不确定时为 null。

严格返回以下 JSON，不要 Markdown、解释或其他文字：
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

function positiveNumberOrNull(value) {
  const number = numberOrNull(value);
  return number && number > 0 ? number : null;
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
      price: positiveNumberOrNull(item?.price),
      category: ORDER_CATEGORIES.has(item?.category) ? item.category : null,
    }));
    const confidence = Number(raw.confidence);
    return {
      merchantName: stringOrNull(raw.merchantName),
      items,
      totalPrice: positiveNumberOrNull(raw.totalPrice),
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
  const timeout = setTimeout(() => controller.abort(), QWEN_REQUEST_TIMEOUT_MS);
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
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: ORDER_EXTRACTION_PROMPT },
          ],
        }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 900,
        // This flow extracts a few fields only; reasoning makes it slower
        // without making the structured result better.
        enable_thinking: false,
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
