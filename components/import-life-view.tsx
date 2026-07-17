"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  FileImage,
  ImageSquare,
  Info,
  Sparkle,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { FoodSprite } from "@/components/game-visuals";
import { recognizeOrderScreenshot, type GeminiOrderRecognition } from "@/lib/gemini-order-recognition";
import {
  calculateOrderHistory,
  createLocalImportAnalysis,
  createLocalRuleSuggestion,
  demoOrders,
  makeOrderCandidate,
  orderCategories,
  type OrderDraft,
} from "@/lib/order-import-demo";
import { commitLifeImport, saveImportRuleDecision } from "@/lib/storage";
import type { DefaultRuleSuggestion, FoodOption, LifeImportRecord } from "@/lib/types";

type ImportPhase = "hub" | "upload" | "processing" | "confirm" | "rule" | "complete" | "profile";

interface ImportLifeViewProps {
  latestImport?: LifeImportRecord;
  existingOptions: FoodOption[];
  onBack: () => void;
}

const processingSteps = ["正在读取订单...", "正在分析截图", "正在整理菜品信息"];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const emptyDraft: OrderDraft = { merchantName: "", dishName: "", price: "", category: "", isDemo: false };

export function ImportLifeView({ latestImport, existingOptions, onBack }: ImportLifeViewProps) {
  const [phase, setPhase] = useState<ImportPhase>("hub");
  const [files, setFiles] = useState<File[]>([]);
  const [processingStep, setProcessingStep] = useState(0);
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  const [selectedDemoId, setSelectedDemoId] = useState(demoOrders[0].id);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedImport, setCompletedImport] = useState<LifeImportRecord>();
  const [ruleSuggestion, setRuleSuggestion] = useState<DefaultRuleSuggestion>();
  const [recognitionNotice, setRecognitionNotice] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const processingTimers = useRef<number[]>([]);
  const recognitionRunRef = useRef(0);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  const selectedDemo = demoOrders.find((order) => order.id === selectedDemoId) ?? demoOrders[0];

  const clearProcessing = () => {
    processingTimers.current.forEach((timer) => window.clearTimeout(timer));
    processingTimers.current = [];
  };

  useEffect(() => () => {
    clearProcessing();
    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [previews]);

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

  const startProcessing = (nextDraft: OrderDraft) => {
    clearProcessing();
    setError("");
    setRecognitionNotice("");
    setFieldErrors({});
    setDraft(nextDraft);
    setProcessingStep(0);
    setPhase("processing");
    processingTimers.current = [
      window.setTimeout(() => setProcessingStep(1), 480),
      window.setTimeout(() => setProcessingStep(2), 960),
      window.setTimeout(() => {
        setPhase("confirm");
        processingTimers.current = [];
      }, 1500),
    ];
  };

  const recognizedDraft = (recognition: GeminiOrderRecognition): OrderDraft => {
    const primaryItem = recognition.items.find((item) => item.dishName) ?? recognition.items[0];
    return {
      merchantName: recognition.merchantName ?? "",
      dishName: primaryItem?.dishName ?? "",
      price: primaryItem?.price?.toString() ?? recognition.totalPrice?.toString() ?? "",
      category: primaryItem?.category ?? "",
      isDemo: false,
    };
  };

  const beginUpload = async () => {
    if (files.length === 0) {
      setError("请先上传至少一张订单截图。也可以使用下方示例订单。 ");
      return;
    }

    clearProcessing();
    const runId = ++recognitionRunRef.current;
    setError("");
    setRecognitionNotice("");
    setFieldErrors({});
    setDraft({ ...emptyDraft, isDemo: false });
    setProcessingStep(0);
    setPhase("processing");
    processingTimers.current = [
      window.setTimeout(() => setProcessingStep(1), 1000),
      window.setTimeout(() => setProcessingStep(2), 2000),
    ];

    const [recognition] = await Promise.all([
      recognizeOrderScreenshot(files[0])
        .then((result) => ({ result }))
        .catch(() => ({ error: "自动识别暂时不可用，请确认订单信息。" })),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2200)),
    ]);

    if (runId !== recognitionRunRef.current) return;
    clearProcessing();
    if ("result" in recognition) {
      const nextDraft = recognizedDraft(recognition.result);
      const incomplete = !nextDraft.merchantName || !nextDraft.dishName || !nextDraft.price || !nextDraft.category;
      setDraft(nextDraft);
      setRecognitionNotice(incomplete ? "部分信息未识别，请补充。" : "识别结果已填入；你仍可以修改所有字段。");
    } else {
      setDraft({ ...emptyDraft, isDemo: false });
      setRecognitionNotice(recognition.error);
    }
    setPhase("confirm");
  };

  const beginDemo = () => {
    startProcessing({
      merchantName: selectedDemo.merchantName,
      dishName: selectedDemo.dishName,
      price: selectedDemo.price,
      category: selectedDemo.category,
      isDemo: true,
    });
  };

  const updateDraft = (patch: Partial<OrderDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFieldErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => delete next[key]);
      return next;
    });
  };

  const confirmImport = async () => {
    const nextErrors: Record<string, string> = {};
    if (!draft.merchantName.trim()) nextErrors.merchantName = "请补充商家名称。";
    if (!draft.dishName.trim()) nextErrors.dishName = "请补充菜品名称。";
    if (draft.price.trim() && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) {
      nextErrors.price = "价格请填写有效数字。";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const counts = calculateOrderHistory(existingOptions, draft);
      const candidate = makeOrderCandidate(draft, counts);
      const analysis = createLocalImportAnalysis(candidate);
      const suggestion = createLocalRuleSuggestion(candidate);
      const record = await commitLifeImport({
        source: "screenshots",
        fileCount: draft.isDemo ? 0 : files.length,
        analysis,
        candidates: [candidate],
        isDemo: draft.isDemo,
        ruleSuggestion: suggestion,
      });
      setCompletedImport(record);
      setRuleSuggestion(suggestion);
      setPhase("rule");
    } catch {
      setError("订单暂时没有保存成功，请稍后重试。现有默认池没有被修改。 ");
    } finally {
      setSaving(false);
    }
  };

  const decideRule = async (decision: "accepted" | "dismissed") => {
    if (!completedImport) return;
    setSaving(true);
    setError("");
    try {
      const updated = await saveImportRuleDecision(completedImport.id, decision);
      setCompletedImport(updated);
      setPhase("complete");
    } catch {
      setError("规则暂时没有保存成功。订单已记录，你可以稍后再设置。 ");
    } finally {
      setSaving(false);
    }
  };

  const resetImport = () => {
    recognitionRunRef.current += 1;
    clearProcessing();
    setFiles([]);
    setDraft(emptyDraft);
    setFieldErrors({});
    setError("");
    setRecognitionNotice("");
    setCompletedImport(undefined);
    setRuleSuggestion(undefined);
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
          onOpenProfile={() => setPhase("profile")}
        />
      )}
      {phase === "upload" && (
        <UploadView
          previews={previews}
          error={error}
          inputRef={screenshotInputRef}
          selectedDemoId={selectedDemoId}
          onBack={() => setPhase("hub")}
          onFiles={addFiles}
          onRemove={(file) => setFiles((current) => current.filter((item) => item !== file))}
          onDemoChange={setSelectedDemoId}
          onUseDemo={beginDemo}
          onContinue={beginUpload}
        />
      )}
      {phase === "processing" && <ProcessingView fileCount={draft.isDemo ? 0 : files.length} isDemo={draft.isDemo} currentStep={processingStep} onCancel={() => { recognitionRunRef.current += 1; clearProcessing(); setPhase("upload"); }} />}
      {phase === "confirm" && (
        <ConfirmationSheet
          draft={draft}
          preview={previews[0]?.url}
          recognitionNotice={recognitionNotice}
          fieldErrors={fieldErrors}
          error={error}
          saving={saving}
          onBack={() => setPhase("upload")}
          onChange={updateDraft}
          onConfirm={confirmImport}
        />
      )}
      {phase === "rule" && completedImport && ruleSuggestion && (
        <RuleSuggestionView
          record={completedImport}
          suggestion={ruleSuggestion}
          error={error}
          saving={saving}
          onAccept={() => decideRule("accepted")}
          onDismiss={() => decideRule("dismissed")}
        />
      )}
      {phase === "complete" && completedImport && <ImportCompleteView record={completedImport} onBack={onBack} onRestart={resetImport} />}
      {phase === "profile" && profileRecord && <LifeProfileView record={profileRecord} onBack={onBack} onRestart={resetImport} />}
    </section>
  );
}

function ImportHub({ latestImport, onBack, onOpenUpload, onOpenProfile }: {
  latestImport?: LifeImportRecord;
  onBack: () => void;
  onOpenUpload: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <>
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 返回默认池</button>
      <div className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">生活导入中心</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-[-0.05em] md:text-6xl">把过去的选择，<br />变成未来的默认值。</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)] md:text-lg">上传订单截图，确认必要信息。系统只在你留下的偏好范围内整理规则。</p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-12">
        <article className="app-surface-raised relative overflow-hidden p-6 md:col-span-7 md:p-8">
          <div className="grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--accent)] text-[var(--accent-ink)]"><ImageSquare size={28} weight="fill" /></div>
          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">导入外卖截图</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)] md:text-base">上传后会先整理截图中的订单信息，再由你确认；无法识别的字段不会猜测。</p>
          <button className="app-button app-button-primary mt-8" onClick={onOpenUpload}>开始导入 <ArrowRight size={18} weight="bold" /></button>
        </article>
        <article className="app-surface p-6 md:col-span-5">
          <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Info size={21} /></div><div><h2 className="text-xl font-semibold tracking-[-0.02em]">稳定演示模式</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">可以使用预置订单完整演示：确认信息、匹配历史、建议规则和用户确认。</p></div></div>
        </article>
        <article className="app-soft p-6 md:col-span-5">
          <h2 className="text-lg font-semibold">你的选择，你的规则。</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">系统不会自动建立隐藏规则。每一条建议都会等你确认。</p>
        </article>
      </div>
      {latestImport && <button className="app-button app-button-quiet mt-6 text-sm" onClick={onOpenProfile}>查看最近一次导入 <ArrowRight size={16} /></button>}
    </>
  );
}

function UploadView({ previews, error, inputRef, selectedDemoId, onBack, onFiles, onRemove, onDemoChange, onUseDemo, onContinue }: {
  previews: Array<{ file: File; url: string }>;
  error: string;
  inputRef: RefObject<HTMLInputElement | null>;
  selectedDemoId: string;
  onBack: () => void;
  onFiles: (files: File[]) => void;
  onRemove: (file: File) => void;
  onDemoChange: (id: string) => void;
  onUseDemo: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 返回</button>
      <div className="mt-7 max-w-2xl"><h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">导入外卖截图</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)] md:text-base">支持 JPG、PNG、WEBP，多图上传，单张不超过 3MB。确认前只需补充商家和菜品名称。</p></div>
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.72fr]">
        <label className="upload-dropzone grid min-h-72 place-items-center p-7 text-center" htmlFor="life-screenshots" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files)); }}>
          <div><div className="mx-auto grid h-16 w-16 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><UploadSimple size={30} weight="bold" /></div><h2 className="mt-6 text-xl font-semibold">拖拽图片到这里</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">或点击选择图片，最多 12 张</p><span className="app-button app-button-secondary mt-5">选择图片</span></div>
        </label>
        <input id="life-screenshots" ref={inputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <aside className="app-surface min-h-72 p-5">
          <h2 className="font-semibold">已选择 {previews.length} 张</h2>
          {previews.length === 0 ? <div className="grid min-h-52 place-items-center text-center text-sm leading-6 text-[var(--muted)]"><div><FileImage size={28} className="mx-auto mb-3" />图片缩略图会显示在这里</div></div> : <div className="mt-4 grid grid-cols-2 gap-3">{previews.map(({ file, url }) => <div key={`${file.name}-${file.size}`} className="group relative aspect-[4/3] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)]"><img src={url} alt={`订单截图 ${file.name}`} className="h-full w-full object-cover" /><button className="app-icon-button absolute right-2 top-2 h-9 w-9" aria-label={`移除 ${file.name}`} onClick={(event) => { event.preventDefault(); onRemove(file); }}><X size={15} /></button></div>)}</div>}
        </aside>
      </div>
      <section className="app-soft mt-5 p-5" aria-labelledby="demo-order-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold" id="demo-order-title">示例订单</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">用于录屏演示，不会被标注为截图识别结果。</p></div><span className="option-chip" data-accent="true">稳定演示</span></div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="选择示例订单">{demoOrders.map((order) => <button className="option-chip" data-accent={selectedDemoId === order.id ? "true" : undefined} type="button" key={order.id} aria-pressed={selectedDemoId === order.id} onClick={() => onDemoChange(order.id)}>{order.merchantName}</button>)}</div>
        <button className="app-button app-button-secondary mt-4" type="button" onClick={onUseDemo}>使用示例订单 <ArrowRight size={16} /></button>
      </section>
      {error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-[var(--muted)]">上传后会进入确认卡。历史次数由系统匹配已有记录，不需要手填。</p><button className="app-button app-button-primary sm:min-w-48" onClick={onContinue}>继续导入 {previews.length || ""} 张截图 <Sparkle size={18} weight="fill" /></button></div>
    </>
  );
}

function ProcessingView({ fileCount, isDemo, currentStep, onCancel }: { fileCount: number; isDemo: boolean; currentStep: number; onCancel: () => void }) {
  return <div className="mx-auto grid min-h-[calc(100dvh-8rem)] max-w-3xl place-items-center py-8"><div className="app-surface-raised analysis-panel w-full p-6 md:p-10" aria-live="polite"><div className="flex items-start gap-4"><div className="analysis-pulse grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-[var(--accent)] text-[var(--accent-ink)]"><FileImage size={28} weight="fill" /></div><div><p className="text-sm font-semibold text-[var(--accent-strong)]">正在整理订单</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] md:text-4xl">{fileCount > 0 ? `准备确认 ${fileCount} 张截图` : "准备示例订单"}</h1></div></div><p className="mt-5 text-sm leading-6 text-[var(--muted)]">{isDemo ? "示例订单仅用于演示，确认后仍会按相同方式建立规则。" : "识别完成后，你可以继续修改所有订单字段。"}</p><div className="mt-8 space-y-3">{processingSteps.map((title, index) => { const state = index < currentStep ? "complete" : index === currentStep ? "active" : "pending"; return <div className="analysis-step" data-state={state} key={title}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--surface-soft)]">{state === "complete" ? <Check size={17} weight="bold" /> : <span className="text-sm font-semibold tabular-nums">{index + 1}</span>}</div><p className="text-sm font-semibold">{title}</p></div>; })}</div><button className="app-button app-button-quiet mt-7 text-sm" onClick={onCancel}>取消</button></div></div>;
}

function ConfirmationSheet({ draft, preview, recognitionNotice, fieldErrors, error, saving, onBack, onChange, onConfirm }: {
  draft: OrderDraft;
  preview?: string;
  recognitionNotice: string;
  fieldErrors: Record<string, string>;
  error: string;
  saving: boolean;
  onBack: () => void;
  onChange: (patch: Partial<OrderDraft>) => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  const dialog = (
    <div className="order-confirm-overlay">
      <section className="app-surface-raised order-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="order-confirm-title">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="order-confirm-title" className="text-2xl font-semibold tracking-[-0.03em]">{draft.isDemo ? "确认订单信息" : "AI 识别结果确认"}</h1>
              {draft.isDemo && <span className="option-chip" data-accent="true">示例订单</span>}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{draft.isDemo ? "补充必要信息后，系统会自动匹配你的历史选择。" : "请确认订单信息；未识别的字段可以补充。"}</p>
          </div>
          <button className="app-icon-button shrink-0" aria-label="返回上传" onClick={onBack}><X size={17} /></button>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-[132px_1fr]">
          <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-[13px] border border-[var(--line)] bg-[var(--surface-soft)]">
            {preview ? <img src={preview} alt="已上传订单截图缩略图" className="h-full w-full object-cover" /> : <div className="text-center text-xs text-[var(--muted)]"><FoodSprite name={draft.dishName || "示例订单"} size="sm" /><p className="mt-2">示例订单</p></div>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="merchant-name" label="商家名称" placeholder="例如：麦当劳" value={draft.merchantName} error={fieldErrors.merchantName} onChange={(merchantName) => onChange({ merchantName })} />
            <FormField id="dish-name" label="菜品名称" placeholder="例如：麦辣鸡腿堡套餐" value={draft.dishName} error={fieldErrors.dishName} onChange={(dishName) => onChange({ dishName })} />
            <FormField id="order-price" label="价格" type="number" placeholder="例如：29.9" value={draft.price} error={fieldErrors.price} onChange={(price) => onChange({ price })} />
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">分类</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {orderCategories.map((category) => <button type="button" className="option-chip" data-accent={draft.category === category ? "true" : undefined} key={category} aria-pressed={draft.category === category} onClick={() => onChange({ category })}>{category}</button>)}
              </div>
            </div>
          </div>
        </div>
        {recognitionNotice && <p className="mt-4 rounded-[10px] bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-strong)]" role="status">{recognitionNotice}</p>}
        {error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="app-button app-button-secondary" disabled={saving} onClick={onBack}>取消</button>
          <button className="app-button app-button-primary" disabled={saving} onClick={onConfirm}>{saving ? "正在保存" : "确认导入"} <ArrowRight size={17} /></button>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return dialog;

  return createPortal(dialog, document.body);
}

function FormField({ id, label, placeholder, value, error, type = "text", onChange }: { id: string; label: string; placeholder: string; value: string; error?: string; type?: "text" | "number"; onChange: (value: string) => void }) {
  return <label htmlFor={id} className="text-xs font-medium text-[var(--muted)]"><span>{label}</span><input id={id} className="form-input mt-1 min-h-11 py-2 text-sm text-[var(--ink)]" aria-invalid={Boolean(error)} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />{error && <span className="mt-1 block text-xs text-[var(--danger)]">{error}</span>}</label>;
}

function RuleSuggestionView({ record, suggestion, error, saving, onAccept, onDismiss }: { record: LifeImportRecord; suggestion: DefaultRuleSuggestion; error: string; saving: boolean; onAccept: () => void; onDismiss: () => void }) {
  const candidate = record.candidates[0];
  return <div className="mx-auto grid min-h-[calc(100dvh-10rem)] max-w-3xl place-items-center py-8"><section className="app-surface-raised w-full p-6 md:p-9"><span className="option-chip" data-accent="true"><CheckCircle size={14} weight="fill" /> 订单已记录</span><h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">要把它变成一条默认规则吗？</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">「{candidate?.name}」已经进入你的默认池。下面这条规则仍由你决定。</p><article className="app-soft mt-7 p-5"><p className="text-xs font-semibold text-[var(--accent-strong)]">默认规则建议</p><h2 className="mt-2 text-xl font-semibold">{suggestion.title}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{suggestion.explanation}</p><div className="mt-4 border-t border-[var(--line)] pt-4"><p className="text-xs font-medium text-[var(--muted)]">数据依据</p><p className="mt-1 text-sm">{suggestion.evidence}</p></div></article>{error && <p className="mt-4 rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className="app-button app-button-secondary" disabled={saving} onClick={onDismiss}>暂不设置</button><button className="app-button app-button-primary" disabled={saving} onClick={onAccept}>{saving ? "正在保存" : "接受规则"} <Check size={17} weight="bold" /></button></div></section></div>;
}

function ImportCompleteView({ record, onBack, onRestart }: { record: LifeImportRecord; onBack: () => void; onRestart: () => void }) {
  const candidate = record.candidates[0];
  const amount = candidate?.paidAmount ?? candidate?.unitPrice;
  const accepted = record.ruleDecision === "accepted";
  return <div className="mx-auto grid min-h-[calc(100dvh-10rem)] max-w-3xl place-items-center py-8"><section className="app-surface-raised w-full p-6 md:p-9"><div className="grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><CheckCircle size={30} weight="fill" /></div><p className="mt-6 text-sm font-semibold text-[var(--accent-strong)]">导入完成</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">这次选择已经留下来了。</h1><div className="app-soft mt-7 p-5"><p className="text-xs font-medium text-[var(--muted)]">首页反馈</p><p className="mt-2 font-semibold">已记录：{candidate?.name}{amount !== null && amount !== undefined ? ` · ¥${amount}` : ""}</p>{accepted && record.ruleSuggestion ? <p className="mt-3 text-sm text-[var(--accent-strong)]">新规则：{record.ruleSuggestion.rule}</p> : <p className="mt-3 text-sm text-[var(--muted)]">订单已保存，尚未建立新规则。</p>}</div><p className="mt-5 text-sm leading-6 text-[var(--muted)]">系统只在你留下的偏好范围内做决定。</p><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button className="app-button app-button-secondary" onClick={onRestart}>继续导入</button><button className="app-button app-button-primary" onClick={onBack}>返回默认池 <ArrowRight size={17} /></button></div></section></div>;
}

function LifeProfileView({ record, onBack, onRestart }: { record: LifeImportRecord; onBack: () => void; onRestart: () => void }) {
  return <><div className="flex flex-wrap items-center justify-between gap-3"><button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}><ArrowLeft size={17} /> 返回默认池</button><span className="option-chip" data-accent="true"><CheckCircle size={14} weight="fill" /> 导入记录</span></div><div className="mt-7 max-w-3xl"><p className="text-sm font-semibold text-[var(--accent-strong)]">最近一次导入</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] md:text-6xl">你的默认人生</h1><p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">已加入 {record.addedCount} 个新项目，更新 {record.updatedCount} 个已有项目。</p></div><section className="app-surface-raised mt-9 p-6 md:p-8"><h2 className="text-xl font-semibold">已确认的订单选择</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{record.candidates.map((candidate) => <div className="rounded-[12px] border border-[var(--line)] p-4" key={candidate.id}><p className="text-xs text-[var(--muted)]">{candidate.merchantName || "未填写商家"}</p><p className="mt-1 font-semibold">{candidate.name}</p><p className="mt-2 text-xs text-[var(--muted)]">历史出现 {candidate.historyCount ?? candidate.frequency} 次{record.isDemo ? " · 示例订单" : " · 已确认订单"}</p></div>)}</div>{record.ruleDecision === "accepted" && record.ruleSuggestion && <p className="mt-5 text-sm text-[var(--accent-strong)]">新规则：{record.ruleSuggestion.rule}</p>}</section><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-[var(--muted)]">画像只基于你确认的订单。</p><button className="app-button app-button-secondary" onClick={onRestart}>继续导入</button></div></>;
}
