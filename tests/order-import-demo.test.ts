import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, initializeDatabase } from "@/lib/db";
import {
  calculateOrderHistory,
  createLocalImportAnalysis,
  createLocalRuleSuggestion,
  demoOrders,
  makeOrderCandidate,
  type OrderDraft,
} from "@/lib/order-import-demo";
import { commitLifeImport, saveImportRuleDecision } from "@/lib/storage";

function draftFromDemo(index: number): OrderDraft {
  const order = demoOrders[index];
  return {
    merchantName: order.merchantName,
    dishName: order.dishName,
    price: order.price,
    category: order.category,
    isDemo: true,
  };
}

async function importDraft(draft: OrderDraft) {
  const options = await db.options.toArray();
  const counts = calculateOrderHistory(options, draft);
  const candidate = makeOrderCandidate(draft, counts);
  const suggestion = createLocalRuleSuggestion(candidate);
  return commitLifeImport({
    source: "screenshots",
    fileCount: 0,
    analysis: createLocalImportAnalysis(candidate),
    candidates: [candidate],
    isDemo: true,
    ruleSuggestion: suggestion,
  });
}

describe("stable order import demo", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("keeps three demo orders distinct and marks them as demo data", async () => {
    const records = [];
    for (let index = 0; index < demoOrders.length; index += 1) {
      records.push(await importDraft(draftFromDemo(index)));
    }

    expect(records.map((record) => record.isDemo)).toEqual([true, true, true]);
    expect(records.map((record) => record.candidates[0].name)).toEqual([
      "麦辣鸡腿堡套餐",
      "自选麻辣烫",
      "生椰拿铁",
    ]);
    expect(records.map((record) => record.candidates[0].historyCount)).toEqual([1, 1, 1]);
  });

  it("automatically increments repeat history and persists an accepted rule", async () => {
    await importDraft(draftFromDemo(0));
    await importDraft(draftFromDemo(0));
    const thirdRecord = await importDraft(draftFromDemo(0));
    const candidate = thirdRecord.candidates[0];

    expect(candidate.historyCount).toBe(3);
    expect(candidate.merchantCount).toBe(3);
    expect(candidate.isRepeatOrder).toBe(true);
    expect(thirdRecord.ruleSuggestion?.kind).toBe("repeat-order");

    const accepted = await saveImportRuleDecision(thirdRecord.id, "accepted");
    expect(accepted.ruleDecision).toBe("accepted");

    const savedOption = (await db.options.toArray()).find((option) => option.name === "麦辣鸡腿堡套餐");
    expect(savedOption?.historicalCount).toBe(3);
    expect(savedOption?.preferenceDelta).toBe(1);

    db.close();
    await db.open();
    const restoredRecord = await db.imports.get(thirdRecord.id);
    expect(restoredRecord?.ruleDecision).toBe("accepted");
    expect(restoredRecord?.candidates[0].historyCount).toBe(3);
  });

  it("uses a local fallback suggestion without any AI request", () => {
    const candidate = makeOrderCandidate(draftFromDemo(2), {
      historyCount: 1,
      merchantCount: 1,
      isRepeatOrder: false,
    });
    const suggestion = createLocalRuleSuggestion(candidate);

    expect(suggestion.kind).toBe("drink-pattern");
    expect(suggestion.rule).toContain("饮品");
  });

  it("keeps an order and skips the rule when the user chooses not to set it", async () => {
    const record = await importDraft(draftFromDemo(1));
    const dismissed = await saveImportRuleDecision(record.id, "dismissed");
    const option = (await db.options.toArray()).find((item) => item.name === "自选麻辣烫");

    expect(dismissed.ruleDecision).toBe("dismissed");
    expect(option?.historicalCount).toBe(1);
    expect(option?.preferenceDelta).toBe(0);
  });
});
