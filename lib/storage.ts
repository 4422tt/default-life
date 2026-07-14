import { db } from "@/lib/db";
import { sampleOptions } from "@/lib/seed";
import type {
  AppSettings,
  BackupPayload,
  DecisionContext,
  DecisionRecord,
  FeedbackValue,
  FoodOption,
  LifeImportAnalysis,
  LifeImportCandidate,
  LifeImportRecord,
  RankedOption,
  RecommendationResult,
} from "@/lib/types";

export type FoodOptionInput = Omit<
  FoodOption,
  | "id"
  | "poolId"
  | "active"
  | "craving"
  | "choiceCount"
  | "preferenceDelta"
  | "createdAt"
  | "updatedAt"
  | "lastChosenAt"
  | "cooldownUntil"
  | "isSample"
>;

function createId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function addFoodOption(input: FoodOptionInput) {
  const now = new Date().toISOString();
  const option: FoodOption = {
    ...input,
    id: createId("option"),
    poolId: "solo-food",
    active: true,
    craving: false,
    choiceCount: 0,
    preferenceDelta: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.options.add(option);
  return option;
}

export async function updateFoodOption(id: string, patch: Partial<FoodOption>) {
  await db.options.update(id, {
    ...patch,
    isSample: false,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteFoodOption(id: string) {
  await db.options.delete(id);
}

function normalizedOptionName(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

export async function commitLifeImport(args: {
  source: LifeImportRecord["source"];
  fileCount: number;
  analysis: LifeImportAnalysis;
  candidates: LifeImportCandidate[];
}) {
  const now = new Date().toISOString();
  let addedCount = 0;
  let updatedCount = 0;
  let record!: LifeImportRecord;

  await db.transaction("rw", db.options, db.imports, async () => {
    const existingOptions = await db.options.toArray();

    for (const candidate of args.candidates) {
      const existing = existingOptions.find(
        (option) => normalizedOptionName(option.name) === normalizedOptionName(candidate.name),
      );

      if (existing) {
        await db.options.update(existing.id, {
          name: candidate.name.trim(),
          kind: candidate.kind,
          priceLevel: candidate.priceLevel,
          love: Math.max(existing.love, candidate.love) as FoodOption["love"],
          health: candidate.health,
          etaMinutes: candidate.etaMinutes,
          weatherTags: candidate.weatherTags,
          energyTags: candidate.energyTags,
          companionTags: candidate.companionTags,
          active: true,
          isSample: false,
          choiceCount: Math.max(existing.choiceCount, candidate.frequency),
          updatedAt: now,
        });
        updatedCount += 1;
        continue;
      }

      const option: FoodOption = {
        id: createId("option"),
        poolId: "solo-food",
        name: candidate.name.trim(),
        kind: candidate.kind,
        priceLevel: candidate.priceLevel,
        love: candidate.love,
        health: candidate.health,
        etaMinutes: candidate.etaMinutes,
        weatherTags: candidate.weatherTags,
        energyTags: candidate.energyTags,
        companionTags: candidate.companionTags,
        active: true,
        craving: false,
        choiceCount: candidate.frequency,
        preferenceDelta: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.options.add(option);
      existingOptions.push(option);
      addedCount += 1;
    }

    record = {
      id: createId("import"),
      source: args.source,
      fileCount: args.fileCount,
      candidates: args.candidates,
      profile: args.analysis.profile,
      addedCount,
      updatedCount,
      createdAt: now,
    };
    await db.imports.add(record);
  });

  return record;
}

export async function saveDecision(args: {
  context: DecisionContext;
  result: RecommendationResult;
  selected: RankedOption;
  selectionMode: DecisionRecord["selectionMode"];
  shownIds: string[];
}) {
  const now = new Date().toISOString();
  const record: DecisionRecord = {
    id: createId("decision"),
    context: args.context,
    recommendedId: args.result.primary.option.id,
    recommendedName: args.result.primary.option.name,
    alternativeIds: args.result.alternatives.map((item) => item.option.id),
    shownIds: Array.from(new Set([...args.shownIds, args.result.primary.option.id])),
    selectedId: args.selected.option.id,
    selectedName: args.selected.option.name,
    selectionMode: args.selectionMode,
    scoreSnapshot: args.result.ranked.map((item) => ({
      optionId: item.option.id,
      optionName: item.option.name,
      score: item.score,
      factors: item.factors,
    })),
    createdAt: now,
    completedAt: now,
  };

  await db.transaction("rw", db.decisions, db.options, async () => {
    await db.decisions.add(record);
    const selected = await db.options.get(args.selected.option.id);
    if (selected) {
      await db.options.update(selected.id, {
        choiceCount: selected.choiceCount + 1,
        lastChosenAt: now,
        craving: false,
        updatedAt: now,
      });
    }
  });
  return record;
}

export async function saveFeedback(
  decisionId: string,
  optionId: string,
  feedback: FeedbackValue,
) {
  const option = await db.options.get(optionId);
  const now = new Date();
  const patch: Partial<FoodOption> = {};

  if (option) {
    if (feedback === "great") patch.preferenceDelta = Math.min(3, option.preferenceDelta + 1);
    if (feedback === "avoid") {
      patch.preferenceDelta = Math.max(-3, option.preferenceDelta - 1);
      patch.cooldownUntil = new Date(now.getTime() + 14 * 86_400_000).toISOString();
    }
    patch.updatedAt = now.toISOString();
  }

  await db.transaction("rw", db.decisions, db.options, async () => {
    await db.decisions.update(decisionId, { feedback });
    if (option) await db.options.update(optionId, patch);
  });
}

export async function updateTheme(theme: AppSettings["theme"]) {
  await db.settings.put({ id: "app", theme, weightVersion: 1 });
}

export async function createBackup(): Promise<BackupPayload> {
  const [options, decisions, settings, imports] = await Promise.all([
    db.options.toArray(),
    db.decisions.toArray(),
    db.settings.toArray(),
    db.imports.toArray(),
  ]);
  return {
    format: "default-life-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    options,
    decisions,
    settings,
    imports,
  };
}

export async function downloadBackup() {
  const payload = await createBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `default-life-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<BackupPayload>;
  return (
    payload.format === "default-life-backup" &&
    payload.version === 1 &&
    Array.isArray(payload.options) &&
    Array.isArray(payload.decisions) &&
    Array.isArray(payload.settings)
  );
}

export async function restoreBackup(file: File) {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isBackupPayload(parsed)) {
    throw new Error("这不是有效的预制人生备份文件。");
  }
  await db.transaction("rw", db.options, db.decisions, db.settings, db.imports, async () => {
    await Promise.all([db.options.clear(), db.decisions.clear(), db.settings.clear(), db.imports.clear()]);
    await db.options.bulkAdd(parsed.options);
    await db.decisions.bulkAdd(parsed.decisions);
    await db.settings.bulkAdd(parsed.settings);
    await db.imports.bulkAdd(parsed.imports ?? []);
    if (!(await db.settings.get("app"))) {
      await db.settings.add({ id: "app", theme: "system", weightVersion: 1 });
    }
  });
}

export async function resetToSamples() {
  await db.transaction("rw", db.options, db.decisions, db.settings, db.imports, async () => {
    await Promise.all([db.options.clear(), db.decisions.clear(), db.settings.clear(), db.imports.clear()]);
    await db.options.bulkAdd(sampleOptions.map((option) => ({ ...option })));
    await db.settings.add({ id: "app", theme: "system", weightVersion: 1 });
  });
}
