"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle,
  Database,
  FileImage,
  ForkKnife,
  ImageSquare,
  Info,
  PencilSimple,
  Sparkle,
  Timer,
  UploadSimple,
  Wallet,
  X,
} from "@phosphor-icons/react";
import { OptionDialog } from "@/components/defaults-manager";
import { FoodSprite } from "@/components/game-visuals";
import { analyzeLifeImages } from "@/lib/import-life";
import { commitLifeImport } from "@/lib/storage";
import type {
  LifeImportAnalysis,
  LifeImportCandidate,
  LifeImportRecord,
} from "@/lib/types";

type ImportPhase = "hub" | "upload" | "analyzing" | "results" | "profile";

interface ImportLifeViewProps {
  latestImport?: LifeImportRecord;
  onBack: () => void;
}

const analysisSteps = [
  { title: "读取订单图片", detail: "定位商家、菜品和订单信息" },
  { title: "识别菜品", detail: "合并重复名称并统计选择次数" },
  { title: "生成默认池", detail: "把偏好转换为可编辑规则" },
];

export function ImportLifeView({ latestImport, onBack }: ImportLifeViewProps) {
  const [phase, setPhase] = useState<ImportPhase>("hub");
  const [files, setFiles] = useState<File[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysis, setAnalysis] = useState<LifeImportAnalysis | null>(null);
  const [candidates, setCandidates] = useState<LifeImportCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [recordNotice, setRecordNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedImport, setCompletedImport] = useState<LifeImportRecord | undefined>();
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const recordInputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => {
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [previews]);

  useEffect(() => {
    if (phase !== "analyzing") return;
    const nextAnalysis = analyzeLifeImages(
      files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
    );
    setAnalysisStep(0);

    const timers = [
      window.setTimeout(() => setAnalysisStep(1), 650),
      window.setTimeout(() => setAnalysisStep(2), 1350),
      window.setTimeout(() => {
        setAnalysis(nextAnalysis);
        setCandidates(nextAnalysis.candidates);
        setSelectedIds(nextAnalysis.candidates.map((candidate) => candidate.id));
        setEditMode(false);
        setPhase("results");
      }, 2250),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [files, phase]);

  const addFiles = (incoming: File[]) => {
    const imageFiles = incoming.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== incoming.length) {
      setError("这里只支持图片文件。消费记录请使用上一页的记录入口。 ");
    } else {
      setError("");
    }
    setFiles((current) => {
      const combined = [...current, ...imageFiles];
      const unique = combined.filter(
        (file, index) => combined.findIndex((item) => item.name === file.name && item.size === file.size) === index,
      );
      return unique.slice(0, 12);
    });
  };

  const beginAnalysis = () => {
    if (files.length === 0) {
      setError("请先上传至少一张订单截图。 ");
      return;
    }
    setError("");
    setPhase("analyzing");
  };

  const updateCandidateName = (id: string, name: string) => {
    setCandidates((current) => current.map((candidate) => (
      candidate.id === id ? { ...candidate, name } : candidate
    )));
  };

  const commitCandidates = async (items: LifeImportCandidate[]) => {
    if (!analysis || items.length === 0) {
      setError("至少保留一个要加入默认池的选项。 ");
      return;
    }
    if (items.some((item) => !item.name.trim())) {
      setError("选项名称不能为空。 ");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const record = await commitLifeImport({
        source: "screenshots",
        fileCount: files.length,
        analysis,
        candidates: items.map((item) => ({ ...item, name: item.name.trim() })),
      });
      setCompletedImport(record);
      setPhase("profile");
    } catch {
      setError("导入没有完成，请稍后再试。现有默认池没有被修改。 ");
    } finally {
      setSaving(false);
    }
  };

  const resetImport = () => {
    setFiles([]);
    setAnalysis(null);
    setCandidates([]);
    setSelectedIds([]);
    setCompletedImport(undefined);
    setError("");
    setPhase("hub");
  };

  const profileRecord = completedImport ?? latestImport;

  return (
    <section className="screen-enter mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
      {phase === "hub" && (
        <ImportHub
          latestImport={latestImport}
          recordNotice={recordNotice}
          recordInputRef={recordInputRef}
          onBack={onBack}
          onOpenUpload={() => setPhase("upload")}
          onOpenManual={() => setManualOpen(true)}
          onOpenProfile={() => setPhase("profile")}
          onRecord={(file) => setRecordNotice(`${file.name} 已接收。记录解析适配器已预留，当前演示请先使用截图识别。`)}
        />
      )}

      {phase === "upload" && (
        <UploadView
          previews={previews}
          error={error}
          inputRef={screenshotInputRef}
          onBack={() => setPhase("hub")}
          onFiles={addFiles}
          onRemove={(file) => setFiles((current) => current.filter((item) => item !== file))}
          onAnalyze={beginAnalysis}
        />
      )}

      {phase === "analyzing" && (
        <AnalyzingView
          fileCount={files.length}
          currentStep={analysisStep}
          onCancel={() => setPhase("upload")}
        />
      )}

      {phase === "results" && analysis && (
        <ResultsView
          analysis={analysis}
          candidates={candidates}
          selectedIds={selectedIds}
          editMode={editMode}
          error={error}
          saving={saving}
          onBack={() => setPhase("upload")}
          onEdit={() => setEditMode(true)}
          onCancelEdit={() => {
            setEditMode(false);
            setSelectedIds(candidates.map((candidate) => candidate.id));
          }}
          onNameChange={updateCandidateName}
          onToggle={(id) => setSelectedIds((current) => (
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
          ))}
          onCommitAll={() => commitCandidates(candidates)}
          onCommitSelected={() => commitCandidates(candidates.filter((candidate) => selectedIds.includes(candidate.id)))}
        />
      )}

      {phase === "profile" && profileRecord && (
        <LifeProfileView record={profileRecord} onBack={onBack} onRestart={resetImport} />
      )}

      {manualOpen && <OptionDialog option={null} onClose={() => setManualOpen(false)} />}
    </section>
  );
}

function ImportHub({
  latestImport,
  recordNotice,
  recordInputRef,
  onBack,
  onOpenUpload,
  onOpenManual,
  onOpenProfile,
  onRecord,
}: {
  latestImport?: LifeImportRecord;
  recordNotice: string;
  recordInputRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onOpenUpload: () => void;
  onOpenManual: () => void;
  onOpenProfile: () => void;
  onRecord: (file: File) => void;
}) {
  return (
    <>
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
        <ArrowLeft size={17} /> 返回默认池
      </button>

      <div className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">生活导入中心</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-[-0.05em] md:text-6xl">
          把过去的选择，<br />变成未来的默认值。
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)] md:text-lg">
          上传你的消费记录，AI 将识别你的生活偏好。
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-12">
        <article className="app-surface-raised relative overflow-hidden p-6 md:col-span-7 md:row-span-2 md:p-8">
          <div className="grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--accent)] text-[var(--accent-ink)]">
            <ImageSquare size={28} weight="fill" />
          </div>
          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">上传外卖截图</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)] md:text-base">
            识别美团、饿了么和闪购订单，自动生成你的饮食偏好。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button className="app-button app-button-primary" onClick={onOpenUpload}>
              开始识别 <ArrowRight size={18} weight="bold" />
            </button>
            <span className="text-xs text-[var(--muted)]">支持多图和拖拽上传</span>
          </div>
          <div className="import-orbit" aria-hidden="true"><Sparkle size={20} weight="fill" /></div>
        </article>

        <article className="app-surface p-6 md:col-span-5">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <Database size={21} />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">导入消费记录</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">从历史订单中发现隐藏的生活规律。</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {["美团", "饿了么", "闪购"].map((source) => <span className="option-chip" key={source}>{source}</span>)}
          </div>
          <button className="app-button app-button-secondary mt-5 w-full" onClick={() => recordInputRef.current?.click()}>
            <UploadSimple size={18} /> 上传记录
          </button>
          <input
            ref={recordInputRef}
            className="sr-only"
            type="file"
            accept=".csv,.json,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onRecord(file);
              event.target.value = "";
            }}
          />
        </article>

        <article className="app-soft p-6 md:col-span-5">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--surface-raised)] text-[var(--accent-strong)]">
              <PencilSimple size={21} />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">手动创建规则</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">如果你喜欢完全掌控，也可以自己定义。</p>
            </div>
          </div>
          <button className="app-button app-button-secondary mt-5 w-full" onClick={onOpenManual}>添加选项</button>
        </article>
      </div>

      {recordNotice && (
        <div className="app-soft mt-4 flex items-start gap-3 p-4 text-sm leading-6 text-[var(--muted)]" role="status">
          <Info size={18} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" />
          {recordNotice}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-[var(--muted)]">
          当前使用本地演示识别器，图片不会上传。未来接入 OCR 和大模型后，仍沿用相同的确认流程。
        </p>
        {latestImport && (
          <button className="app-button app-button-quiet shrink-0 text-sm" onClick={onOpenProfile}>
            查看最近画像 <ArrowRight size={16} />
          </button>
        )}
      </div>
    </>
  );
}

function UploadView({
  previews,
  error,
  inputRef,
  onBack,
  onFiles,
  onRemove,
  onAnalyze,
}: {
  previews: Array<{ file: File; url: string }>;
  error: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onFiles: (files: File[]) => void;
  onRemove: (file: File) => void;
  onAnalyze: () => void;
}) {
  return (
    <>
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
        <ArrowLeft size={17} /> 返回
      </button>
      <div className="mt-7 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">上传外卖截图</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)] md:text-base">订单列表、订单详情和支付记录都可以。一次上传多张，识别会更接近真实习惯。</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.72fr]">
        <label
          className="upload-dropzone grid min-h-80 place-items-center p-7 text-center"
          htmlFor="life-screenshots"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <UploadSimple size={30} weight="bold" />
            </div>
            <h2 className="mt-6 text-xl font-semibold">拖拽图片到这里</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">或点击选择图片，最多 12 张</p>
            <span className="app-button app-button-secondary mt-5">选择图片</span>
          </div>
        </label>
        <input
          id="life-screenshots"
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />

        <aside className="app-surface min-h-80 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">已选择 {previews.length} 张</h2>
            {previews.length > 0 && <span className="text-xs text-[var(--muted)]">可继续添加</span>}
          </div>
          {previews.length === 0 ? (
            <div className="grid min-h-60 place-items-center text-center text-sm leading-6 text-[var(--muted)]">
              <div><FileImage size={28} className="mx-auto mb-3" />图片预览会显示在这里</div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
              {previews.map(({ file, url }) => (
                <div key={`${file.name}-${file.size}`} className="group relative aspect-[4/3] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)]">
                  <img src={url} alt={`订单截图 ${file.name}`} className="h-full w-full object-cover" />
                  <button className="app-icon-button absolute right-2 top-2 h-9 w-9" aria-label={`移除 ${file.name}`} onClick={(event) => { event.preventDefault(); onRemove(file); }}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[var(--muted)]">识别过程仅在当前浏览器中模拟，不会读取图片以外的数据。</p>
        <button className="app-button app-button-primary sm:min-w-48" onClick={onAnalyze}>
          {previews.length > 0 ? `分析 ${previews.length} 张截图` : "开始分析"} <Sparkle size={18} weight="fill" />
        </button>
      </div>
    </>
  );
}

function AnalyzingView({ fileCount, currentStep, onCancel }: { fileCount: number; currentStep: number; onCancel: () => void }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-8rem)] max-w-3xl place-items-center py-8">
      <div className="app-surface-raised analysis-panel w-full overflow-hidden p-6 md:p-10" aria-live="polite">
        <div className="flex items-start gap-4">
          <div className="analysis-pulse grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-[var(--accent)] text-[var(--accent-ink)]">
            <Brain size={28} weight="fill" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--accent-strong)]">正在理解你的选择</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] md:text-4xl">从 {fileCount} 张截图中寻找重复模式</h1>
          </div>
        </div>

        <div className="mt-9 space-y-3">
          {analysisSteps.map((step, index) => {
            const state = index < currentStep ? "complete" : index === currentStep ? "active" : "pending";
            return (
              <div className="analysis-step" data-state={state} key={step.title}>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--surface-soft)]">
                  {state === "complete" ? <Check size={17} weight="bold" /> : <span className="text-sm font-semibold tabular-nums">{index + 1}</span>}
                </div>
                <div>
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{step.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button className="app-button app-button-quiet mt-7 text-sm" onClick={onCancel}>取消识别</button>
      </div>
    </div>
  );
}

function ResultsView({
  analysis,
  candidates,
  selectedIds,
  editMode,
  error,
  saving,
  onBack,
  onEdit,
  onCancelEdit,
  onNameChange,
  onToggle,
  onCommitAll,
  onCommitSelected,
}: {
  analysis: LifeImportAnalysis;
  candidates: LifeImportCandidate[];
  selectedIds: string[];
  editMode: boolean;
  error: string;
  saving: boolean;
  onBack: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onNameChange: (id: string, name: string) => void;
  onToggle: (id: string) => void;
  onCommitAll: () => void;
  onCommitSelected: () => void;
}) {
  return (
    <>
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
        <ArrowLeft size={17} /> 重新上传
      </button>
      <div className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">AI 已发现你的生活模式</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">这些选择已经足够形成默认规则</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)] md:text-base">确认名称和次数后再加入。系统不会在你确认前修改默认池。</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="app-surface-raised p-5 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">高频选择</h2>
            <span className="text-xs text-[var(--muted)]">共 {candidates.reduce((sum, item) => sum + item.frequency, 0)} 次</span>
          </div>
          <div className="mt-5 space-y-3">
            {candidates.map((candidate) => {
              const selected = selectedIds.includes(candidate.id);
              return (
                <div className="rounded-[13px] border border-[var(--line)] bg-[var(--surface)] p-4" key={candidate.id}>
                  <div className="flex items-center gap-3">
                    {editMode && (
                      <button className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--accent-strong)]" aria-pressed={selected} aria-label={`${selected ? "取消选择" : "选择"} ${candidate.name}`} onClick={() => onToggle(candidate.id)}>
                        {selected && <Check size={17} weight="bold" />}
                      </button>
                    )}
                    <FoodSprite name={candidate.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      {editMode ? (
                        <label>
                          <span className="sr-only">选项名称</span>
                          <input className="form-input min-h-10 py-2" value={candidate.name} onChange={(event) => onNameChange(candidate.id, event.target.value)} />
                        </label>
                      ) : (
                        <p className="truncate font-semibold">{candidate.name}</p>
                      )}
                      <p className="mt-1 text-xs text-[var(--muted)]">出现 {candidate.frequency} 次</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="app-soft p-5 md:p-6">
            <h2 className="font-semibold">偏好摘要</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4"><dt className="text-[var(--muted)]">口味</dt><dd className="font-semibold">{analysis.profile.taste}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-[var(--muted)]">预算</dt><dd className="font-semibold">{analysis.profile.budgetLabel}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-[var(--muted)]">晚餐节奏</dt><dd className="text-right font-semibold">{analysis.profile.dinnerPattern}</dd></div>
            </dl>
          </section>
          <section className="app-surface p-5">
            <div className="flex items-start gap-3">
              <Info size={19} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" />
              <p className="text-xs leading-5 text-[var(--muted)]">这是本地演示分析。候选结构已经按未来 OCR 和大模型接口设计。</p>
            </div>
          </section>
        </aside>
      </div>

      {error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {editMode ? (
          <>
            <button className="app-button app-button-secondary" onClick={onCancelEdit}>取消编辑</button>
            <button className="app-button app-button-primary" disabled={saving || selectedIds.length === 0} onClick={onCommitSelected}>
              {saving ? "正在加入" : `加入已选择的 ${selectedIds.length} 项`}
            </button>
          </>
        ) : (
          <>
            <button className="app-button app-button-secondary" onClick={onEdit}><PencilSimple size={18} /> 编辑后加入</button>
            <button className="app-button app-button-primary" disabled={saving} onClick={onCommitAll}>
              <CheckCircle size={18} weight="fill" /> {saving ? "正在加入" : "全部加入默认池"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function LifeProfileView({ record, onBack, onRestart }: { record: LifeImportRecord; onBack: () => void; onRestart: () => void }) {
  const profile = record.profile;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
          <ArrowLeft size={17} /> 返回默认池
        </button>
        <span className="option-chip" data-accent="true"><CheckCircle size={14} weight="fill" /> 导入完成</span>
      </div>

      <div className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">我的生活画像</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] md:text-6xl">你的默认人生</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">把重复交给系统，把精力留给重要的事情。</p>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="app-surface-raised p-6 md:p-8">
          <p className="text-sm font-semibold text-[var(--muted)]">过去 {profile.windowDays} 天</p>
          <p className="mt-5 text-6xl font-semibold tracking-[-0.06em] text-[var(--accent-strong)] md:text-8xl tabular-nums">{profile.familiarDinnerShare}%</p>
          <p className="mt-4 max-w-lg text-lg leading-8">的晚餐选择来自熟悉选项。</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {profile.keywords.map((keyword) => <span className="option-chip" data-accent="true" key={keyword}>{keyword}</span>)}
          </div>
        </section>

        <div className="space-y-5">
          <section className="app-surface p-5 md:p-6">
            <h2 className="font-semibold">默认规则</h2>
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-3"><Timer size={20} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" /><div><p className="text-xs text-[var(--muted)]">工作日晚上</p><p className="mt-1 font-semibold">{profile.weekdayRule}</p></div></div>
              <div className="flex items-start gap-3"><Sparkle size={20} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" /><div><p className="text-xs text-[var(--muted)]">周末</p><p className="mt-1 font-semibold">{profile.weekendRule}</p></div></div>
            </div>
          </section>
          <section className="app-soft p-5 md:p-6">
            <Brain size={22} className="text-[var(--accent-strong)]" />
            <p className="mt-4 text-base font-medium leading-7">“{profile.insight}”</p>
          </section>
        </div>
      </div>

      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="app-surface p-4"><Wallet size={19} className="text-[var(--accent-strong)]" /><p className="mt-3 text-xs text-[var(--muted)]">常用预算</p><p className="mt-1 font-semibold">{profile.budgetLabel}</p></div>
        <div className="app-surface p-4"><ForkKnife size={19} className="text-[var(--accent-strong)]" /><p className="mt-3 text-xs text-[var(--muted)]">口味倾向</p><p className="mt-1 font-semibold">{profile.taste}</p></div>
        <div className="app-surface p-4"><Timer size={19} className="text-[var(--accent-strong)]" /><p className="mt-3 text-xs text-[var(--muted)]">晚餐目标</p><p className="mt-1 font-semibold">{profile.dinnerPattern}</p></div>
      </section>

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[var(--muted)]">基于本地演示识别结果生成，接入真实 OCR 后会使用实际订单数据。</p>
        <button className="app-button app-button-secondary" onClick={onRestart}>继续导入</button>
      </div>
    </>
  );
}
