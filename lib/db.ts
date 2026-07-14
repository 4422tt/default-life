import Dexie, { type Table } from "dexie";
import { sampleOptions } from "@/lib/seed";
import type { AppSettings, DecisionRecord, FoodOption, LifeImportRecord } from "@/lib/types";

export class DefaultLifeDatabase extends Dexie {
  options!: Table<FoodOption, string>;
  decisions!: Table<DecisionRecord, string>;
  settings!: Table<AppSettings, string>;
  imports!: Table<LifeImportRecord, string>;

  constructor() {
    super("default-life");
    this.version(1).stores({
      options: "id, active, updatedAt, lastChosenAt",
      decisions: "id, createdAt, selectedId",
      settings: "id",
    });
    this.version(2).stores({
      options: "id, active, updatedAt, lastChosenAt",
      decisions: "id, createdAt, selectedId",
      settings: "id",
      imports: "id, source, createdAt",
    });
    this.version(3).stores({
      options: "id, active, updatedAt, lastChosenAt",
      decisions: "id, createdAt, selectedId",
      settings: "id",
      imports: "id, source, createdAt",
    }).upgrade(async (transaction) => {
      const importsTable = transaction.table<LifeImportRecord, string>("imports");
      const optionsTable = transaction.table<FoodOption, string>("options");
      const imports = await importsTable.toArray();
      const legacyIds = new Set(["import-beef-rice", "import-ramen", "import-malatang"]);
      const legacyImports = imports.filter((record) => record.candidates.some((candidate) => legacyIds.has(candidate.id)));
      if (legacyImports.length === 0) return;

      await importsTable.bulkDelete(legacyImports.map((record) => record.id));
      const legacyFrequencies = new Map<string, number>();
      legacyImports.forEach((record) => record.candidates.forEach((candidate) => {
        legacyFrequencies.set(candidate.name, candidate.frequency);
      }));
      const options = await optionsTable.toArray();
      for (const sample of sampleOptions) {
        const polluted = options.find((option) => (
          option.name === sample.name &&
          !option.source &&
          option.isSample === false &&
          option.choiceCount === legacyFrequencies.get(option.name)
        ));
        if (polluted) await optionsTable.put({ ...sample, id: polluted.id });
      }
    });
  }
}

export const db = new DefaultLifeDatabase();

export async function initializeDatabase() {
  await db.transaction("rw", db.options, db.settings, async () => {
    if ((await db.options.count()) === 0) {
      await db.options.bulkAdd(sampleOptions);
    }

    if (!(await db.settings.get("app"))) {
      await db.settings.add({ id: "app", theme: "light", weightVersion: 1 });
    }
  });
}
