const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://4422tt.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DATA_URL_LENGTH = 4_000_000;
const SYSTEM_PROMPT = `你是 Default Life 的生活操作系统助手。
你的目标不是替用户做人生重大决定，而是帮助用户减少每天重复消耗注意力的小选择。
请根据用户提供的信息：提取习惯、识别偏好、形成默认规则、输出未来可执行方案。
回答简洁、结构化，并且只输出 json。`;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function allowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function reply(res, status, body, origin) {
  res.setHeader("Cache-Control", "no-store");
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return res.status(status).json(body);
}

function parseBody(body) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function readRequestBody(req) {
  if (req.body !== undefined && req.body !== null) return req.body;
  if (typeof req.on !== "function") return null;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function parseResult(content) {
  if (typeof content !== "string") return null;
  try {
    const value = JSON.parse(content);
    const confidence = Number(value.confidence);
    if (typeof value.result !== "string" || typeof value.category !== "string" || typeof value.defaultRule !== "string" || !Number.isFinite(confidence)) return null;
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

async function createLifeRule(userInput) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
  const payload = await response.json();
  return parseResult(payload.choices?.[0]?.message?.content);
}

module.exports = async function handler(req, res) {
  const origin = firstHeader(req.headers?.origin);
  if (origin && !allowedOrigins().has(origin)) return reply(res, 403, { error: "来源不被允许" }, origin);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (origin && allowedOrigins().has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(204).end();
  }
  if (req.method !== "POST") return reply(res, 405, { error: "请求方式不被支持" }, origin);

  const body = parseBody(await readRequestBody(req));
  if (!body || typeof body !== "object") return reply(res, 400, { error: "请求内容无效" }, origin);
  const data = body;

  if (data.action === "life-rule") {
    if (!process.env.DEEPSEEK_API_KEY) return reply(res, 503, { error: "AI服务暂时不可用，请稍后重试" }, origin);
    const userInput = typeof data.userInput === "string" ? data.userInput.trim() : "";
    if (!userInput) return reply(res, 400, { error: "请输入订单名称或生活选择" }, origin);
    try {
      const result = await createLifeRule(userInput);
      return result ? reply(res, 200, result, origin) : reply(res, 502, { error: "AI服务暂时不可用，请稍后重试" }, origin);
    } catch {
      return reply(res, 502, { error: "AI服务暂时不可用，请稍后重试" }, origin);
    }
  }

  const image = data.image;
  const mimeType = image?.mimeType;
  const dataUrl = image?.dataUrl;
  const isValidImage = typeof mimeType === "string"
    && typeof dataUrl === "string"
    && ALLOWED_IMAGE_TYPES.has(mimeType)
    && dataUrl.startsWith(`data:${mimeType};base64,`)
    && dataUrl.length <= MAX_DATA_URL_LENGTH;
  if (!isValidImage) return reply(res, 400, { error: "图片格式无效" }, origin);

  return reply(res, 200, {
    result: "",
    category: "",
    confidence: 0,
    defaultRule: "请输入订单名称，我会帮你建立默认规则。",
    requiresManualEntry: true,
  }, origin);
};
