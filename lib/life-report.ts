export type NutritionSignal = "偏低" | "中等" | "偏高";

export interface LifeReportFood {
  name: string;
  calories: string;
  category: string;
}

export interface LifeReport {
  foods: LifeReportFood[];
  totalCalories: string;
  nutritionSummary: {
    protein: NutritionSignal;
    carbohydrate: NutritionSignal;
    fat: NutritionSignal;
  };
  suggestion: string;
}

const FALLBACK_ERROR = "暂时无法分析，请稍后再试。";
const DEFAULT_LIFE_REPORT_ENDPOINT = "https://default-life.vercel.app/api/life-report";
const nutritionSignals = new Set<NutritionSignal>(["偏低", "中等", "偏高"]);

function approximate(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.startsWith("约") ? text : `约 ${text}`;
}

function signal(value: unknown): NutritionSignal {
  return typeof value === "string" && nutritionSignals.has(value as NutritionSignal)
    ? value as NutritionSignal
    : "中等";
}

export function parseLifeReport(value: unknown): LifeReport | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.foods) || typeof payload.suggestion !== "string") return null;

  const foods = payload.foods
    .slice(0, 8)
    .map((food): LifeReportFood | null => {
      if (!food || typeof food !== "object") return null;
      const item = food as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return null;
      return {
        name,
        calories: approximate(item.calories, "约 未知 kcal"),
        category: typeof item.category === "string" && item.category.trim()
          ? item.category.trim()
          : "日常饮食",
      };
    })
    .filter((food): food is LifeReportFood => Boolean(food));

  if (foods.length === 0) return null;
  const summary = payload.nutritionSummary;
  if (!summary || typeof summary !== "object") return null;
  const nutritionSummary = summary as Record<string, unknown>;
  const suggestion = payload.suggestion.trim();
  if (!suggestion) return null;

  return {
    foods,
    totalCalories: approximate(payload.totalCalories, "约 未知 kcal"),
    nutritionSummary: {
      protein: signal(nutritionSummary.protein),
      carbohydrate: signal(nutritionSummary.carbohydrate),
      fat: signal(nutritionSummary.fat),
    },
    suggestion,
  };
}

function getLifeReportEndpoint() {
  const configuredEndpoint = process.env.NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT?.trim();
  if (configuredEndpoint) {
    try {
      return new URL("/api/life-report", configuredEndpoint).toString();
    } catch {
      // Fall through to the current origin for local development.
    }
  }

  if (typeof window !== "undefined") {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? `${window.location.origin}/api/life-report` : DEFAULT_LIFE_REPORT_ENDPOINT;
  }
  return DEFAULT_LIFE_REPORT_ENDPOINT;
}

export async function analyzeLifeReport(input: string): Promise<LifeReport> {
  const trimmedInput = input.trim();
  if (!trimmedInput) throw new Error(FALLBACK_ERROR);

  let response: Response;
  try {
    response = await fetch(getLifeReportEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: trimmedInput }),
    });
  } catch {
    throw new Error(FALLBACK_ERROR);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(FALLBACK_ERROR);
  }

  const report = response.ok ? parseLifeReport(payload) : null;
  if (!report) throw new Error(FALLBACK_ERROR);
  return report;
}
