import type {
  OrderImportResult,
  OrderImportWarning,
  RecognizedOrderItem,
} from "@/types/order-import";

export function normalizeOrderText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[，。；：、,.!?！？]+$/g, "")
    .toLocaleLowerCase("zh-CN");
}

export function orderMergeKey(item: Pick<RecognizedOrderItem, "merchantName" | "dishName">): string {
  return `${normalizeOrderText(item.merchantName ?? "未识别商家")}::${normalizeOrderText(item.dishName)}`;
}

function budgetLevel(average: number | null) {
  if (average === null) return "未知" as const;
  if (average < 20) return "低预算" as const;
  if (average <= 50) return "中预算" as const;
  return "高预算" as const;
}

function summarizeFlavors(items: RecognizedOrderItem[]) {
  const flavorTerms = ["麻辣", "香辣", "酸辣", "清汤", "咖喱", "甜", "烧烤"];
  return flavorTerms.filter((term) => (
    items.filter((item) => item.dishName.includes(term)).length >= 2
  ));
}

export function normalizeOrderImportResult(rawItems: RecognizedOrderItem[]): OrderImportResult {
  const warnings: OrderImportWarning[] = [];
  const items = rawItems
    .filter((item) => item && typeof item.dishName === "string" && item.dishName.trim())
    .map((item, index) => {
      const normalized: RecognizedOrderItem = {
        ...item,
        id: item.id || `recognized-${index + 1}`,
        merchantName: item.merchantName?.trim() || null,
        dishName: item.dishName.trim(),
        quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? Math.round(item.quantity) : 1,
        unitPrice: Number.isFinite(item.unitPrice) ? Number(item.unitPrice) : null,
        paidAmount: Number.isFinite(item.paidAmount) ? Number(item.paidAmount) : null,
        category: item.category?.trim() || null,
        confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
      };

      if (normalized.confidence < 0.75) {
        warnings.push({ type: "LOW_CONFIDENCE", itemId: normalized.id, message: "这条内容识别得不太确定，请确认。" });
      }
      if (!normalized.merchantName) {
        warnings.push({ type: "MISSING_MERCHANT", itemId: normalized.id, message: "未识别到商家名称。" });
      }
      if (normalized.unitPrice === null && normalized.paidAmount === null) {
        warnings.push({ type: "MISSING_PRICE", itemId: normalized.id, message: "未识别到价格。" });
      }
      return normalized;
    });

  const keyCounts = new Map<string, number>();
  items.forEach((item) => keyCounts.set(orderMergeKey(item), (keyCounts.get(orderMergeKey(item)) ?? 0) + 1));
  keyCounts.forEach((count, key) => {
    if (count > 1) warnings.push({ type: "POSSIBLE_DUPLICATE", message: `发现 ${count} 条可能重复的订单：${key.split("::")[1]}` });
  });

  const paidAmounts = items
    .map((item) => item.paidAmount ?? item.unitPrice ?? null)
    .filter((amount): amount is number => amount !== null);
  const averagePaidAmount = paidAmounts.length
    ? Number((paidAmounts.reduce((sum, amount) => sum + amount, 0) / paidAmounts.length).toFixed(2))
    : null;
  const categoryCounts = new Map<string, number>();
  items.forEach((item) => {
    if (item.category) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  });

  return {
    items,
    totalOrders: items.length,
    preferenceSummary: {
      flavors: summarizeFlavors(items),
      budgetLevel: budgetLevel(averagePaidAmount),
      commonCategories: [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category)
        .slice(0, 4),
      averagePaidAmount,
    },
    warnings,
  };
}
