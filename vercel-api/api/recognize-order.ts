const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://4422tt.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const MAX_DATA_URL_LENGTH = 4_000_000;

const SYSTEM_PROMPT = `你是 Default Life 的生活操作系统助手。
你的目标不是替用户做人生重大决定，而是帮助用户减少每天重复消耗注意力的小选择。
请根据用户提供的信息：提取习惯、识别偏好、形成默认规则、输出未来可执行方案。
回答简洁、结构化，并且只输出 json。`;

type ImageImportRequest = {
  action?: "image-import";
  image?: {
    mimeType?: unknown;
    dataUrl?: unknown;
  };
};

type LifeRuleRequest = {
  action: "life-rule";
  userInput?: unknown;
};

type DeepSeekResult = {
  result: string;
  category: string;
  confidence: number;
  defaultRule: string;
};

function allowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function isDataUrl(value: string, mimeType: string) {
  const expectedPrefix = `data:${mimeType};base64,`;
  return value.startsWith(expectedPrefix)
    && value.length <= MAX_DATA_URL_LENGTH
    && /^[A-Za-z0-9+/=]+$/.test(value.slice(expectedPrefix.length));
}

function parseDeepSeekResult(content: unknown): DeepSeekResult | null {
  if (typeof content !== "string") return null;
  try {
    const value = JSON.parse(content) as Partial<DeepSeekResult>;
    if (typeof value.result !== "string" || typeof value.category !== "string" || typeof value.defaultRule !== "string") return null;
    const confidence = Number(value.confidence);
    if (!Number.isFinite(confidence)) return null;
    return {
      result: value.result.trim(),
      category: value.category.trim(),
      confidence: Math.min(1, Math.max(0, confidence)),
      defaultRule: value.defaultRule.trim(),
    };
  } catch {
    return null;
  }
}

async function createLifeRule(userInput: string): Promise<DeepSeekResult | null> {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.2,
      max_tokens: 320,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n返回格式：{"result":"","category":"","confidence":0,"defaultRule":""}` },
        { role: "user", content: userInput },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  return parseDeepSeekResult(payload.choices?.[0]?.message?.content);
}

export default {
  async fetch(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins().has(origin)) return json({ error: "来源不被允许" }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "请求方式不被支持" }, 405, origin);

    let body: ImageImportRequest | LifeRuleRequest;
    try {
      body = await request.json() as ImageImportRequest | LifeRuleRequest;
    } catch {
      return json({ error: "请求内容无效" }, 400, origin);
    }

    if (body.action === "life-rule") {
      if (!process.env.DEEPSEEK_API_KEY) return json({ error: "AI服务暂时不可用，请稍后重试" }, 503, origin);
      const userInput = typeof body.userInput === "string" ? body.userInput.trim() : "";
      if (!userInput) return json({ error: "请输入订单名称或生活选择" }, 400, origin);
      try {
        const result = await createLifeRule(userInput);
        return result
          ? json(result, 200, origin)
          : json({ error: "AI服务暂时不可用，请稍后重试" }, 502, origin);
      } catch {
        return json({ error: "AI服务暂时不可用，请稍后重试" }, 502, origin);
      }
    }

    const mimeType = body.image?.mimeType;
    const dataUrl = body.image?.dataUrl;
    if (typeof mimeType !== "string" || typeof dataUrl !== "string" || !ALLOWED_IMAGE_TYPES.has(mimeType) || !isDataUrl(dataUrl, mimeType)) {
      return json({ error: "图片格式无效" }, 400, origin);
    }

    // DeepSeek's documented API flow is text analysis. Keep the screenshot import flow usable,
    // but ask for the real order name instead of inventing an OCR result.
    return json({
      result: "",
      category: "",
      confidence: 0,
      defaultRule: "请输入订单名称，我会帮你建立默认规则。",
      requiresManualEntry: true,
    }, 200, origin);
  },
};
