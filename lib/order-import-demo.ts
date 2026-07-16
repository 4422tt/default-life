import { normalizeOrderText } from "@/lib/order-normalization";
import type {
  DefaultRuleSuggestion,
  FoodOption,
  LifeImportAnalysis,
  LifeImportCandidate,
  PriceLevel,
} from "@/lib/types";

export const orderCategories = ["快餐", "正餐", "轻食", "饮品", "甜点", "夜宵", "其他"] as const;

export interface DemoOrder {
  id: string;
  merchantName: string;
  dishName: string;
  price: string;
  category: (typeof orderCategories)[number];
}

export const demoOrders: DemoOrder[] = [
  { id: "mcdonalds", merchantName: "麦当劳", dishName: "麦辣鸡腿堡套餐", price: "29.9", category: "快餐" },
  { id: "malatang", merchantName: "张亮麻辣烫", dishName: "自选麻辣烫", price: "34", category: "正餐" },
  { id: "luckin", merchantName: "瑞幸咖啡", dishName: "生椰拿铁", price: "13.9", category: "饮品" },
];

export interface OrderDraft {
  merchantName: string;
  dishName: string;
  price: string;
  category: string;
  isDemo: boolean;
}

export interface OrderHistoryCounts {
  historyCount: number;
  merchantCount: number;
  isRepeatOrder: boolean;
}

function optionHistoryCount(option: FoodOption) {
  return option.historicalCount ?? option.choiceCount;
}

function matchesText(left: string | null | undefined, right: string) {
  return normalizeOrderText(left ?? "") === normalizeOrderText(right);
}

export function calculateOrderHistory(options: FoodOption[], draft: Pick<OrderDraft, "merchantName" | "dishName">): OrderHistoryCounts {
  const sameDish = options.filter((option) => (
    matchesText(option.merchantName, draft.merchantName) && matchesText(option.name, draft.dishName)
  ));
  const sameMerchant = options.filter((option) => matchesText(option.merchantName, draft.merchantName));
  const historyBefore = sameDish.reduce((sum, option) => sum + optionHistoryCount(option), 0);
  const merchantBefore = sameMerchant.reduce((sum, option) => sum + optionHistoryCount(option), 0);

  return {
    historyCount: historyBefore + 1,
    merchantCount: merchantBefore + 1,
    isRepeatOrder: historyBefore > 0,
  };
}

function priceLevel(price: number | null): PriceLevel {
  if (price === null || price < 20) return 1;
  if (price <= 50) return 2;
  return 3;
}

export function parseOrderPrice(value: string) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function makeOrderCandidate(draft: OrderDraft, counts: OrderHistoryCounts): LifeImportCandidate {
  const price = parseOrderPrice(draft.price);
  return {
    id: `confirmed-order-${Date.now()}`,
    name: draft.dishName.trim(),
    merchantName: draft.merchantName.trim() || null,
    frequency: 1,
    historyCount: counts.historyCount,
    merchantCount: counts.merchantCount,
    isRepeatOrder: counts.isRepeatOrder,
    importIncrement: 1,
    unitPrice: price,
    paidAmount: price,
    category: draft.category.trim() || "其他",
    confidence: 1,
    kind: "delivery",
    priceLevel: priceLevel(price),
    love: 3,
    health: 3,
    etaMinutes: 30,
    weatherTags: ["normal"],
    energyTags: ["normal"],
    companionTags: ["solo"],
  };
}

export function createLocalImportAnalysis(candidate: LifeImportCandidate): LifeImportAnalysis {
  const historyCount = candidate.historyCount ?? candidate.frequency;
  const budgetLabel = candidate.priceLevel === 1 ? "30 元以内" : candidate.priceLevel === 2 ? "中等预算" : "高预算";
  return {
    candidates: [candidate],
    totalOrders: historyCount,
    profile: {
      windowDays: 0,
      familiarDinnerShare: historyCount > 1 ? 100 : 0,
      keywords: historyCount > 1 ? ["熟悉选择", "低决策成本"] : ["正在学习"],
      taste: "会随着更多真实选择逐渐清晰",
      budgetLabel,
      dinnerPattern: "当前还在积累你的日常选择",
      weekdayRule: "系统只会在你留下的偏好范围内做决定。",
      weekendRule: "可以在熟悉选择之外留出一点探索空间。",
      insight: historyCount > 1 ? "重复选择不是问题，它是可以被复用的偏好。" : "这次选择已被记录，更多订单会让规则更准确。",
    },
  };
}

export function createLocalRuleSuggestion(candidate: LifeImportCandidate): DefaultRuleSuggestion {
  const historyCount = candidate.historyCount ?? candidate.frequency;
  const merchantCount = candidate.merchantCount ?? historyCount;
  const price = candidate.paidAmount ?? candidate.unitPrice ?? null;
  const merchant = candidate.merchantName || "这家商家";

  if (historyCount >= 3) {
    return {
      id: "repeat-order",
      kind: "repeat-order",
      title: `设为常用选择：${candidate.name}`,
      explanation: `你已经第 ${historyCount} 次选择「${candidate.name}」，可以在相近状态下优先展示它。`,
      evidence: `同一商家、同一菜品已累计 ${historyCount} 次。`,
      rule: `常用选择优先展示${candidate.name}`,
    };
  }

  if (merchantCount >= 3) {
    return {
      id: "frequent-merchant",
      kind: "frequent-merchant",
      title: `加入常用商家：${merchant}`,
      explanation: `你经常选择「${merchant}」，系统可以在合适时优先保留它的选项。`,
      evidence: `该商家已累计出现 ${merchantCount} 次。`,
      rule: `常用商家优先展示${merchant}`,
    };
  }

  if (candidate.category === "饮品") {
    return {
      id: "drink-pattern",
      kind: "drink-pattern",
      title: "为下午保留常点饮品",
      explanation: "这次饮品会被记录；当类似选择积累后，下午可以优先展示常点饮品。",
      evidence: `已记录「${candidate.name}」为饮品选择。`,
      rule: "下午优先展示常点饮品",
    };
  }

  if (price !== null && price < 30) {
    return {
      id: "budget-limit",
      kind: "budget-limit",
      title: "保留 30 元以内的预算偏好",
      explanation: "这笔订单在 30 元以内，系统可以把它作为日常预算的一个温和参考。",
      evidence: `本次实付 ¥${price.toFixed(price % 1 === 0 ? 0 : 1)}。`,
      rule: "日常订单优先参考 30 元以内预算",
    };
  }

  return {
    id: "learning",
    kind: "learning",
    title: "先记录这次选择",
    explanation: "这次选择会被保存，系统将在更多选择后给出更稳定的默认规则。",
    evidence: "当前还没有足够的重复记录。",
    rule: "继续积累真实选择",
  };
}
