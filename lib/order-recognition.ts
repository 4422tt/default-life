import { normalizeOrderImportResult } from "@/lib/order-normalization";
import {
  OrderRecognitionError,
  type OrderImportResult,
  type RecognizedOrderItem,
} from "@/types/order-import";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 12;

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
      throw new OrderRecognitionError("FILE_TOO_LARGE", `${file.name} 超过 10MB，请压缩后重试。`);
    }
  }
}

function isRecognitionPayload(value: unknown): value is { items: RecognizedOrderItem[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items));
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

  const formData = new FormData();
  files.forEach((file) => formData.append("images", file, file.name));

  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body: formData });
  } catch {
    throw new OrderRecognitionError("NETWORK_ERROR", "识别服务暂时不可用，请稍后重试。");
  }

  if (!response.ok) {
    const message = response.status === 422
      ? "没有在图片中发现清晰的已完成订单，请上传完整订单页面。"
      : "识别服务暂时不可用，请稍后重试。";
    throw new OrderRecognitionError(response.status === 422 ? "NO_ORDERS" : "NETWORK_ERROR", message);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OrderRecognitionError("INVALID_RESPONSE", "识别结果格式异常，请重新上传。");
  }
  if (!isRecognitionPayload(payload)) {
    throw new OrderRecognitionError("INVALID_RESPONSE", "识别结果格式异常，请重新上传。");
  }

  const result = normalizeOrderImportResult(payload.items);
  if (result.items.length === 0) {
    throw new OrderRecognitionError("NO_ORDERS", "没有在图片中发现清晰的已完成订单，请上传完整订单页面。");
  }
  return result;
}
