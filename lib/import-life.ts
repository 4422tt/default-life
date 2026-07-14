import { orderMergeKey } from "@/lib/order-normalization";
import type { LifeImportAnalysis, LifeImportCandidate, PriceLevel } from "@/lib/types";
import type { OrderImportResult, RecognizedOrderItem } from "@/types/order-import";

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `order-${(hash >>> 0).toString(36)}`;
}

function priceLevel(item: RecognizedOrderItem): PriceLevel {
  const amount = item.paidAmount ?? item.unitPrice ?? null;
  if (amount === null || amount < 20) return 1;
  if (amount <= 50) return 2;
  return 3;
}

export function createLifeImportAnalysis(result: OrderImportResult): LifeImportAnalysis {
  const grouped = new Map<string, LifeImportCandidate>();

  result.items.forEach((item) => {
    const key = orderMergeKey(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.frequency += 1;
      existing.quantity = (existing.quantity ?? 0) + item.quantity;
      existing.confidence = Math.min(existing.confidence ?? 1, item.confidence);
      return;
    }

    grouped.set(key, {
      id: stableId(`${key}::${item.sourceImageId}`),
      name: item.dishName,
      frequency: 1,
      quantity: item.quantity,
      merchantName: item.merchantName,
      unitPrice: item.unitPrice ?? null,
      paidAmount: item.paidAmount ?? null,
      category: item.category ?? null,
      confidence: item.confidence,
      sourceImageId: item.sourceImageId,
      sourceFileName: item.sourceFileName,
      kind: "delivery",
      priceLevel: priceLevel(item),
      love: 3,
      health: 3,
      etaMinutes: 30,
      weatherTags: ["normal"],
      energyTags: ["normal"],
      companionTags: ["solo"],
    });
  });

  const candidates = [...grouped.values()];
  const repeatedOrders = candidates.reduce((sum, candidate) => (
    sum + (candidate.frequency > 1 ? candidate.frequency : 0)
  ), 0);
  const familiarShare = result.totalOrders > 0
    ? Math.round((repeatedOrders / result.totalOrders) * 100)
    : 0;
  const keywords = [
    ...(familiarShare >= 50 ? ["偏好稳定"] : []),
    ...(result.totalOrders >= 5 ? ["已有选择记录"] : []),
  ];
  const flavorText = result.preferenceSummary.flavors.length
    ? result.preferenceSummary.flavors.join("、")
    : "暂时没有足够数据判断口味偏好";

  return {
    candidates,
    totalOrders: result.totalOrders,
    profile: {
      windowDays: 0,
      familiarDinnerShare: familiarShare,
      keywords,
      taste: flavorText,
      budgetLabel: result.preferenceSummary.budgetLevel,
      dinnerPattern: "暂时没有足够数据判断晚餐节奏",
      weekdayRule: "等待更多真实订单",
      weekendRule: "等待更多真实订单",
      insight: "画像只基于你确认导入的真实订单生成。",
    },
  };
}
