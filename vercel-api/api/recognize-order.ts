const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://4422tt.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const MAX_DATA_URL_LENGTH = 4_000_000;

type RecognitionRequest = {
  image?: {
    name?: unknown;
    mimeType?: unknown;
    dataUrl?: unknown;
  };
};

type FoodRecognition = {
  foodName: string;
  category: string;
  confidence: number;
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

function getOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function parseRecognition(text: string): FoodRecognition | null {
  try {
    const value = JSON.parse(text) as Partial<FoodRecognition>;
    if (typeof value.foodName !== "string" || typeof value.category !== "string") return null;
    const confidence = Number(value.confidence);
    if (!Number.isFinite(confidence)) return null;
    return {
      foodName: value.foodName.trim(),
      category: value.category.trim(),
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins().has(origin)) {
      return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, origin);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    if (!process.env.OPENAI_API_KEY) return json({ error: "VISION_NOT_CONFIGURED" }, 503, origin);

    let body: RecognitionRequest;
    try {
      body = await request.json() as RecognitionRequest;
    } catch {
      return json({ error: "INVALID_REQUEST" }, 400, origin);
    }

    const mimeType = body.image?.mimeType;
    const dataUrl = body.image?.dataUrl;
    if (typeof mimeType !== "string" || typeof dataUrl !== "string" || !ALLOWED_IMAGE_TYPES.has(mimeType) || !isDataUrl(dataUrl, mimeType)) {
      return json({ error: "INVALID_IMAGE" }, 400, origin);
    }

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
        store: false,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Read this food-delivery order screenshot. Return only the most clearly identifiable food or dish name, a compact Chinese category, and an honest confidence from 0 to 1. Use an empty foodName and confidence 0 when no food can be identified. Never invent items, prices, merchants, or order history.",
            },
            { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "food_recognition",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                foodName: { type: "string" },
                category: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["foodName", "category", "confidence"],
            },
          },
        },
      }),
    });

    if (!openAIResponse.ok) {
      return json({ error: "VISION_UNAVAILABLE" }, 502, origin);
    }

    const outputText = getOutputText(await openAIResponse.json());
    const result = outputText ? parseRecognition(outputText) : null;
    if (!result || !result.foodName) {
      return json({ error: "NO_FOOD_FOUND" }, 422, origin);
    }
    return json(result, 200, origin);
  },
};
