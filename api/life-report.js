const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://4422tt.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const SYSTEM_PROMPT = `你是 Default Life 的饮食分析助手。你的工作是帮助用户理解今天的生活，而不是提供医疗诊断、减肥计划或精确营养计算。

根据用户描述的今天饮食，输出轻量、日常、克制的反馈。所有热量都只能是估算，必须以“约”开头，并包含 kcal。不要输出精确的营养克数。信息不明确时，使用“约”“估算”或“可能”，不要编造细节。

只输出严格 JSON，不要 Markdown，不要解释。返回格式：
{
  "foods": [{ "name": "", "calories": "约 0 kcal", "category": "" }],
  "totalCalories": "约 0 kcal",
  "nutritionSummary": { "protein": "偏低", "carbohydrate": "中等", "fat": "偏高" },
  "suggestion": ""
}

nutritionSummary 的每一个值只能是：偏低、中等、偏高。suggestion 保持一到两句，使用“可能”或“建议”表述日常饮食建议，不作医疗结论。`;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function allowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
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

function parseBody(body) {
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (body instanceof Uint8Array) body = Buffer.from(body).toString("utf8");
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function readRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body.on === "function") {
      const chunks = [];
      for await (const chunk of req.body) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    }
    return req.body;
  }
  if (typeof req.on !== "function") return null;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function approximate(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.startsWith("约") ? text : `约 ${text}`;
}

function nutritionSignal(value) {
  return ["偏低", "中等", "偏高"].includes(value) ? value : "中等";
}

function parseReport(content) {
  if (typeof content !== "string") return null;
  try {
    const payload = JSON.parse(content);
    if (!Array.isArray(payload.foods) || !payload.nutritionSummary || typeof payload.suggestion !== "string") return null;
    const foods = payload.foods.slice(0, 8).map((food) => {
      const name = typeof food?.name === "string" ? food.name.trim() : "";
      if (!name) return null;
      return {
        name,
        calories: approximate(food.calories, "约 未知 kcal"),
        category: typeof food.category === "string" && food.category.trim() ? food.category.trim() : "日常饮食",
      };
    }).filter(Boolean);
    if (!foods.length || !payload.suggestion.trim()) return null;
    return {
      foods,
      totalCalories: approximate(payload.totalCalories, "约 未知 kcal"),
      nutritionSummary: {
        protein: nutritionSignal(payload.nutritionSummary.protein),
        carbohydrate: nutritionSignal(payload.nutritionSummary.carbohydrate),
        fat: nutritionSignal(payload.nutritionSummary.fat),
      },
      suggestion: payload.suggestion.trim(),
    };
  } catch {
    return null;
  }
}

async function createReport(input) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `今天吃了：${input}` },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return parseReport(payload.choices?.[0]?.message?.content);
}

const handler = async function handler(req, res) {
  const origin = firstHeader(req.headers?.origin);
  if (origin && !allowedOrigins().has(origin)) return reply(res, 403, { error: "暂时无法分析，请稍后再试。" }, origin);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (origin && allowedOrigins().has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(204).end();
  }
  if (req.method !== "POST") return reply(res, 405, { error: "暂时无法分析，请稍后再试。" }, origin);
  if (!process.env.DEEPSEEK_API_KEY) return reply(res, 503, { error: "暂时无法分析，请稍后再试。" }, origin);

  const body = parseBody(await readRequestBody(req));
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) return reply(res, 400, { error: "暂时无法分析，请稍后再试。" }, origin);

  try {
    const report = await createReport(input);
    return report
      ? reply(res, 200, report, origin)
      : reply(res, 502, { error: "暂时无法分析，请稍后再试。" }, origin);
  } catch (error) {
    console.error("[Life report] DeepSeek request failed", error?.name ?? "unknown");
    return reply(res, 502, { error: "暂时无法分析，请稍后再试。" }, origin);
  }
};

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
