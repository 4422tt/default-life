const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CATEGORIES = new Set(["快餐", "正餐", "轻食", "饮品", "甜点", "夜宵", "其他"]);
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;

const instruction = `你是一个订单截图识别助手。
你的任务是从外卖订单截图中提取结构化信息。
请只返回 JSON。不要返回 Markdown。不要解释。不要输出额外文字。

需要识别 merchantName、items、totalPrice、discount、deliveryFee、orderTime 和 confidence。
items 中的每个项目包含 dishName、quantity、price、category。
category 只能为：快餐、正餐、轻食、饮品、甜点、夜宵、其他；无法确定时返回 null，不要猜测。

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
          price: numberOrNull(entry.price),
          category,
        };
      }),
      totalPrice: numberOrNull(record.totalPrice),
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
    const timer = setTimeout(() => controller.abort(), 20_000);
    const model = process.env.DASHSCOPE_VISION_MODEL || "qwen3.6-flash";
    const endpoint = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: instruction },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${image.type};base64,${imageData}` } },
              { type: "text", text: "请从这张外卖订单截图提取订单信息。" },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
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
