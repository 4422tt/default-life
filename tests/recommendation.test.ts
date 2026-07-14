import { describe, expect, it } from "vitest";
import { recommend, scoreOption } from "@/lib/recommendation";
import type { DecisionContext, FoodOption } from "@/lib/types";

const now = new Date("2026-07-13T12:00:00.000Z");

const context: DecisionContext = {
  budget: 2,
  energy: "low",
  weather: "rain",
  companion: "solo",
  intent: "familiar",
  urgency: "rush",
};

function option(patch: Partial<FoodOption> = {}): FoodOption {
  return {
    id: "base",
    poolId: "solo-food",
    name: "测试选项",
    kind: "delivery",
    priceLevel: 2,
    love: 4,
    health: 3,
    etaMinutes: 20,
    weatherTags: ["rain"],
    energyTags: ["low"],
    companionTags: ["solo"],
    active: true,
    craving: false,
    choiceCount: 2,
    preferenceDelta: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("recommendation engine", () => {
  it("filters hidden, cooled down and over-budget options when matches exist", () => {
    const result = recommend(
      [
        option({ id: "good", name: "预算内" }),
        option({ id: "hidden", active: false, love: 5 }),
        option({ id: "cooldown", cooldownUntil: "2026-07-20T00:00:00.000Z", love: 5 }),
        option({ id: "expensive", priceLevel: 3, love: 5 }),
      ],
      context,
      { now },
    );

    expect(result?.ranked.map((item) => item.option.id)).toEqual(["good"]);
    expect(result?.relaxedBudget).toBe(false);
  });

  it("relaxes budget only when no available option fits", () => {
    const result = recommend(
      [option({ id: "expensive", priceLevel: 3 })],
      { ...context, budget: 1 },
      { now },
    );

    expect(result?.primary.option.id).toBe("expensive");
    expect(result?.relaxedBudget).toBe(true);
  });

  it("penalizes an option chosen yesterday", () => {
    const recent = scoreOption(option({ id: "recent", lastChosenAt: "2026-07-12T12:00:00.000Z" }), context, now);
    const old = scoreOption(option({ id: "old", lastChosenAt: "2026-06-01T12:00:00.000Z" }), context, now);

    expect(old.score).toBeGreaterThan(recent.score);
    expect(old.factors.find((factor) => factor.key === "recency")?.contribution).toBe(15);
    expect(recent.factors.find((factor) => factor.key === "recency")?.contribution).toBe(0);
  });

  it("supports deterministic weighted exploration through an injected random source", () => {
    const result = recommend(
      [
        option({ id: "a", name: "A", choiceCount: 0 }),
        option({ id: "b", name: "B", love: 3, choiceCount: 0 }),
      ],
      { ...context, intent: "explore" },
      { now, random: () => 0 },
    );

    expect(result?.primary.option.id).toBe("a");
  });

  it("never repeats an excluded option", () => {
    const result = recommend(
      [option({ id: "a" }), option({ id: "b", love: 3 })],
      context,
      { now, excludeIds: ["a"] },
    );

    expect(result?.primary.option.id).toBe("b");
  });

  it("creates explanations from real score inputs", () => {
    const scored = scoreOption(option({ id: "explained", love: 5, etaMinutes: 15 }), context, now);

    expect(scored.reasons).toContain("这是你明确喜欢的选择");
    expect(scored.reasons.length).toBeLessThanOrEqual(2);
  });
});
