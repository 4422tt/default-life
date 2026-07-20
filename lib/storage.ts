import { db } from "@/lib/db";
import { normalizeOrderText } from "@/lib/order-normalization";
import { sampleOptions } from "@/lib/seed";
import type {
  AppSettings,
  BackupPayload,
  DecisionContext,
  DecisionRecord,
  FeedbackValue,
  FoodOption,
  DefaultRuleDecision,
  DefaultRuleSuggestion,
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

function normalizedOptionKey(name: string, merchantName?: string | null) {
  return `${normalizeOrderText(merchantName ?? "未识别商家")}::${normalizeOrderText(name)}`;
}

export async function commitLifeImport(args: {
  source: LifeImportRecord["source"];
  fileCount: number;
  analysis: LifeImportAnalysis;
  candidates: LifeImportCandidate[];
  isDemo?: boolean;
  ruleSuggestion?: DefaultRuleSuggestion;
}) {
  const now = new Date().toISOString();
  const optionSource = args.source === "screenshots" ? "screenshot-import" : "manual";
  let addedCount = 0;
  let updatedCount = 0;
  let record!: LifeImportRecord;

  await db.transaction("rw", db.options, db.imports, async () => {
    const existingOptions = await db.options.toArray();

    const committedCandidates: LifeImportCandidate[] = [];

    for (const candidate of args.candidates) {
      const existing = existingOptions.find(
        (option) => normalizedOptionKey(option.name, option.merchantName) === normalizedOptionKey(candidate.name, candidate.merchantName),
      );
      const increment = Math.max(1, candidate.importIncrement ?? candidate.frequency);
      const merchantHistory = existingOptions
        .filter((option) => normalizeOrderText(option.merchantName ?? "") === normalizeOrderText(candidate.merchantName ?? ""))
        .reduce((sum, option) => sum + (option.historicalCount ?? option.choiceCount), 0);
      const historyBefore = existing ? (existing.historicalCount ?? existing.choiceCount) : 0;
      const committedCandidate: LifeImportCandidate = {
        ...candidate,
        historyCount: candidate.historyCount ?? historyBefore + increment,
        merchantCount: candidate.merchantCount ?? merchantHistory + increment,
        isRepeatOrder: candidate.isRepeatOrder ?? historyBefore > 0,
      };

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
          choiceCount: existing.choiceCount + increment,
          merchantName: candidate.merchantName ?? null,
          historicalCount: (existing.historicalCount ?? existing.choiceCount) + increment,
          price: candidate.paidAmount ?? candidate.unitPrice ?? existing.price ?? null,
          category: candidate.category ?? existing.category ?? null,
          source: optionSource,
          importedAt: now,
          updatedAt: now,
        });
        Object.assign(existing, {
          choiceCount: existing.choiceCount + increment,
          historicalCount: (existing.historicalCount ?? existing.choiceCount) + increment,
        });
        committedCandidates.push(committedCandidate);
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
        choiceCount: increment,
        preferenceDelta: 0,
        merchantName: candidate.merchantName ?? null,
        historicalCount: committedCandidate.historyCount,
        price: candidate.paidAmount ?? candidate.unitPrice ?? null,
        category: candidate.category ?? null,
        source: optionSource,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await db.options.add(option);
      existingOptions.push(option);
      committedCandidates.push(committedCandidate);
      addedCount += 1;
    }

    record = {
      id: createId("import"),
      source: args.source,
      fileCount: args.fileCount,
      candidates: committedCandidates,
      profile: args.analysis.profile,
      addedCount,
      updatedCount,
      createdAt: now,
      isDemo: args.isDemo,
      ruleSuggestion: args.ruleSuggestion,
      ruleDecision: args.ruleSuggestion ? "pending" : undefined,
    };
    await db.imports.add(record);
  });

  return record;
}

export async function saveImportRuleDecision(recordId: string, decision: Exclude<DefaultRuleDecision, "pending">) {
  let updated!: LifeImportRecord;
  await db.transaction("rw", db.imports, db.options, async () => {
    const record = await db.imports.get(recordId);
    if (!record) throw new Error("导入记录不存在");

    const next: LifeImportRecord = { ...record, ruleDecision: decision };
    await db.imports.put(next);

    if (decision === "accepted" && record.ruleSuggestion?.kind === "repeat-order") {
      const candidate = record.candidates[0];
      if (candidate) {
        const option = (await db.options.toArray()).find((item) => (
          normalizedOptionKey(item.name, item.merchantName) === normalizedOptionKey(candidate.name, candidate.merchantName)
        ));
        if (option) {
          await db.options.update(option.id, {
            preferenceDelta: Math.max(option.preferenceDelta, 1),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
    updated = next;
  });
  return updated;
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
  const current = await db.settings.get("app");
  await db.settings.put({ id: "app", weightVersion: 1, ...current, theme });
}

export async function updateTodayContext(todayContext: DecisionContext) {
  const current = await db.settings.get("app");
  await db.settings.put({ id: "app", theme: "system", weightVersion: 1, ...current, todayContext });
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
