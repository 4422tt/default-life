import { describe, expect, it } from "vitest";
import { formatDishDisplay } from "@/lib/dish-display";

describe("dish display formatting", () => {
  it("keeps the OCR name intact while producing a compact home-card label", () => {
    const result = formatDishDisplay("【健身餐】鸡腿+豆干+卤蛋+加量时");

    expect(result.rawDishName).toBe("【健身餐】鸡腿+豆干+卤蛋+加量时");
    expect(result.displayDishName).toBe("鸡腿豆干卤蛋健身餐");
    expect(result.displayTags).toEqual(["健身餐", "加量"]);
  });

  it("falls back to the original wording when there is no safe cleanup", () => {
    const result = formatDishDisplay("番茄牛腩饭");

    expect(result.displayDishName).toBe("番茄牛腩饭");
    expect(result.displayTags).toEqual([]);
  });
});
