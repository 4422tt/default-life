const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CATEGORIES = new Set(["快餐", "正餐", "轻食", "饮品", "甜点", "夜宵", "其他"]);
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const QWEN_REQUEST_TIMEOUT_MS = 50_000;

const instruction = `请从这张中文外卖截图提取一笔订单的真实信息，并且只返回 JSON。
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

function corsHeaders(origin: string | null): Record<string, string> {
  const configured = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  const allowed = new Set(["https://4422tt.github.io", "http://localhost:3000", "http://127.0.0.1:3000", ...configured]);
  return origin && allowed.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function positiveNumberOrNull(value: unknown) {
  const number = numberOrNull(value);
  return number && number > 0 ? number : null;
}

function normalize(text: unknown) {
  if (typeof text !== "string") return null;
  try {
    const raw: unknown = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, ""));
    if (!raw || typeof raw !== "object") return null;
    const rawRecord = raw as Record<string, unknown>;
    if (!Array.isArray(rawRecord.items)) return null;
    const record = rawRecord as Record<string, unknown> & { items: unknown[] };
    const confidence = Number(record.confidence);
    return {
      merchantName: stringOrNull(record.merchantName),
      items: record.items.map((item) => {
        const entry: Record<string, unknown> = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const category = typeof entry.category === "string" && CATEGORIES.has(entry.category) ? entry.category : null;
        return {
          dishName: stringOrNull(entry.dishName),
          quantity: Number.isFinite(Number(entry.quantity)) && Number(entry.quantity) > 0 ? Math.round(Number(entry.quantity)) : null,
          price: positiveNumberOrNull(entry.price),
          category,
        };
      }),
      totalPrice: positiveNumberOrNull(record.totalPrice),
      discount: numberOrNull(record.discount),
      deliveryFee: numberOrNull(record.deliveryFee),
      orderTime: stringOrNull(record.orderTime),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    };
  } catch {
    return null;
  }
}

export default async function handler(request: Request) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", ...corsHeaders(origin) } });
  }
  if (request.method !== "POST") return json({ error: "请求方式不被支持" }, 405, origin);
  if (!process.env.DASHSCOPE_API_KEY) return json({ error: "自动识别暂时不可用，请确认订单信息。" }, 503, origin);

  try {
    const form = await request.formData();
    const image = form.get("image") ?? form.get("file");
    if (!(image instanceof File) || !ALLOWED_TYPES.has(image.type) || image.size === 0 || image.size > MAX_IMAGE_SIZE) {
      return json({ error: "请上传不超过 3MB 的 JPG、PNG 或 WEBP 图片。" }, 400, origin);
    }

    const imageData = Buffer.from(await image.arrayBuffer()).toString("base64");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QWEN_REQUEST_TIMEOUT_MS);
    const model = process.env.DASHSCOPE_VISION_MODEL || "qwen3.6-flash";
    const endpoint = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${image.type};base64,${imageData}` } },
            { type: "text", text: instruction },
          ],
        }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 900,
        enable_thinking: false,
      }),
    });
    clearTimeout(timer);
    if (!response.ok) {
      const detail = await response.text();
      console.error("[Qwen order recognition] Provider request failed", {
        status: response.status,
        detail: detail.slice(0, 1000),
      });
      return json({ error: "自动识别暂时不可用，请确认订单信息。" }, 502, origin);
    }
    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content;
    const recognized = normalize(text);
    return recognized ? json(recognized, 200, origin) : json({ error: "自动识别暂时不可用，请确认订单信息。" }, 502, origin);
  } catch (error) {
    console.error("[Qwen order recognition] Provider request threw", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ error: "自动识别暂时不可用，请确认订单信息。" }, 502, origin);
  }
}
