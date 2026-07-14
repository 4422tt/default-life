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
