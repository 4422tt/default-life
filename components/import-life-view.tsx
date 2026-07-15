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
  ImageSquare,
  Info,
  PencilSimple,
  Sparkle,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { FoodSprite } from "@/components/game-visuals";
import { createLifeImportAnalysis } from "@/lib/import-life";
import { analyzeLifeRule, analyzeOrderScreenshots } from "@/lib/order-recognition";
import { commitLifeImport } from "@/lib/storage";
import type { LifeImportAnalysis, LifeImportCandidate, LifeImportRecord } from "@/lib/types";
import { OrderRecognitionError, type OrderImportResult } from "@/types/order-import";

type ImportPhase = "hub" | "upload" | "analyzing" | "results" | "error" | "profile";

interface ImportLifeViewProps {
  latestImport?: LifeImportRecord;
  onBack: () => void;
}

const analysisSteps = [
  { title: "正在读取截图", detail: "保留你选择的真实订单图片" },
  { title: "正在建立选择线索", detail: "如有需要，补充订单名称" },
  { title: "正在整理你的默认值", detail: "合并重复项目并生成可编辑结果" },
];

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const recognitionConfigured = Boolean(process.env.NEXT_PUBLIC_ORDER_RECOGNITION_ENDPOINT?.trim());

export function ImportLifeView({ latestImport, onBack }: ImportLifeViewProps) {
  const [phase, setPhase] = useState<ImportPhase>("hub");
  const [files, setFiles] = useState<File[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysis, setAnalysis] = useState<LifeImportAnalysis | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<OrderImportResult | null>(null);
  const [candidates, setCandidates] = useState<LifeImportCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [completedImport, setCompletedImport] = useState<LifeImportRecord | undefined>();
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  const addFiles = (incoming: File[]) => {
    let nextError = "";
    const valid = incoming.filter((file) => {
      if (!allowedTypes.has(file.type)) {
        nextError = "这里只支持 JPG、JPEG、PNG 和 WEBP 图片。";
        return false;
      }
      if (file.size > 3 * 1024 * 1024) {
        nextError = `${file.name} 超过 3MB，请压缩后重试。`;
        return false;
      }
      return true;
    });
    setError(nextError);
    setFiles((current) => {
      const combined = [...current, ...valid];
      return combined
        .filter((file, index) => combined.findIndex((item) => item.name === file.name && item.size === file.size) === index)
        .slice(0, 12);
    });
  };

  const beginAnalysis = async () => {
    if (files.length === 0) {
      setError("请先上传至少一张订单截图。");
      return;
    }
    setError("");
    setAnalysisStep(0);
    setPhase("analyzing");
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      setAnalysisStep(1);
      const result = await analyzeOrderScreenshots(files);
      setAnalysisStep(2);
      const nextAnalysis = createLifeImportAnalysis(result);
      setRecognitionResult(result);
      setAnalysis(nextAnalysis);
      setCandidates(nextAnalysis.candidates);
      setSelectedIds(nextAnalysis.candidates.filter((candidate) => (candidate.confidence ?? 0) >= 0.5).map((candidate) => candidate.id));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      setPhase("results");
    } catch (cause) {
      if (cause instanceof OrderRecognitionError && cause.code === "MANUAL_ENTRY_REQUIRED") {
        setError(cause.message);
        setManualOpen(true);
        setPhase("upload");
      } else {
        setError(cause instanceof OrderRecognitionError ? cause.message : "AI服务暂时不可用，请稍后重试。");
        setPhase("error");
      }
    }
  };

  const updateCandidate = (id: string, patch: Partial<LifeImportCandidate>) => {
    setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate));
  };

  const deleteCandidate = (id: string) => {
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
  };

  const commitCandidates = async (items: LifeImportCandidate[]) => {
    if (!analysis || items.length === 0) {
      setError("至少保留一个要加入默认池的选项。");
      return;
    }
    if (items.some((item) => !item.name.trim())) {
      setError("菜品名称不能为空。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const record = await commitLifeImport({
        source: "screenshots",
        fileCount: files.length,
        analysis: { ...analysis, candidates: items },
        candidates: items.map((item) => ({ ...item, name: item.name.trim(), merchantName: item.merchantName?.trim() || null })),
      });
      setCompletedImport(record);
      setPhase("profile");
    } catch {
      setError("导入没有完成，请稍后重试。现有默认池没有被修改。");
    } finally {
      setSaving(false);
    }
  };

  const resetImport = () => {
    setFiles([]);
    setAnalysis(null);
    setRecognitionResult(null);
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
          onBack={onBack}
          onOpenUpload={() => setPhase("upload")}
          onOpenManual={() => setManualOpen(true)}
          onOpenProfile={() => setPhase("profile")}
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
      {phase === "analyzing" && <AnalyzingView fileCount={files.length} currentStep={analysisStep} onCancel={() => setPhase("upload")} />}
      {phase === "error" && (
        <RecognitionErrorView
          message={error}
          onRetry={() => setPhase("upload")}
          onBack={() => setPhase("hub")}
          onManual={() => setManualOpen(true)}
        />
      )}
      {phase === "results" && analysis && recognitionResult && (
        <ResultsView
          analysis={analysis}
          result={recognitionResult}
          candidates={candidates}
          selectedIds={selectedIds}
          error={error}
          saving={saving}
          onBack={() => setPhase("upload")}
          onUpdate={updateCandidate}
          onDelete={deleteCandidate}
          onToggle={(id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
          onCommitAll={() => commitCandidates(candidates)}
          onCommitSelected={() => commitCandidates(candidates.filter((candidate) => selectedIds.includes(candidate.id)))}
        />
      )}
      {phase === "profile" && profileRecord && <LifeProfileView record={profileRecord} onBack={onBack} onRestart={resetImport} />}
      {manualOpen && <ManualOrderDialog onClose={() => setManualOpen(false)} onSaved={() => { setManualOpen(false); resetImport(); }} />}
    </section>
  );
}

function ImportHub({ latestImport, onBack, onOpenUpload, onOpenManual, onOpenProfile }: {
  latestImport?: LifeImportRecord;
  onBack: () => void;
  onOpenUpload: () => void;
  onOpenManual: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <>
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 返回默认池</button>
      <div className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">生活导入中心</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-[-0.05em] md:text-6xl">把过去的选择，<br />变成未来的默认值。</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)] md:text-lg">上传过去的订单截图，再补充订单名称。系统会把真实选择沉淀为默认规则。</p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-12">
        <article className="app-surface-raised relative overflow-hidden p-6 md:col-span-7 md:row-span-2 md:p-8">
          <div className="grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--accent)] text-[var(--accent-ink)]"><ImageSquare size={28} weight="fill" /></div>
          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">导入外卖截图</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)] md:text-base">把过去的选择带进来，补充名称后让系统建立可复用的默认规则。</p>
          <button className="app-button app-button-primary mt-8" onClick={onOpenUpload}>开始导入 <ArrowRight size={18} weight="bold" /></button>
        </article>
        <article className="app-surface p-6 md:col-span-5">
          <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Database size={21} /></div><div><h2 className="text-xl font-semibold tracking-[-0.02em]">生活规则服务</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{recognitionConfigured ? "已配置 DeepSeek 默认规则分析。" : "当前未配置 AI 服务。"}</p></div></div>
          {!recognitionConfigured && <p className="mt-4 rounded-[10px] bg-[var(--surface-soft)] p-3 text-xs leading-5 text-[var(--muted)]">上传后不会返回示例结果。请配置服务，或使用手动添加。</p>}
        </article>
        <article className="app-soft p-6 md:col-span-5">
          <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--surface-raised)] text-[var(--accent-strong)]"><PencilSimple size={21} /></div><div><h2 className="text-xl font-semibold tracking-[-0.02em]">手动添加订单</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">识别不可用时，仍然可以录入真实商家和菜品。</p></div></div>
          <button className="app-button app-button-secondary mt-5 w-full" onClick={onOpenManual}>手动添加订单</button>
        </article>
      </div>
      {latestImport && <button className="app-button app-button-quiet mt-6 text-sm" onClick={onOpenProfile}>查看最近一次真实导入 <ArrowRight size={16} /></button>}
    </>
  );
}

function UploadView({ previews, error, inputRef, onBack, onFiles, onRemove, onAnalyze }: {
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
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 返回</button>
      <div className="mt-7 max-w-2xl"><h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">导入外卖截图</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)] md:text-base">支持 JPG、PNG、WEBP，多图上传，单张不超过 3MB。稍后补充订单名称，系统会生成默认规则。</p></div>
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.72fr]">
        <label className="upload-dropzone grid min-h-80 place-items-center p-7 text-center" htmlFor="life-screenshots" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files)); }}>
          <div><div className="mx-auto grid h-16 w-16 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><UploadSimple size={30} weight="bold" /></div><h2 className="mt-6 text-xl font-semibold">拖拽图片到这里</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">或点击选择图片，最多 12 张</p><span className="app-button app-button-secondary mt-5">选择图片</span></div>
        </label>
        <input id="life-screenshots" ref={inputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <aside className="app-surface min-h-80 p-5">
          <h2 className="font-semibold">已选择 {previews.length} 张</h2>
          {previews.length === 0 ? <div className="grid min-h-60 place-items-center text-center text-sm leading-6 text-[var(--muted)]"><div><FileImage size={28} className="mx-auto mb-3" />图片预览会显示在这里</div></div> : <div className="mt-4 grid grid-cols-2 gap-3">{previews.map(({ file, url }) => <div key={`${file.name}-${file.size}`} className="group relative aspect-[4/3] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)]"><img src={url} alt={`订单截图 ${file.name}`} className="h-full w-full object-cover" /><button className="app-icon-button absolute right-2 top-2 h-9 w-9" aria-label={`移除 ${file.name}`} onClick={(event) => { event.preventDefault(); onRemove(file); }}><X size={15} /></button></div>)}</div>}
        </aside>
      </div>
      {error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-[var(--muted)]">系统不会生成随机菜名；截图导入后会要求你确认真实订单名称。</p><button className="app-button app-button-primary sm:min-w-48" onClick={onAnalyze}>继续导入 {previews.length || ""} 张截图 <Sparkle size={18} weight="fill" /></button></div>
    </>
  );
}

function AnalyzingView({ fileCount, currentStep, onCancel }: { fileCount: number; currentStep: number; onCancel: () => void }) {
  return <div className="mx-auto grid min-h-[calc(100dvh-8rem)] max-w-3xl place-items-center py-8"><div className="app-surface-raised analysis-panel w-full p-6 md:p-10" aria-live="polite"><div className="flex items-start gap-4"><div className="analysis-pulse grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-[var(--accent)] text-[var(--accent-ink)]"><Brain size={28} weight="fill" /></div><div><p className="text-sm font-semibold text-[var(--accent-strong)]">正在理解真实订单</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] md:text-4xl">处理 {fileCount} 张截图</h1></div></div><div className="mt-9 space-y-3">{analysisSteps.map((step, index) => { const state = index < currentStep ? "complete" : index === currentStep ? "active" : "pending"; return <div className="analysis-step" data-state={state} key={step.title}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--surface-soft)]">{state === "complete" ? <Check size={17} weight="bold" /> : <span className="text-sm font-semibold tabular-nums">{index + 1}</span>}</div><div><p className="text-sm font-semibold">{step.title}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{step.detail}</p></div></div>; })}</div><button className="app-button app-button-quiet mt-7 text-sm" onClick={onCancel}>取消识别</button></div></div>;
}

function RecognitionErrorView({ message, onRetry, onBack, onManual }: { message: string; onRetry: () => void; onBack: () => void; onManual: () => void }) {
  return <div className="mx-auto max-w-2xl py-10"><button className="app-button app-button-quiet -ml-3" onClick={onBack}><ArrowLeft size={17} /> 返回导入中心</button><section className="app-surface-raised mt-8 p-6 md:p-9"><WarningCircle size={34} className="text-[var(--danger)]" /><h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">订单没有被导入</h1><p className="mt-4 text-sm leading-7 text-[var(--muted)]">{message}</p><p className="mt-3 text-xs leading-5 text-[var(--muted)]">系统没有生成任何示例数据，默认池也没有被修改。</p><div className="mt-7 flex flex-wrap gap-3"><button className="app-button app-button-primary" onClick={onRetry}>重新上传</button><button className="app-button app-button-secondary" onClick={onManual}>手动添加订单</button></div></section></div>;
}

function ResultsView({ analysis, result, candidates, selectedIds, error, saving, onBack, onUpdate, onDelete, onToggle, onCommitAll, onCommitSelected }: {
  analysis: LifeImportAnalysis;
  result: OrderImportResult;
  candidates: LifeImportCandidate[];
  selectedIds: string[];
  error: string;
  saving: boolean;
  onBack: () => void;
  onUpdate: (id: string, patch: Partial<LifeImportCandidate>) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onCommitAll: () => void;
  onCommitSelected: () => void;
}) {
  return <><button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 重新上传</button><div className="mt-7 max-w-3xl"><p className="text-sm font-semibold text-[var(--accent-strong)]">识别完成，共发现 {result.totalOrders} 笔订单</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">这些选择已经足够形成默认规则</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)] md:text-base">确认名称和次数后再加入。系统不会在你确认前修改默认池。</p></div><div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_0.65fr]"><section className="app-surface-raised p-5 md:p-7"><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">真实识别结果</h2><span className="text-xs text-[var(--muted)]">{candidates.length} 个项目</span></div><div className="mt-5 space-y-4">{candidates.map((candidate) => { const selected = selectedIds.includes(candidate.id); const low = (candidate.confidence ?? 0) < 0.75; return <article className="rounded-[13px] border border-[var(--line)] bg-[var(--surface)] p-4" key={candidate.id}><div className="flex items-start gap-3"><button className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--accent-strong)]" aria-pressed={selected} aria-label={`${selected ? "取消选择" : "选择"} ${candidate.name}`} onClick={() => onToggle(candidate.id)}>{selected && <Check size={17} weight="bold" />}</button><FoodSprite name={candidate.name} size="sm" /><div className="min-w-0 flex-1"><div className="grid gap-3 sm:grid-cols-2"><Field label="商家名称" value={candidate.merchantName ?? ""} onChange={(value) => onUpdate(candidate.id, { merchantName: value || null })} /><Field label="菜品名称" value={candidate.name} onChange={(value) => onUpdate(candidate.id, { name: value })} /><Field label="出现次数" type="number" value={String(candidate.frequency)} onChange={(value) => onUpdate(candidate.id, { frequency: Math.max(1, Number(value) || 1) })} /><Field label="单价" type="number" value={candidate.unitPrice?.toString() ?? ""} onChange={(value) => onUpdate(candidate.id, { unitPrice: value ? Number(value) : null })} /><Field label="实付金额" type="number" value={candidate.paidAmount?.toString() ?? ""} onChange={(value) => onUpdate(candidate.id, { paidAmount: value ? Number(value) : null })} /><Field label="分类" value={candidate.category ?? ""} onChange={(value) => onUpdate(candidate.id, { category: value || null })} /></div>{low && <p className="mt-3 rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">这条内容识别得不太确定，请确认。置信度 {Math.round((candidate.confidence ?? 0) * 100)}%</p>}</div><button className="app-icon-button h-9 w-9 shrink-0" aria-label={`删除 ${candidate.name}`} onClick={() => onDelete(candidate.id)}><Trash size={16} /></button></div></article>; })}{candidates.length === 0 && <p className="py-10 text-center text-sm text-[var(--muted)]">所有识别项都已删除。请重新上传或手动添加。</p>}</div></section><aside className="space-y-5"><section className="app-soft p-5 md:p-6"><h2 className="font-semibold">偏好摘要</h2><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">预算</dt><dd className="font-semibold">{result.preferenceSummary.budgetLevel}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">平均实付</dt><dd className="font-semibold">{result.preferenceSummary.averagePaidAmount == null ? "未知" : `¥${result.preferenceSummary.averagePaidAmount}`}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">口味</dt><dd className="text-right font-semibold">{result.preferenceSummary.flavors.length ? result.preferenceSummary.flavors.join("、") : "暂无足够数据"}</dd></div></dl></section>{result.warnings.length > 0 && <section className="app-surface p-5"><div className="flex items-start gap-3"><Info size={19} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" /><div><p className="text-sm font-semibold">需要确认</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{result.warnings.length} 条识别提示已标记在结果中。</p></div></div></section>}</aside></div>{error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="app-button app-button-secondary" disabled={saving || selectedIds.length === 0} onClick={onCommitSelected}>加入已选择的 {selectedIds.length} 项</button><button className="app-button app-button-primary" disabled={saving || candidates.length === 0} onClick={onCommitAll}><CheckCircle size={18} weight="fill" /> {saving ? "正在加入" : "全部加入默认池"}</button></div></>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" }) {
  return <label className="text-xs text-[var(--muted)]"><span>{label}</span><input className="form-input mt-1 min-h-10 py-2 text-sm text-[var(--ink)]" type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function LifeProfileView({ record, onBack, onRestart }: { record: LifeImportRecord; onBack: () => void; onRestart: () => void }) {
  return <><div className="flex flex-wrap items-center justify-between gap-3"><button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 返回默认池</button><span className="option-chip" data-accent="true"><CheckCircle size={14} weight="fill" /> 导入完成</span></div><div className="mt-7 max-w-3xl"><p className="text-sm font-semibold text-[var(--accent-strong)]">本次真实订单画像</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] md:text-6xl">你的默认人生</h1><p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">已加入 {record.addedCount} 个新项目，更新 {record.updatedCount} 个已有项目。</p></div><section className="app-surface-raised mt-9 p-6 md:p-8"><h2 className="text-xl font-semibold">已确认的订单选择</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{record.candidates.map((candidate) => <div className="rounded-[12px] border border-[var(--line)] p-4" key={candidate.id}><p className="text-xs text-[var(--muted)]">{candidate.merchantName || "未识别商家"}</p><p className="mt-1 font-semibold">{candidate.name}</p><p className="mt-2 text-xs text-[var(--muted)]">历史出现 {candidate.frequency} 次 · 来自截图导入</p></div>)}</div></section><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-[var(--muted)]">画像只基于你确认的订单，不包含演示数据。</p><button className="app-button app-button-secondary" onClick={onRestart}>继续导入</button></div></>;
}

function ManualOrderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [merchantName, setMerchantName] = useState("");
  const [dishName, setDishName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState("1");
  const [error, setError] = useState("");
  const [analyzingRule, setAnalyzingRule] = useState(false);
  const save = async () => {
    if (!dishName.trim()) { setError("请填写菜品名称。"); return; }
    setAnalyzingRule(true);
    setError("");
    try {
      const description = [
        `订单名称：${dishName.trim()}`,
        merchantName.trim() ? `商家：${merchantName.trim()}` : "",
        category.trim() ? `分类：${category.trim()}` : "",
        price ? `预算：${price}元` : "",
        `历史选择次数：${Math.max(1, Number(frequency) || 1)}`,
      ].filter(Boolean).join("；");
      let aiRule: Awaited<ReturnType<typeof analyzeLifeRule>> | null = null;
      try {
        aiRule = await analyzeLifeRule(description);
      } catch {
        // Manual data remains valid even when the optional AI rule service is unavailable.
      }
      const resolvedName = aiRule?.result || dishName.trim();
      const resolvedCategory = aiRule?.category || category.trim() || null;
      const aiConfidence = Number(aiRule?.confidence);
      const candidate: LifeImportCandidate = { id: `manual-${Date.now()}`, name: resolvedName, merchantName: merchantName.trim() || null, frequency: Math.max(1, Number(frequency) || 1), paidAmount: price ? Number(price) : null, unitPrice: price ? Number(price) : null, category: resolvedCategory, confidence: Number.isFinite(aiConfidence) ? Math.max(0, Math.min(1, aiConfidence)) : 1, kind: "delivery", priceLevel: !price || Number(price) < 20 ? 1 : Number(price) <= 50 ? 2 : 3, love: 3, health: 3, etaMinutes: 30, weatherTags: ["normal"], energyTags: ["normal"], companionTags: ["solo"] };
      const defaultRule = aiRule?.defaultRule || "已记录为你的真实选择；系统会在积累更多订单后形成稳定默认规则。";
      const analysis: LifeImportAnalysis = { candidates: [candidate], totalOrders: candidate.frequency, profile: { windowDays: 0, familiarDinnerShare: candidate.frequency > 1 ? 100 : 0, keywords: aiRule ? ["已建立默认规则"] : [], taste: "暂时没有足够数据判断口味偏好", budgetLabel: candidate.priceLevel === 1 ? "低预算" : candidate.priceLevel === 2 ? "中预算" : "高预算", dinnerPattern: "暂时没有足够数据判断晚餐节奏", weekdayRule: defaultRule, weekendRule: defaultRule, insight: defaultRule } };
      await commitLifeImport({ source: "records", fileCount: 0, analysis, candidates: [candidate] });
      onSaved();
    } catch {
      setError("保存失败，请稍后重试。现有默认池没有被修改。");
    } finally {
      setAnalyzingRule(false);
    }
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="app-surface-raised w-full max-w-lg p-6" role="dialog" aria-modal="true" aria-labelledby="manual-order-title"><div className="flex items-center justify-between"><h2 id="manual-order-title" className="text-xl font-semibold">补充订单名称</h2><button className="app-icon-button" aria-label="关闭" onClick={onClose}><X size={17} /></button></div><p className="mt-3 text-sm leading-6 text-[var(--muted)]">请输入订单名称，我会帮你建立默认规则。</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="商家名称" value={merchantName} onChange={setMerchantName} /><Field label="菜品名称" value={dishName} onChange={setDishName} /><Field label="价格" type="number" value={price} onChange={setPrice} /><Field label="分类" value={category} onChange={setCategory} /><Field label="历史次数" type="number" value={frequency} onChange={setFrequency} /></div>{error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button className="app-button app-button-secondary" disabled={analyzingRule} onClick={onClose}>取消</button><button className="app-button app-button-primary" disabled={analyzingRule} onClick={save}>{analyzingRule ? "正在建立规则" : "建立默认规则"}</button></div></section></div>;
}
