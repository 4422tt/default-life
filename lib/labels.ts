import type {
  Companion,
  DecisionContext,
  Energy,
  FeedbackValue,
  FoodKind,
  Intent,
  PriceLevel,
  Urgency,
  Weather,
} from "@/lib/types";

export const priceLabels: Record<PriceLevel, string> = {
  1: "低预算",
  2: "中预算",
  3: "高预算",
};

export const energyLabels: Record<Energy, string> = {
  low: "低能量",
  normal: "正常",
  high: "状态好",
};

export const weatherLabels: Record<Weather, string> = {
  hot: "偏热",
  cold: "偏冷",
  rain: "下雨",
  normal: "普通",
};

export const companionLabels: Record<Companion, string> = {
  solo: "一个人",
  friends: "和朋友",
};

export const intentLabels: Record<Intent, string> = {
  familiar: "吃熟悉的",
  explore: "换换口味",
};

export const urgencyLabels: Record<Urgency, string> = {
  rush: "赶时间",
  relaxed: "不赶时间",
};

export const kindLabels: Record<FoodKind, string> = {
  delivery: "外卖",
  restaurant: "餐厅",
  food: "食物",
};

export const feedbackLabels: Record<FeedbackValue, string> = {
  great: "很准",
  okay: "还行",
  avoid: "暂时别推荐",
};

export function contextLabels(context: DecisionContext) {
  return [
    priceLabels[context.budget],
    energyLabels[context.energy],
    weatherLabels[context.weather],
    companionLabels[context.companion],
    intentLabels[context.intent],
    urgencyLabels[context.urgency],
  ];
}

export function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
