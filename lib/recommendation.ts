import type {
  DecisionContext,
  FoodOption,
  RankedOption,
  RecommendationResult,
  ScoreFactor,
} from "@/lib/types";

const DAY = 86_400_000;

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function daysSince(iso: string | undefined, now: Date) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / DAY);
}

function recencyContribution(option: FoodOption, now: Date) {
  const days = daysSince(option.lastChosenAt, now);
  if (!Number.isFinite(days)) return 15;
  if (days < 2) return 0;
  if (days < 7) return 5;
  if (days < 14) return 10;
  return 15;
}

function contextDetails(option: FoodOption, context: DecisionContext) {
  const price = option.priceLevel <= context.budget ? 1 : 0;
  const energy = option.energyTags.includes(context.energy) ? 1 : 0.35;
  const weather = option.weatherTags.includes(context.weather) ? 1 : 0.35;
  const companion = option.companionTags.includes(context.companion) ? 1 : 0.2;
  const urgency = context.urgency === "relaxed" || option.etaMinutes <= 25 ? 1 : 0.2;
  return { price, energy, weather, companion, urgency };
}

function intentContribution(option: FoodOption, context: DecisionContext, recency: number) {
  if (context.intent === "familiar") {
    return option.choiceCount > 0 ? 10 : 5;
  }
  return option.choiceCount === 0 ? 10 : (recency / 15) * 10;
}

function buildReasons(
  option: FoodOption,
  context: DecisionContext,
  now: Date,
  relaxedBudget: boolean,
) {
  const details = contextDetails(option, context);
  const reasons: Array<{ score: number; text: string }> = [];

  if (option.love >= 4) reasons.push({ score: option.love, text: "这是你明确喜欢的选择" });
  if (option.craving) reasons.push({ score: 6, text: "你最近特别想吃它" });
  if (details.energy === 1 && context.energy === "low") {
    reasons.push({ score: 5, text: "现在精力不高，它比较省心" });
  }
  if (details.weather === 1) {
    const text = {
      hot: "天气偏热，它更适合现在",
      cold: "天气偏冷，它会更舒服",
      rain: "下雨时选它更稳妥",
      normal: "它和今天的状态很合拍",
    }[context.weather];
    reasons.push({ score: 4, text });
  }
  if (details.companion === 1 && context.companion === "friends") {
    reasons.push({ score: 4, text: "它适合和朋友一起" });
  }
  if (details.urgency === 1 && context.urgency === "rush") {
    reasons.push({ score: 5, text: `预计 ${option.etaMinutes} 分钟，来得及` });
  }
  const days = daysSince(option.lastChosenAt, now);
  if (!Number.isFinite(days)) reasons.push({ score: 5, text: "你还没有选过它" });
  else if (days >= 14) reasons.push({ score: 5, text: "已经有一阵子没吃了" });
  if (!relaxedBudget && details.price === 1) reasons.push({ score: 3, text: "价格在今天的预算内" });

  return reasons
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((reason) => reason.text);
}

export function scoreOption(
  option: FoodOption,
  context: DecisionContext,
  now = new Date(),
  relaxedBudget = false,
): RankedOption {
  const contextMatches = contextDetails(option, context);
  const recency = recencyContribution(option, now);
  const love = Math.min(35, (option.love / 5) * 32 + (option.craving ? 3 : 0));
  const contextScore =
    (Object.values(contextMatches).reduce((sum, value) => sum + value, 0) / 5) * 25;
  const feedback = ((clamp(option.preferenceDelta, -3, 3) + 3) / 6) * 15;
  const intent = intentContribution(option, context, recency);

  const factors: ScoreFactor[] = [
    { key: "love", label: "喜欢程度", contribution: round(love), max: 35 },
    { key: "context", label: "当下匹配", contribution: round(contextScore), max: 25 },
    { key: "recency", label: "近期变化", contribution: round(recency), max: 15 },
    { key: "feedback", label: "历史反馈", contribution: round(feedback), max: 15 },
    { key: "intent", label: "今天倾向", contribution: round(intent), max: 10 },
  ];

  return {
    option,
    score: round(factors.reduce((sum, factor) => sum + factor.contribution, 0)),
    factors,
    reasons: buildReasons(option, context, now, relaxedBudget),
  };
}

function chooseWeighted(items: RankedOption[], random: () => number) {
  if (items.length === 1) return items[0];
  const floor = Math.min(...items.map((item) => item.score));
  const weights = items.map((item) => Math.max(1, item.score - floor + 4));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;

  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items[items.length - 1];
}

export function recommend(
  options: FoodOption[],
  context: DecisionContext,
  config: { now?: Date; excludeIds?: string[]; random?: () => number } = {},
): RecommendationResult | null {
  const now = config.now ?? new Date();
  const excluded = new Set(config.excludeIds ?? []);
  const available = options.filter((option) => {
    if (!option.active || excluded.has(option.id)) return false;
    return !option.cooldownUntil || new Date(option.cooldownUntil) <= now;
  });

  if (available.length === 0) return null;

  const withinBudget = available.filter((option) => option.priceLevel <= context.budget);
  const relaxedBudget = withinBudget.length === 0;
  const candidates = relaxedBudget ? available : withinBudget;
  const ranked = candidates
    .map((option) => scoreOption(option, context, now, relaxedBudget))
    .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name, "zh-CN"));

  const primary =
    context.intent === "explore"
      ? chooseWeighted(ranked.slice(0, 5), config.random ?? Math.random)
      : ranked[0];
  const alternatives = ranked.filter((item) => item.option.id !== primary.option.id).slice(0, 2);

  return { primary, alternatives, ranked, relaxedBudget };
}
