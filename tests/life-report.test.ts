import { describe, expect, it } from "vitest";
import { parseLifeReport } from "@/lib/life-report";

describe("parseLifeReport", () => {
  it("normalizes non-precise calorie copy and nutrition signals", () => {
    const report = parseLifeReport({
      foods: [{ name: "牛肉饭", calories: "620 kcal", category: "正餐" }],
      totalCalories: "620 kcal",
      nutritionSummary: { protein: "偏低", carbohydrate: "偏高", fat: "中等" },
      suggestion: "今晚可能可以补充一点蔬菜。",
    });

    expect(report).toEqual({
      foods: [{ name: "牛肉饭", calories: "约 620 kcal", category: "正餐" }],
      totalCalories: "约 620 kcal",
      nutritionSummary: { protein: "偏低", carbohydrate: "偏高", fat: "中等" },
      suggestion: "今晚可能可以补充一点蔬菜。",
    });
  });

  it("rejects incomplete provider payloads", () => {
    expect(parseLifeReport({ foods: [], suggestion: "" })).toBeNull();
    expect(parseLifeReport({ foods: [{ name: "牛肉饭" }] })).toBeNull();
  });
});
