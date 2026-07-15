import { normalizeOrderImportResult } from "@/lib/order-normalization";
import {
  OrderRecognitionError,
  type OrderImportResult,
  type RecognizedOrderItem,
} from "@/types/order-import";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Each request is sent independently. 3MB leaves room for base64 within Vercel's 4.5MB payload limit.
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_IMAGE_COUNT = 12;

type VisionResponse = {
  foodName: string;
  category: string;
  confidence: number | string;
};

function validateFiles(files: File[]) {
  if (files.length === 0) {
    throw new OrderRecognitionError("INVALID_FILE", "请先上传至少一张订单截图。");
  }
  if (files.length > MAX_IMAGE_COUNT) {
    throw new OrderRecognitionError("INVALID_FILE", `一次最多上传 ${MAX_IMAGE_COUNT} 张图片。`);
  }
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new OrderRecognitionError("INVALID_FILE", `${file.name} 不是支持的 JPG、PNG 或 WEBP 图片。`);
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new OrderRecognitionError("FILE_TOO_LARGE", `${file.name} 超过 3MB，请压缩后重试。`);
    }
  }
}

function isVisionResponse(value: unknown): value is VisionResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.foodName === "string"
    && typeof payload.category === "string"
    && (typeof payload.confidence === "number" || typeof payload.confidence === "string");
}

async function readAsDataUrl(file: File): Promise<string> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parts: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    }
    return `data:${file.type};base64,${btoa(parts.join(""))}`;
  } catch {
    throw new OrderRecognitionError("UNREADABLE_IMAGE", `${file.name} 无法读取，请换一张截图。`);
  }
}

function createRecognizedItem(
  payload: VisionResponse,
  file: File,
  imageIndex: number,
): RecognizedOrderItem {
  return {
    id: `vision-${imageIndex + 1}`,
    merchantName: null,
    dishName: payload.foodName.trim(),
    quantity: 1,
    unitPrice: null,
    paidAmount: null,
    category: payload.category.trim() || null,
    confidence: Number(payload.confidence),
    sourceImageId: `image-${imageIndex + 1}`,
    sourceFileName: file.name,
  };
}

async function recognizeOneScreenshot(endpoint: string, file: File, imageIndex: number) {
  const dataUrl = await readAsDataUrl(file);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: {
          name: file.name,
          mimeType: file.type,
          dataUrl,
        },
      }),
    });
  } catch {
    throw new OrderRecognitionError("NETWORK_ERROR", "识别服务暂时不可用，请稍后重试。");
  }

  if (!response.ok) {
    const message = response.status === 413
      ? "图片过大，请压缩后重试。"
      : response.status === 422
        ? "没有在图片中发现清晰的订单菜品，请上传完整订单页面。"
        : "识别服务暂时不可用，请稍后重试。";
    throw new OrderRecognitionError(response.status === 422 ? "NO_ORDERS" : "NETWORK_ERROR", message);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OrderRecognitionError("INVALID_RESPONSE", "识别结果格式异常，请重新上传。");
  }
  if (!isVisionResponse(payload)) {
    throw new OrderRecognitionError("INVALID_RESPONSE", "识别结果格式异常，请重新上传。");
  }
  if (!payload.foodName.trim()) {
    throw new OrderRecognitionError("NO_ORDERS", "没有在图片中发现清晰的订单菜品，请上传完整订单页面。");
  }
  return createRecognizedItem(payload, file, imageIndex);
}

export async function analyzeOrderScreenshots(files: File[]): Promise<OrderImportResult> {
  validateFiles(files);
  const endpoint = process.env.NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT?.trim();
  if (!endpoint) {
    throw new OrderRecognitionError(
      "SERVICE_NOT_CONFIGURED",
      "当前未配置图片识别服务。你可以手动添加，或配置 API 后使用截图导入。",
    );
  }

  const items: RecognizedOrderItem[] = [];
  for (const [index, file] of files.entries()) {
    items.push(await recognizeOneScreenshot(endpoint, file, index));
  }

  const result = normalizeOrderImportResult(items);
  if (result.items.length === 0) {
    throw new OrderRecognitionError("NO_ORDERS", "没有在图片中发现清晰的订单菜品，请上传完整订单页面。");
  }
  return result;
}
