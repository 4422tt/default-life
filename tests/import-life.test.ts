import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, initializeDatabase } from "@/lib/db";
import { analyzeLifeImages } from "@/lib/import-life";
import { commitLifeImport } from "@/lib/storage";

describe("life import workflow", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("creates deterministic candidates from multiple screenshots", () => {
    const analysis = analyzeLifeImages([
      { name: "order-1.png", size: 10, type: "image/png" },
      { name: "order-2.png", size: 12, type: "image/png" },
      { name: "order-3.png", size: 14, type: "image/png" },
    ]);

    expect(analysis.candidates.map((candidate) => candidate.frequency)).toEqual([12, 8, 6]);
    expect(analysis.profile.familiarDinnerShare).toBe(68);
    expect(analysis.profile.keywords).toContain("低决策成本");
  });

  it("merges imported patterns into matching defaults without duplicates", async () => {
    const analysis = analyzeLifeImages([
      { name: "order-1.png", size: 10, type: "image/png" },
      { name: "order-2.png", size: 12, type: "image/png" },
      { name: "order-3.png", size: 14, type: "image/png" },
    ]);

    const record = await commitLifeImport({
      source: "screenshots",
      fileCount: 3,
      analysis,
      candidates: analysis.candidates,
    });
    const options = await db.options.toArray();
    const beefRice = options.find((option) => option.name === "番茄牛腩饭");

    expect(options).toHaveLength(6);
    expect(record.addedCount).toBe(0);
    expect(record.updatedCount).toBe(3);
    expect(beefRice?.choiceCount).toBe(12);
    expect(beefRice?.isSample).toBe(false);
    expect(await db.imports.count()).toBe(1);
  });
});
