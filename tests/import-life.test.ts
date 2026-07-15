import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, initializeDatabase } from "@/lib/db";
import { createLifeImportAnalysis } from "@/lib/import-life";
import { normalizeOrderImportResult, normalizeOrderText } from "@/lib/order-normalization";
import { analyzeOrderScreenshots } from "@/lib/order-recognition";
import { commitLifeImport } from "@/lib/storage";

describe("real order import workflow", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
  });

  afterEach(async () => {
    delete process.env.NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT;
    vi.unstubAllGlobals();
    await db.delete();
  });

  it("normalizes real recognized orders without injecting sample dishes", () => {
    const result = normalizeOrderImportResult([
      { id: "1", merchantName: "越富南洋·越南粉 黄龙万科店", dishName: "Rich 火车头", quantity: 1, unitPrice: 24, paidAmount: 26, category: "越南粉", confidence: 0.96, sourceImageId: "image-1" },
      { id: "2", merchantName: "樟荣沙县小吃 桃源街店", dishName: "健身餐鸡腿 + 豆干 + 2个半卤蛋", quantity: 1, unitPrice: 9.1, paidAmount: 9.1, category: "简餐", confidence: 0.91, sourceImageId: "image-1" },
      { id: "3", merchantName: "袁记云饺 半山店", dishName: "鲜虾蟹籽云吞面", quantity: 1, unitPrice: 24.98, paidAmount: 26.98, category: "云吞面", confidence: 0.94, sourceImageId: "image-1" },
    ]);
    const analysis = createLifeImportAnalysis(result);

    expect(result.totalOrders).toBe(3);
    expect(result.preferenceSummary.averagePaidAmount).toBe(20.69);
    expect(analysis.candidates.map((candidate) => candidate.frequency)).toEqual([1, 1, 1]);
    expect(analysis.candidates.map((candidate) => candidate.name)).toEqual([
      "Rich 火车头",
      "健身餐鸡腿 + 豆干 + 2个半卤蛋",
      "鲜虾蟹籽云吞面",
    ]);
    expect(JSON.stringify(analysis)).not.toContain("番茄牛腩饭");
  });

  it("does not return fake results when recognition is not configured", async () => {
    const file = new File(["order"], "order.png", { type: "image/png" });
    await expect(analyzeOrderScreenshots([file])).rejects.toMatchObject({
      code: "SERVICE_NOT_CONFIGURED",
    });
  });

  it("maps the configured vision response into a real imported order", async () => {
    process.env.NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT = "https://recognition.example.test/api/recognize-order";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      foodName: "鲜虾蟹籽云吞面",
      category: "云吞面",
      confidence: 0.94,
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const file = new File(["order"], "order.png", { type: "image/png" });
    const result = await analyzeOrderScreenshots([file]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].dishName).toBe("鲜虾蟹籽云吞面");
    expect(result.items[0].category).toBe("云吞面");
    expect(result.items[0].sourceFileName).toBe("order.png");
    expect(JSON.stringify(result)).not.toContain("番茄牛腩饭");
  });

  it("merges only the same normalized merchant and dish", async () => {
    const result = normalizeOrderImportResult([
      { id: "1", merchantName: "真实店铺 A", dishName: "招牌饭", quantity: 1, paidAmount: 25, confidence: 0.95, sourceImageId: "image-1" },
      { id: "2", merchantName: "真实店铺 A ", dishName: "招牌饭。", quantity: 1, paidAmount: 25, confidence: 0.95, sourceImageId: "image-2" },
      { id: "3", merchantName: "真实店铺 B", dishName: "招牌饭", quantity: 1, paidAmount: 30, confidence: 0.95, sourceImageId: "image-3" },
    ]);
    const analysis = createLifeImportAnalysis(result);
    expect(analysis.candidates).toHaveLength(2);
    expect(analysis.candidates.map((candidate) => candidate.frequency).sort()).toEqual([1, 2]);
    expect(normalizeOrderText(" 招牌饭。 ")).toBe("招牌饭");

    const record = await commitLifeImport({ source: "screenshots", fileCount: 3, analysis, candidates: analysis.candidates });
    const imported = (await db.options.toArray()).filter((option) => option.source === "screenshot-import");
    expect(record.addedCount).toBe(2);
    expect(imported).toHaveLength(2);
    expect(imported.map((option) => option.historicalCount).sort()).toEqual([1, 2]);
  });
});
