"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowCounterClockwise,
  ArrowRight,
  Cards,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  CloudRain,
  Compass,
  Database,
  Desktop,
  DownloadSimple,
  GearSix,
  House,
  Lightning,
  Moon,
  Plus,
  ShieldCheck,
  Smiley,
  SmileyMeh,
  SmileySad,
  Sparkle,
  Sun,
  Timer,
  UploadSimple,
  Users,
  Wallet,
  X,
} from "@phosphor-icons/react";
import { DefaultsManager } from "@/components/defaults-manager";
import { FoodSprite, PixelDie } from "@/components/game-visuals";
import { HistoryView } from "@/components/history-view";
import { ImportLifeView } from "@/components/import-life-view";
import { db, initializeDatabase } from "@/lib/db";
import {
  companionLabels,
  contextLabels,
  energyLabels,
  intentLabels,
  kindLabels,
  priceLabels,
  urgencyLabels,
  weatherLabels,
} from "@/lib/labels";
import { recommend, scoreOption } from "@/lib/recommendation";
import {
  downloadBackup,
  resetToSamples,
  restoreBackup,
  saveDecision,
  saveFeedback,
  updateTheme,
} from "@/lib/storage";
import type {
  AppSettings,
  DecisionContext,
  DecisionRecord,
  FeedbackValue,
  FoodOption,
  RankedOption,
  RecommendationResult,
  ThemePreference,
} from "@/lib/types";

type MainView = "today" | "defaults" | "history" | "settings";
type TodayFlow = "home" | "context" | "recommendation" | "feedback";

function localDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function worldlineHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
type DefaultsFlow = "pool" | "import";

const defaultContext: DecisionContext = {
  budget: 2,
  energy: "normal",
  weather: "normal",
  companion: "solo",
  intent: "familiar",
  urgency: "relaxed",
};

const navItems: Array<{
  id: MainView;
  label: string;
  icon: typeof House;
}> = [
  { id: "today", label: "今天", icon: House },
  { id: "defaults", label: "默认池", icon: Cards },
  { id: "history", label: "历史", icon: ClockCounterClockwise },
  { id: "settings", label: "设置", icon: GearSix },
];

export function DefaultLifeApp() {
  const [view, setView] = useState<MainView>("today");
  const [flow, setFlow] = useState<TodayFlow>("home");
  const [defaultsFlow, setDefaultsFlow] = useState<DefaultsFlow>("pool");
  const [context, setContext] = useState<DecisionContext>(defaultContext);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [shownIds, setShownIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<DecisionRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    initializeDatabase().catch(() => setToast("本地数据初始化失败，请刷新重试。"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const options = useLiveQuery(() => db.options.toArray(), [], undefined);
  const decisions = useLiveQuery(() => db.decisions.toArray(), [], undefined);
  const settings = useLiveQuery(() => db.settings.get("app"), [], undefined);
  const lifeImports = useLiveQuery(() => db.imports.toArray(), [], undefined);

  useTheme(settings?.theme ?? "system");

  const navigate = (nextView: MainView) => {
    setView(nextView);
    if (nextView !== "today") setFlow("home");
    if (nextView === "defaults") setDefaultsFlow("pool");
  };

  const beginRecommendation = () => {
    setContext(defaultContext);
    setShownIds([]);
    setResult(null);
    setFlow("context");
  };

  const generateRecommendation = (nextContext: DecisionContext) => {
    if (!options) return;
    const nextResult = recommend(options, nextContext);
    if (!nextResult) {
      setToast("没有可用选项，请先在默认池中启用一个答案。 ");
      navigate("defaults");
      return;
    }
    setContext(nextContext);
    setResult(nextResult);
    setShownIds([nextResult.primary.option.id]);
    setFlow("recommendation");
  };

  const reroll = () => {
    if (!options || !result) return;
    const nextShown = Array.from(new Set([...shownIds, result.primary.option.id]));
    let nextResult = recommend(options, context, { excludeIds: nextShown });
    if (!nextResult) {
      nextResult = recommend(options, context);
      setToast("已经看完一轮，现在重新从选择池开始。 ");
      setShownIds([]);
    } else {
      setShownIds(nextShown);
    }
    setResult(nextResult);
  };

  const acceptChoice = async (selected: RankedOption, selectionMode: DecisionRecord["selectionMode"]) => {
    if (!result) return;
    const record = await saveDecision({ context, result, selected, selectionMode, shownIds });
    setDecision(record);
    setFlow("feedback");
  };

  const submitFeedback = async (feedback?: FeedbackValue) => {
    if (!decision) return;
    if (feedback) await saveFeedback(decision.id, decision.selectedId, feedback);
    setFlow("home");
    setResult(null);
    setDecision(null);
    setToast(feedback ? "反馈已记住，下次会有限度地调整。" : "选择已经保存。 ");
  };

  const loading = !options || !decisions || !settings || !lifeImports;
  const latestImport = lifeImports
    ? [...lifeImports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : undefined;

  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--ink)]">
      <AppNavigation view={view} onNavigate={navigate} />
      <main className="min-h-[100dvh] md:pl-60">
        {loading ? (
          <LoadingView />
        ) : (
          <>
            {view === "today" && flow === "home" && (
              <HomeView
                options={options}
                decisions={decisions}
                onBegin={beginRecommendation}
                onOpenDefaults={() => navigate("defaults")}
              />
            )}
            {view === "today" && flow === "context" && (
              <ContextView
                value={context}
                onChange={setContext}
                onBack={() => setFlow("home")}
                onSubmit={() => generateRecommendation(context)}
              />
            )}
            {view === "today" && flow === "recommendation" && result && (
              <RecommendationView
                result={result}
                context={context}
                allOptions={options}
                onBack={() => setFlow("context")}
                onAccept={acceptChoice}
                onReroll={reroll}
              />
            )}
            {view === "today" && flow === "feedback" && decision && (
              <FeedbackView decision={decision} onSubmit={submitFeedback} />
            )}
            {view === "defaults" && defaultsFlow === "pool" && (
              <DefaultsManager options={options} onImport={() => setDefaultsFlow("import")} />
            )}
            {view === "defaults" && defaultsFlow === "import" && (
              <ImportLifeView latestImport={latestImport} onBack={() => setDefaultsFlow("pool")} />
            )}
            {view === "history" && <HistoryView decisions={decisions} imports={lifeImports} />}
            {view === "settings" && (
              <SettingsView
                settings={settings}
                optionCount={options.length}
                decisionCount={decisions.length}
                onToast={setToast}
              />
            )}
          </>
        )}
      </main>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function AppNavigation({ view, onNavigate }: { view: MainView; onNavigate: (view: MainView) => void }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6 md:flex">
        <Brand />
        <nav className="mt-10 space-y-1.5" aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                className="flex min-h-11 w-full items-center gap-3 rounded-[10px] border border-transparent px-3 text-left text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] aria-[current=page]:border-[var(--line)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:text-[var(--accent-strong)]"
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note mt-auto p-4">
          <p className="text-xs font-semibold text-[var(--ink)]">你的选择，你的规则</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">系统只在你留下的偏好范围内做决定。</p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] px-4 backdrop-blur-md md:hidden">
        <Brand compact />
      </header>

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-[16px] border border-[var(--line)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow)] md:hidden" aria-label="主要导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-[11px] text-[11px] font-semibold text-[var(--muted)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:text-[var(--accent-strong)]"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={20} weight={active ? "fill" : "regular"} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <PixelDie compact animated={false} />
      <div>
        <p className={`${compact ? "text-sm" : "text-[15px]"} font-bold tracking-[-0.03em]`}>预制人生</p>
        <p className="text-[9px] font-semibold tracking-[0.16em] text-[var(--muted)]">DEFAULT LIFE</p>
      </div>
    </div>
  );
}

function HomeView({
  options,
  decisions,
  onBegin,
  onOpenDefaults,
}: {
  options: FoodOption[];
  decisions: DecisionRecord[];
  onBegin: () => void;
  onOpenDefaults: () => void;
}) {
  const [worldlineDay, setWorldlineDay] = useState("default-life");
  const [worldlineOffset, setWorldlineOffset] = useState(0);
  const activeOptions = options.filter((option) => option.active);
  const lastDecision = [...decisions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const canBegin = activeOptions.length > 0;
  const previewOption = activeOptions.find((option) => option.id === lastDecision?.selectedId) ?? activeOptions[0];
  const dailySeed = useMemo(() => worldlineHash(worldlineDay), [worldlineDay]);
  const worldlineNumber = String((dailySeed + worldlineOffset * 48271) % 1_000_000).padStart(6, "0");
  const worldlineOption = activeOptions.length > 0
    ? activeOptions[(dailySeed + worldlineOffset) % activeOptions.length]
    : undefined;
  const previewFoods = worldlineOption
    ? [worldlineOption, ...activeOptions.filter((option) => option.id !== worldlineOption.id)].slice(0, 3)
    : [];

  useEffect(() => {
    setWorldlineDay(localDateKey());
    setWorldlineOffset(0);
  }, []);

  return (
    <div className="home-page screen-enter">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-kicker">PERSONAL LIFE OS</p>
          <h1 id="home-title">今天不用再想<br />吃什么。</h1>
          <p className="home-intro">先留下真正会反复选择的东西，再把今天交给系统。</p>
          <div className="home-actions">
            <button className="app-button app-button-primary" onClick={canBegin ? onBegin : onOpenDefaults}>
              {canBegin ? "开始今天" : "建立默认池"}
              {canBegin ? <ArrowRight size={18} weight="bold" /> : <Plus size={18} weight="bold" />}
            </button>
            <button className="app-button app-button-secondary" onClick={onOpenDefaults}>
              查看默认池
            </button>
          </div>
        </div>

        <aside className="life-console" aria-label="今日选择系统">
          <div className="life-console-top">
            <span>今日选择</span>
            <span>{activeOptions.length} 个默认值</span>
          </div>
          <div className="dice-stage">
            <div className="worldline-row">
              <button
                className="worldline-die-button"
                type="button"
                onClick={() => setWorldlineOffset((current) => current + 1)}
                disabled={!canBegin}
                aria-label="掷骰子，切换今天的世界线"
                title="掷一次骰子"
              >
                <PixelDie key={worldlineOffset} shifting={worldlineOffset > 0} />
              </button>
              <div className="worldline-note" aria-live="polite">
                <span>今天的世界线</span>
                <strong>#{worldlineNumber}</strong>
                <p>午餐：{worldlineOption?.name ?? "等待默认值"}</p>
                <small>同一套偏好，另一种展开。</small>
              </div>
            </div>
            <p className="dice-stage-caption">把重复选择，交给系统。</p>
          </div>
          <div className="food-dock" aria-label="当前可选的食物">
            {previewFoods.map((option) => (
              <span className="food-dock-item" key={option.id} title={option.name}>
                <FoodSprite name={option.name} size="sm" />
              </span>
            ))}
          </div>
        </aside>
      </section>

      <section className="home-method" aria-labelledby="method-title">
        <header>
          <h2 id="method-title">系统只做三件事</h2>
          <p>不扩大选择，只把你已经认可的生活规则整理清楚。</p>
        </header>
        <ol className="life-steps">
          <li>
            <Cards size={22} />
            <div><h3>留下真正会选的</h3><p>用默认池定义范围。</p></div>
          </li>
          <li>
            <Compass size={22} />
            <div><h3>描述今天的状态</h3><p>预算、天气、精力就够了。</p></div>
          </li>
          <li>
            <CheckCircle size={22} />
            <div><h3>接收一个可执行的答案</h3><p>你仍然保留最终决定权。</p></div>
          </li>
        </ol>
      </section>

      <section className="home-preview" aria-labelledby="preview-title">
        <div className="home-preview-copy">
          <h2 id="preview-title">把真实状态，放进生活界面。</h2>
          <p>这不是随机转盘。系统会结合你的偏好和当下情境，给出可以直接执行的建议。</p>
          <dl className="home-metrics">
            <div><dt>可推荐选项</dt><dd>{activeOptions.length}</dd></div>
            <div><dt>完成选择</dt><dd>{decisions.length}</dd></div>
          </dl>
        </div>

        <div className="system-preview" aria-label="今天吃什么系统预览">
          <div className="system-preview-header">
            <span>今天吃什么</span>
            <span>依据当前默认值</span>
          </div>
          <div className="system-preview-body">
            <div className="system-context">
              <p>今天的状态</p>
              <div><span>预算</span><strong>中</strong></div>
              <div><span>精力</span><strong>普通</strong></div>
              <div><span>天气</span><strong>日常</strong></div>
            </div>
            <article className="system-answer">
              <FoodSprite name={previewOption?.name ?? "番茄牛腩饭"} size="lg" />
              <div>
                <p>今天的默认答案</p>
                <h3>{previewOption?.name ?? "先建立一个默认值"}</h3>
                <span>{previewOption ? `约 ${previewOption.etaMinutes} 分钟` : "从真正喜欢的选项开始"}</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="home-note" aria-label="产品理念">
        <p>生活不必每次从零开始。</p>
        <span>不是替你生活，只是替你减少重复消耗。</span>
      </section>
    </div>
  );
}

function ContextView({
  value,
  onChange,
  onBack,
  onSubmit,
}: {
  value: DecisionContext;
  onChange: (value: DecisionContext) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="screen-enter mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
        <ArrowRight size={17} className="rotate-180" /> 返回
      </button>
      <div className="mt-6 max-w-2xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">描述现在</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">不用答得很精确</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)] md:text-base">默认值已经选好，只修改今天有变化的部分即可。</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ContextField icon={Wallet} title="预算">
          <Segmented
            options={([1, 2, 3] as const).map((id) => ({ id, label: priceLabels[id] }))}
            value={value.budget}
            onChange={(budget) => onChange({ ...value, budget })}
          />
        </ContextField>
        <ContextField icon={Lightning} title="精力">
          <Segmented
            options={(["low", "normal", "high"] as const).map((id) => ({ id, label: energyLabels[id] }))}
            value={value.energy}
            onChange={(energy) => onChange({ ...value, energy })}
          />
        </ContextField>
        <ContextField icon={CloudRain} title="天气">
          <Segmented
            options={(["hot", "cold", "rain", "normal"] as const).map((id) => ({ id, label: weatherLabels[id] }))}
            value={value.weather}
            onChange={(weather) => onChange({ ...value, weather })}
          />
        </ContextField>
        <ContextField icon={Users} title="和谁一起">
          <Segmented
            options={(["solo", "friends"] as const).map((id) => ({ id, label: companionLabels[id] }))}
            value={value.companion}
            onChange={(companion) => onChange({ ...value, companion })}
          />
        </ContextField>
        <ContextField icon={Compass} title="今天的倾向">
          <Segmented
            options={(["familiar", "explore"] as const).map((id) => ({ id, label: intentLabels[id] }))}
            value={value.intent}
            onChange={(intent) => onChange({ ...value, intent })}
          />
        </ContextField>
        <ContextField icon={Timer} title="时间">
          <Segmented
            options={(["rush", "relaxed"] as const).map((id) => ({ id, label: urgencyLabels[id] }))}
            value={value.urgency}
            onChange={(urgency) => onChange({ ...value, urgency })}
          />
        </ContextField>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[var(--muted)]">推荐只在你设定的选择池内发生。</p>
        <button className="app-button app-button-primary sm:min-w-44" onClick={onSubmit}>
          给我一个答案 <Sparkle size={18} weight="fill" />
        </button>
      </div>
    </section>
  );
}

function ContextField({ icon: Icon, title, children }: { icon: typeof Wallet; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="app-surface p-4 md:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon size={18} className="text-[var(--accent-strong)]" />
        {title}
      </div>
      {children}
    </fieldset>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button key={String(option.id)} className="segment px-2" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RecommendationView({
  result,
  context,
  allOptions,
  onBack,
  onAccept,
  onReroll,
}: {
  result: RecommendationResult;
  context: DecisionContext;
  allOptions: FoodOption[];
  onBack: () => void;
  onAccept: (option: RankedOption, mode: DecisionRecord["selectionMode"]) => void;
  onReroll: () => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const primary = result.primary;
  const explanation = primary.reasons.length > 0
    ? `${primary.reasons.join("，而且")}。`
    : "它在你今天设定的范围里最接近当前状态。";

  return (
    <section className="screen-enter mx-auto w-full max-w-7xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10 lg:px-12">
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
        <ArrowRight size={17} className="rotate-180" /> 修改状态
      </button>

      <div className="mt-6 flex flex-wrap gap-2">
        {contextLabels(context).map((label) => <span key={label} className="option-chip">{label}</span>)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="app-surface-raised flex min-h-[470px] flex-col p-6 md:p-8 lg:p-10">
          <div className="flex items-start justify-between gap-4">
            <FoodSprite name={primary.option.name} size="lg" />
            <span className="option-chip" data-accent="true">今天的默认答案</span>
          </div>
          <div className="my-auto py-10">
            <p className="text-sm font-semibold text-[var(--muted)]">今天吃</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] md:text-6xl">{primary.option.name}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">{explanation}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="option-chip">{kindLabels[primary.option.kind]}</span>
              <span className="option-chip">{priceLabels[primary.option.priceLevel]}</span>
              <span className="option-chip">约 {primary.option.etaMinutes} 分钟</span>
            </div>
          </div>

          {result.relaxedBudget && (
            <p className="mb-5 rounded-[10px] bg-[var(--surface-soft)] p-3 text-xs leading-5 text-[var(--muted)]">
              当前预算内没有可用选项，这次临时放宽了价格限制。
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <button className="app-button app-button-primary" onClick={() => onAccept(primary, "recommended")}>
              <Check size={18} weight="bold" /> 就选这个
            </button>
            <button className="app-button app-button-secondary" onClick={onReroll}>
              <ArrowCounterClockwise size={18} /> 换一个
            </button>
          </div>
        </article>

        <div className="space-y-5">
          <div className="app-surface p-5">
            <h2 className="text-sm font-semibold">两个备选</h2>
            <div className="mt-4 space-y-3">
              {result.alternatives.length > 0 ? result.alternatives.map((alternative) => (
                <button
                  key={alternative.option.id}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-left transition-transform active:scale-[0.99]"
                  onClick={() => onAccept(alternative, "alternative")}
                >
                  <FoodSprite name={alternative.option.name} size="sm" />
                  <span className="min-w-0">
                    <span className="text-xs text-[var(--muted)]">{kindLabels[alternative.option.kind]}</span>
                    <span className="mt-1 block truncate font-semibold">{alternative.option.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{alternative.reasons[0] ?? "也符合你今天的主要条件"}</span>
                  </span>
                </button>
              )) : (
                <p className="text-sm leading-6 text-[var(--muted)]">选择池里暂时没有更多备选。</p>
              )}
            </div>
            <button className="app-button app-button-quiet mt-3 w-full text-sm" onClick={() => setManualOpen(true)}>
              我自己选
            </button>
          </div>

          <details className="app-soft p-5">
            <summary className="cursor-pointer text-sm font-semibold">为什么是它</summary>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {primary.factors.map((factor) => (
                <div key={factor.key} className="rounded-[10px] bg-[var(--surface-raised)] p-3">
                  <p className="text-xs text-[var(--muted)]">{factor.label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{Math.round(factor.contribution)} / {factor.max}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">这些分数只用于当前选择池的排序，不代表客观好坏。</p>
          </details>
        </div>
      </div>

      {manualOpen && (
        <ManualPicker
          options={allOptions.filter((option) => option.active)}
          context={context}
          onClose={() => setManualOpen(false)}
          onChoose={(option) => onAccept(scoreOption(option, context), "manual")}
        />
      )}
    </section>
  );
}

function ManualPicker({
  options,
  context,
  onClose,
  onChoose,
}: {
  options: FoodOption[];
  context: DecisionContext;
  onClose: () => void;
  onChoose: (option: FoodOption) => void;
}) {
  const ranked = useMemo(
    () => options.map((option) => scoreOption(option, context)).sort((a, b) => b.score - a.score),
    [context, options],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <div>
            <p className="text-xs font-semibold text-[var(--accent-strong)]">最终决定权属于你</p>
            <h2 id="manual-title" className="mt-1 text-xl font-semibold">自己选择</h2>
          </div>
          <button className="app-icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          {ranked.map((item) => (
            <button
              key={item.option.id}
              className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-4 text-left hover:bg-[var(--surface-soft)]"
              onClick={() => onChoose(item.option)}
            >
              <span className="text-xs text-[var(--muted)]">{kindLabels[item.option.kind]} / {priceLabels[item.option.priceLevel]}</span>
              <span className="mt-2 block font-semibold">{item.option.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FeedbackView({
  decision,
  onSubmit,
}: {
  decision: DecisionRecord;
  onSubmit: (feedback?: FeedbackValue) => void;
}) {
  return (
    <section className="screen-enter mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-3xl place-items-center px-4 pb-28 pt-8 md:min-h-[100dvh] md:px-8 md:py-12">
      <div className="app-surface-raised w-full p-6 text-center md:p-10">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <CheckCircle size={34} weight="fill" />
        </div>
        <p className="mt-7 text-sm font-semibold text-[var(--muted)]">这次决定了</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">{decision.selectedName}</h1>
        <p className="mt-6 text-sm text-[var(--muted)]">这次选得怎么样？</p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button className="app-button app-button-secondary flex-col py-5" onClick={() => onSubmit("great")}>
            <Smiley size={25} weight="fill" />
            很准
          </button>
          <button className="app-button app-button-secondary flex-col py-5" onClick={() => onSubmit("okay")}>
            <SmileyMeh size={25} />
            还行
          </button>
          <button className="app-button app-button-secondary flex-col py-5" onClick={() => onSubmit("avoid")}>
            <SmileySad size={25} />
            暂时别推荐
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">选择“暂时别推荐”后，它会冷却 14 天，不会被删除。</p>
        <button className="app-button app-button-quiet mt-5 text-sm" onClick={() => onSubmit()}>跳过反馈</button>
      </div>
    </section>
  );
}

function SettingsView({
  settings,
  optionCount,
  decisionCount,
  onToast,
}: {
  settings: AppSettings;
  optionCount: number;
  decisionCount: number;
  onToast: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);

  const handleRestore = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm("恢复备份会替换当前浏览器中的全部数据。继续吗？")) return;
    setWorking(true);
    try {
      await restoreBackup(file);
      onToast("备份已恢复。 ");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "恢复失败，请检查文件。 ");
    } finally {
      setWorking(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = async () => {
    if (!window.confirm("清空所有选择和历史，并恢复六个示例选项？此操作无法撤销。")) return;
    await resetToSamples();
    onToast("已经恢复到初始示例。 ");
  };

  return (
    <section className="screen-enter mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
      <div>
        <p className="mb-2 text-sm font-semibold text-[var(--accent-strong)]">设置</p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">保持简单，也保有退路</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)] md:text-base">没有账号，也没有云端。你可以随时导出一份完整的数据备份。</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-5">
          <section className="app-surface p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Sun size={20} /></div>
              <div>
                <h2 className="font-semibold">界面主题</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">默认跟随设备，也可以固定明亮或深色。</p>
              </div>
            </div>
            <div className="segmented-control mt-5">
              {([
                { id: "system", label: "跟随设备", icon: Desktop },
                { id: "light", label: "明亮", icon: Sun },
                { id: "dark", label: "深色", icon: Moon },
              ] as Array<{ id: ThemePreference; label: string; icon: typeof Sun }>).map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className="segment flex items-center justify-center gap-2 px-2" aria-pressed={settings.theme === item.id} onClick={() => updateTheme(item.id)}>
                    <Icon size={16} /> {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="app-surface p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Database size={20} /></div>
              <div>
                <h2 className="font-semibold">数据备份</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">包含默认池、选择历史、反馈和当前设置。</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button className="app-button app-button-primary" onClick={() => downloadBackup()}>
                <DownloadSimple size={18} /> 导出备份
              </button>
              <button className="app-button app-button-secondary" disabled={working} onClick={() => fileRef.current?.click()}>
                <UploadSimple size={18} /> {working ? "正在恢复" : "恢复备份"}
              </button>
              <input ref={fileRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => handleRestore(event.target.files?.[0])} />
            </div>
          </section>

          <section className="app-surface p-5 md:p-6">
            <h2 className="font-semibold text-[var(--danger)]">重新开始</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">清空当前数据并恢复最初的示例选择池。建议先导出备份。</p>
            <button className="app-button app-button-danger mt-5" onClick={handleReset}>清空并恢复示例</button>
          </section>
        </div>

        <aside className="app-soft h-fit p-5 md:p-6 lg:sticky lg:top-8">
          <div className="flex items-start gap-3">
            <ShieldCheck size={24} className="shrink-0 text-[var(--accent-strong)]" />
            <div>
              <h2 className="font-semibold">本地优先</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">IndexedDB 绑定当前浏览器和网站地址，不会自动跨设备同步。</p>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[12px] bg-[var(--surface-raised)] p-4">
              <dt className="text-xs text-[var(--muted)]">默认选项</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{optionCount}</dd>
            </div>
            <div className="rounded-[12px] bg-[var(--surface-raised)] p-4">
              <dt className="text-xs text-[var(--muted)]">历史记录</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{decisionCount}</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-[var(--muted)]">推荐算法版本：规则权重 1。AI 只负责整理导入信息，不会替你做最终决定。</p>
        </aside>
      </div>
    </section>
  );
}

function LoadingView() {
  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-2 md:items-center md:px-10">
      <div>
        <div className="skeleton h-4 w-28" />
        <div className="skeleton mt-5 h-14 w-4/5" />
        <div className="skeleton mt-3 h-14 w-3/5" />
        <div className="skeleton mt-7 h-5 w-2/3" />
      </div>
      <div className="skeleton h-[420px] w-full rounded-[16px]" />
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex w-[min(92vw,430px)] -translate-x-1/2 items-center gap-3 rounded-[13px] border border-[var(--line)] bg-[var(--surface-raised)] p-3 pl-4 shadow-[var(--shadow)] md:bottom-6">
      <CheckCircle size={20} weight="fill" className="shrink-0 text-[var(--accent-strong)]" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button className="app-icon-button h-9 w-9" aria-label="关闭提示" onClick={onClose}><X size={16} /></button>
    </div>
  );
}

function useTheme(theme: ThemePreference) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
