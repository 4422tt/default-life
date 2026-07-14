export type RecognizedOrderItem = {
  id: string;
  merchantName: string | null;
  dishName: string;
  quantity: number;
  unitPrice?: number | null;
  paidAmount?: number | null;
  category?: string | null;
  confidence: number;
  sourceImageId: string;
  sourceFileName?: string;
};

export type OrderImportWarning = {
  type:
    | "LOW_CONFIDENCE"
    | "MISSING_MERCHANT"
    | "MISSING_PRICE"
    | "POSSIBLE_DUPLICATE"
    | "UNREADABLE_IMAGE";
  message: string;
  itemId?: string;
};

export type OrderPreferenceSummary = {
  flavors: string[];
  budgetLevel: "低预算" | "中预算" | "高预算" | "未知";
  commonCategories: string[];
  averagePaidAmount?: number | null;
};

export type OrderImportResult = {
  items: RecognizedOrderItem[];
  totalOrders: number;
  preferenceSummary: OrderPreferenceSummary;
  warnings: OrderImportWarning[];
};

export type OrderRecognitionErrorCode =
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  | "SERVICE_NOT_CONFIGURED"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "NO_ORDERS"
  | "UNREADABLE_IMAGE";

export class OrderRecognitionError extends Error {
  constructor(
    public readonly code: OrderRecognitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderRecognitionError";
  }
}
