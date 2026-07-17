export const ORDER_CATEGORIES = ["快餐", "正餐", "轻食", "饮品", "甜点", "夜宵", "其他"] as const;

export type OrderCategory = (typeof ORDER_CATEGORIES)[number];

export type GeminiOrderItem = {
  dishName: string | null;
  quantity: number | null;
  price: number | null;
  category: OrderCategory | null;
};

export type GeminiOrderRecognition = {
  merchantName: string | null;
  items: GeminiOrderItem[];
  totalPrice: number | null;
  discount: number | null;
  deliveryFee: number | null;
  orderTime: string | null;
  confidence: number;
};

export class GeminiRecognitionError extends Error {
  constructor(
    public readonly code: "SERVICE_NOT_CONFIGURED" | "NETWORK_ERROR" | "INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "GeminiRecognitionError";
  }
}

function isRecognition(value: unknown): value is GeminiOrderRecognition {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.items)
    && (typeof payload.merchantName === "string" || payload.merchantName === null)
    && (typeof payload.totalPrice === "number" || payload.totalPrice === null)
    && (typeof payload.discount === "number" || payload.discount === null)
    && (typeof payload.deliveryFee === "number" || payload.deliveryFee === null)
    && (typeof payload.orderTime === "string" || payload.orderTime === null)
    && typeof payload.confidence === "number";
}

export async function recognizeOrderScreenshot(file: File): Promise<GeminiOrderRecognition> {
  const endpoint = process.env.NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT?.trim()
    || "https://default-life.vercel.app/api/orders/recognize";

  const formData = new FormData();
  formData.set("image", file, file.name);

  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body: formData });
  } catch {
    throw new GeminiRecognitionError("NETWORK_ERROR", "自动识别暂时不可用，请确认订单信息。");
  }

  if (!response.ok) {
    throw new GeminiRecognitionError("NETWORK_ERROR", "自动识别暂时不可用，请确认订单信息。");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GeminiRecognitionError("INVALID_RESPONSE", "自动识别暂时不可用，请确认订单信息。");
  }

  if (!isRecognition(payload)) {
    throw new GeminiRecognitionError("INVALID_RESPONSE", "自动识别暂时不可用，请确认订单信息。");
  }

  return payload;
}
