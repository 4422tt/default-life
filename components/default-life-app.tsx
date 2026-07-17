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
import { LifeAssistantIp } from "@/components/life-assistant-ip";
import { db, initializeDatabase } from "@/lib/db";
import { formatDishDisplay } from "@/lib/dish-display";
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
  LifeImportRecord,
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
  const isLandingHome = view === "today" && flow === "home";

  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--ink)]">
      {!isLandingHome && <AppNavigation view={view} onNavigate={navigate} />}
      <main className={isLandingHome ? "min-h-[100dvh]" : "min-h-[100dvh] md:pl-60"}>
        {loading ? (
          <LoadingView />
        ) : (
          <>
            {view === "today" && flow === "home" && (
              <LandingHomeView
                options={options}
                decisions={decisions}
                imports={lifeImports}
                onBegin={beginRecommendation}
                onOpenDefaults={() => navigate("defaults")}
                onOpenImport={() => {
                  setView("defaults");
                  setDefaultsFlow("import");
                }}
                onOpenHistory={() => navigate("history")}
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
              <ImportLifeView latestImport={latestImport} existingOptions={options} onBack={() => setDefaultsFlow("pool")} />
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

function LegacyHomeView({
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

function LandingHomeView({
  options,
  decisions,
  imports,
  onBegin,
  onOpenDefaults,
  onOpenImport,
  onOpenHistory,
}: {
  options: FoodOption[];
  decisions: DecisionRecord[];
  imports: LifeImportRecord[];
  onBegin: () => void;
  onOpenDefaults: () => void;
  onOpenImport: () => void;
  onOpenHistory: () => void;
}) {
  const [demoMode, setDemoMode] = useState(false);
  const [diceValue, setDiceValue] = useState(5);
  const [dicePhase, setDicePhase] = useState<"idle" | "rolling" | "result" | "accepted">("idle");
  const [homeResult, setHomeResult] = useState<RecommendationResult | null>(null);
  const [shownIds, setShownIds] = useState<string[]>([]);
  const [isSavingChoice, setIsSavingChoice] = useState(false);
  const diceTimerRef = useRef<number | null>(null);

  const personalOptions = options.filter((option) => option.active && !option.isSample);
  const demoOptions = options.filter((option) => option.active && option.isSample);
  const poolOptions = demoMode ? demoOptions : personalOptions;
  const hasPool = poolOptions.length > 0;
  const latestImport = [...imports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latestImportedCandidate = latestImport?.candidates[0];
  const lastDecision = [...decisions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const currentContext: DecisionContext = demoMode
    ? { ...defaultContext, budget: 2, energy: "normal", intent: "explore" }
    : defaultContext;
  const recentIds = useMemo(() => {
    const threeDaysAgo = Date.now() - 3 * 86_400_000;
    return decisions
      .filter((record) => new Date(record.completedAt).getTime() >= threeDaysAgo)
      .map((record) => record.selectedId);
  }, [decisions]);
  const selectedOption = homeResult?.primary.option;
  const dishDisplay = selectedOption ? formatDishDisplay(selectedOption.name) : null;
  const poolLabel = !hasPool
    ? "还没有可用的默认池"
    : `${demoMode ? "演示默认池" : "当前默认池"}：晚餐 · ${poolOptions.length} 个选项`;
  const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const activateDemo = () => {
    setDemoMode(true);
    setHomeResult(null);
    setShownIds([]);
    setDicePhase("idle");
  };

  const rollDice = (extraExclusions: string[] = []) => {
    if (dicePhase === "rolling" || !hasPool) return;
    const excludedIds = Array.from(new Set([...shownIds, ...extraExclusions]));
    const nonRecentPool = poolOptions.filter((option) => !recentIds.includes(option.id));
    const eligiblePool = nonRecentPool.length > 0 ? nonRecentPool : poolOptions;
    const nextResult = recommend(eligiblePool, currentContext, { excludeIds: excludedIds })
      ?? recommend(eligiblePool, currentContext);
    if (!nextResult) return;

    const nextValue = (worldlineHash(nextResult.primary.option.id) % 6) + 1;
    setDicePhase("rolling");
    if (diceTimerRef.current !== null) window.clearTimeout(diceTimerRef.current);
    diceTimerRef.current = window.setTimeout(() => {
      setDiceValue(nextValue);
      setHomeResult(nextResult);
      setShownIds(excludedIds);
      setDicePhase("result");
      diceTimerRef.current = null;
    }, 1420);
  };

  const rerollDice = () => {
    if (homeResult) rollDice([homeResult.primary.option.id]);
  };

  const acceptChoice = async () => {
    if (!homeResult || isSavingChoice) return;
    setIsSavingChoice(true);
    try {
      await saveDecision({
        context: currentContext,
        result: homeResult,
        selected: homeResult.primary,
        selectionMode: "recommended",
        shownIds,
      });
      setDicePhase("accepted");
    } finally {
      setIsSavingChoice(false);
    }
  };

  useEffect(() => () => {
    if (diceTimerRef.current !== null) window.clearTimeout(diceTimerRef.current);
  }, []);

  return (
    <div className="life-home">
      <header className="life-nav">
        <a className="life-brand" href="#top" aria-label="Default Life 首页">
          <PixelDie compact animated={false} />
          <span>Default Life</span>
        </a>
        <nav className="life-nav-links" aria-label="首页导航">
          <a href="#how-it-works">功能介绍</a>
          <a href="#scenarios">使用场景</a>
          <a href="#about">关于我</a>
          <button type="button" onClick={onOpenDefaults}>开始使用</button>
        </nav>
      </header>

      <section className="life-hero" id="top" aria-labelledby="home-title">
        <div className="life-copy">
          <p className="life-kicker">PERSONAL LIFE OPERATING SYSTEM</p>
          <h1 id="home-title"><span>预制人生</span><em>Default Life</em></h1>
          <p className="life-question">今天不想再想什么？</p>
          <div className="life-copy-blocks">
            <p>先写下你的默认值，<br />让系统替你跳过重复选择。</p>
            <p>它不会替你决定人生，<br />只会在你允许的范围内，<br />帮你减少不必要的消耗。</p>
          </div>
          <div className="life-actions">
            <button className="life-button life-button-primary" type="button" onClick={onOpenDefaults} title="从你的历史选择开始">
              建立默认规则 <ArrowRight size={17} weight="bold" />
            </button>
            <button className="life-button life-button-secondary" type="button" onClick={activateDemo}>查看演示</button>
          </div>
        </div>

        <div className="life-dice-column" aria-label="默认池抽取器">
          <button
            className="life-die-trigger"
            type="button"
            onClick={() => rollDice()}
            disabled={!hasPool || dicePhase === "rolling"}
            aria-label={hasPool ? "从默认池中掷骰抽取今天的选择" : "还没有可用的默认池"}
            title={hasPool ? "只从当前默认池中选择" : "先建立默认池后再开始"}
          >
            <PixelDie
              value={diceValue}
              rolling={dicePhase === "rolling"}
              resultVisible={dicePhase === "result" || dicePhase === "accepted"}
            />
          </button>
          <p className="life-dice-status" aria-live="polite">
            {dicePhase === "rolling"
              ? "命运正在生成中…"
              : dicePhase === "result" || dicePhase === "accepted"
                ? `今日世界线 · 结果 ${diceValue}`
                : "只从你允许的选项中抽取"}
          </p>
          <span className="life-pool-status" data-demo={demoMode}>{poolLabel}</span>
          <p className="life-boundary-note">随机发生在你的边界之内。</p>
        </div>

        <aside className="life-choice-card" data-state={dicePhase} aria-label="今日选择">
          <header><span>今日选择</span><span aria-hidden="true">···</span></header>
          {!hasPool ? (
            <div className="life-choice-empty">
              <strong>建立默认池后，<br />系统会从你允许的选项中替你抽取一个结果。</strong>
              <p>不是替你决定人生，只替你跳过重复选择。</p>
              <button className="life-card-button" type="button" onClick={activateDemo}>使用示例默认池</button>
            </div>
          ) : !selectedOption ? (
            <div className="life-choice-empty">
              {demoMode && <span className="life-demo-badge">演示数据</span>}
              <strong>等待抽取</strong>
              <p>默认池已准备好。点击中间骰子，从符合今天状态的选项中选择。</p>
              <button className="life-card-button" type="button" onClick={() => rollDice()}>开始抽取</button>
            </div>
          ) : (
            <div className="life-choice-result">
              {demoMode && <span className="life-demo-badge">演示数据</span>}
              <div className="life-choice-food"><FoodSprite name={selectedOption.name} size="lg" /></div>
              <h2 title={dishDisplay?.rawDishName}>{dishDisplay?.displayDishName}</h2>
              {dishDisplay && dishDisplay.displayTags.length > 0 && (
                <div className="life-choice-tags" aria-label="菜品标签">
                  {dishDisplay.displayTags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
              <p>从「晚餐默认池」中选择</p>
              <span className="life-choice-reason">符合：40 元以内 / 热食 / 已避开近期重复</span>
              {dicePhase === "accepted" ? (
                <>
                  <footer><CheckCircle size={16} weight="fill" /> 已接受</footer>
                  <p className="life-accepted-note">今天已经少做了一个重复决定。</p>
                </>
              ) : (
                <div className="life-choice-actions">
                  <button className="life-card-button" type="button" onClick={acceptChoice} disabled={isSavingChoice}>
                    {isSavingChoice ? "正在记录…" : "接受这个选择"}
                  </button>
                  <div>
                    <button className="life-reroll-button" type="button" onClick={rerollDice}><ArrowCounterClockwise size={14} /> 再掷一次</button>
                    <button className="life-rule-link" type="button" onClick={onOpenDefaults}>查看规则</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </section>

      <section className="life-system-section" id="scenarios" aria-labelledby="life-system-title">
        <header className="life-system-heading">
          <p>YOUR DEFAULT SYSTEM</p>
          <h2 id="life-system-title">系统如何认识你的默认值</h2>
          <span>每一次确认、拒绝和修改，都会让规则更接近你。</span>
        </header>
        <div className="life-dashboard" aria-label="生活系统概览">
          <button className="life-mini-card" type="button" onClick={onOpenDefaults}>
            <h2><Cards size={19} /> 我的默认池</h2>
            <p>管理早餐、午餐、晚餐和其他重复选择。</p>
            <div className="life-tags">
              {["早餐", "午餐", "晚餐", "饮品", "购物", "娱乐", "出行", "…"].map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </button>
          <button className="life-mini-card" type="button" onClick={onBegin}>
            <h2><Smiley size={20} /> 今日状态</h2>
            <p>用精力、时间和预算调整今天的筛选条件。</p>
            <dl className="life-state-list">
              <div><dt><Lightning size={16} weight="fill" /> 精力</dt><dd>中等</dd></div>
              <div><dt><Wallet size={16} weight="fill" /> 预算</dt><dd>40 元以内</dd></div>
              <div><dt><Sun size={16} weight="fill" /> 天气</dt><dd>晴天</dd></div>
            </dl>
          </button>
          <button className="life-mini-card" type="button" onClick={onOpenHistory}>
            <h2><ClockCounterClockwise size={19} /> 最近选择</h2>
            <p>查看已经接受、拒绝和重新选择的记录。</p>
            <div className="life-recent-choice">
              <span>{lastDecision ? new Date(lastDecision.completedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : latestImportedCandidate ? "刚刚导入" : "还没有记录"}</span>
              <strong>{lastDecision ? `已接受：${lastDecision.selectedName}` : latestImportedCandidate ? `已记录：${latestImportedCandidate.name}${latestImportedCandidate.paidAmount ?? latestImportedCandidate.unitPrice ? ` · ¥${latestImportedCandidate.paidAmount ?? latestImportedCandidate.unitPrice}` : ""}` : "下一次接受会出现在这里"}</strong>
            </div>
            <div className="life-recent-secondary">{latestImport?.ruleDecision === "accepted" && latestImport.ruleSuggestion ? `新规则：${latestImport.ruleSuggestion.rule}` : "接受后会更新偏好和最近选择。"}</div>
          </button>
          <button className="life-mini-card" type="button" onClick={onOpenHistory}>
            <h2><Compass size={19} /> 生活轨迹</h2>
            <p>观察你的选择如何逐渐形成稳定偏好。</p>
            <div className="life-trail" aria-label="近期选择变化趋势"><i /><i /><i /><i /><i /><i /></div>
          </button>
        </div>
      </section>

      <LifeAssistantIp
        assetBasePath={assetBasePath}
        onOpenDefaults={onOpenDefaults}
        onUpdateToday={onBegin}
        onUseExampleOrder={onOpenImport}
      />

      <section className="life-afterword" id="how-it-works">
        <div><strong>设定默认池</strong><span>留下真正会反复选择的东西。</span></div>
        <div><strong>描述今天状态</strong><span>预算、天气和精力就够了。</span></div>
        <div><strong>保留最后决定权</strong><span>你可以接受、重掷，或回来修改规则。</span></div>
      </section>

      <footer className="life-about" id="about">你的选择，你的规则。不是替你决定人生，只是替你跳过那些不值得消耗注意力的小选择。</footer>
    </div>
  );
}

function HomeView({
  options,
  decisions,
  imports,
  onBegin,
  onOpenDefaults,
}: {
  options: FoodOption[];
  decisions: DecisionRecord[];
  imports: LifeImportRecord[];
  onBegin: () => void;
  onOpenDefaults: () => void;
}) {
  const [worldlineDay, setWorldlineDay] = useState("default-life");
  const [worldlineOffset, setWorldlineOffset] = useState(0);
  const [character, setCharacter] = useState<"girl" | "boy">("girl");
  const [diceValue, setDiceValue] = useState(5);
  const [dicePhase, setDicePhase] = useState<"idle" | "rolling" | "result">("idle");
  const diceTimerRef = useRef<number | null>(null);
  const activeOptions = options.filter((option) => option.active);
  const lastDecision = [...decisions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const latestImport = [...imports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latestImportedCandidate = latestImport?.candidates[0];
  const canBegin = activeOptions.length > 0;
  const previewOption = activeOptions.find((option) => option.id === lastDecision?.selectedId) ?? activeOptions[0];
  const dailySeed = useMemo(() => worldlineHash(worldlineDay), [worldlineDay]);
  const worldlineNumber = String((dailySeed + worldlineOffset * 48271) % 1_000_000).padStart(6, "0");
  const worldlineOption = activeOptions.length > 0
    ? activeOptions[(dailySeed + worldlineOffset) % activeOptions.length]
    : undefined;
  const selectedOption = worldlineOption ?? previewOption;
  const assetBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const startToday = canBegin ? onBegin : onOpenDefaults;
  const isDiceRolling = dicePhase === "rolling";

  const rollDice = () => {
    if (isDiceRolling) return;
    const nextValue = Math.floor(Math.random() * 6) + 1;
    setDicePhase("rolling");
    if (diceTimerRef.current !== null) window.clearTimeout(diceTimerRef.current);
    diceTimerRef.current = window.setTimeout(() => {
      setDiceValue(nextValue);
      setWorldlineOffset((current) => current + nextValue);
      setDicePhase("result");
      diceTimerRef.current = null;
    }, 1420);
  };

  useEffect(() => {
    setWorldlineDay(localDateKey());
    setWorldlineOffset(0);
  }, []);

  useEffect(() => () => {
    if (diceTimerRef.current !== null) window.clearTimeout(diceTimerRef.current);
  }, []);

  return (
    <div className="p1-home screen-enter">
      <header className="p1-nav">
        <a className="p1-brand" href="#top" aria-label="Default Life 首页">
          <PixelDie compact animated={false} />
          <span>Default Life</span>
        </a>
        <nav className="p1-nav-links" aria-label="首页导航">
          <a href="#how-it-works">功能介绍</a>
          <a href="#scenarios">使用场景</a>
          <a href="#about">关于我</a>
          <button type="button" onClick={startToday}>开始使用</button>
        </nav>
      </header>

      <section className="p1-hero" id="top" aria-labelledby="home-title">
        <div className="p1-hero-copy">
          <p className="p1-kicker">PERSONAL LIFE OPERATING SYSTEM</p>
          <h1 id="home-title"><span>预制人生</span><em>Default Life</em></h1>
          <p className="p1-question">今天不想再想什么？</p>
          <div className="p1-copy-blocks">
            <p>先写下你的默认值，<br />让系统替你减少重复选择。</p>
            <p>不是替你决定人生。<br />只是帮你跳过那些<br />不值得消耗注意力的小选择。</p>
          </div>
          <div className="p1-actions">
            <button className="p1-button p1-button-primary" type="button" onClick={startToday}>
              开始创建我的默认人生 <ArrowRight size={17} weight="bold" />
            </button>
            <button
              className="p1-button p1-button-secondary"
              type="button"
              onClick={rollDice}
              disabled={isDiceRolling}
            >
              掷一次骰子
            </button>
          </div>
        </div>

        <div className="p1-dice-column" aria-label="命运生成器">
          <button
            className="p1-die-trigger"
            type="button"
            onClick={rollDice}
            disabled={isDiceRolling}
            aria-label="掷骰子，生成今天的世界线和点数"
            title={`今天的世界线 #${worldlineNumber}`}
          >
            <PixelDie
              value={diceValue}
              rolling={isDiceRolling}
              resultVisible={dicePhase === "result"}
            />
          </button>
          <p className="p1-dice-status" aria-live="polite">
            {isDiceRolling
              ? "命运正在生成中…"
              : worldlineOffset === 0
                ? "把重复选择，交给系统。"
                : `今日世界线 #${worldlineNumber} · 骰子结果 ${diceValue}`}
          </p>
        </div>

        <aside className="p1-choice-card" aria-label="今日选择">
          <header><span>今日选择</span><span aria-hidden="true">•••</span></header>
          <div className="p1-choice-food">
            <img
              className="p1-choice-food-image"
              src={`${assetBasePath}/assets/pixel-malatang-bowl.png`}
              alt="一碗麻辣烫像素插画"
            />
          </div>
          <h2>{selectedOption?.name ?? "楼下麻辣烫"}</h2>
          <p>已从「美食默认池」中选择</p>
          <footer><CheckCircle size={16} weight="fill" /> 已决定</footer>
        </aside>
      </section>

      <section className="p1-dashboard" id="scenarios" aria-label="生活系统概览">
        <article className="p1-mini-card">
          <h2><Cards size={19} /> 我的默认池</h2>
          <p>记录你经常选择的东西。</p>
          <div className="p1-tags">
            {["早餐", "午餐", "晚餐", "饮品", "购物", "娱乐", "出行", "…"].map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </article>
        <article className="p1-mini-card">
          <h2><Smiley size={20} /> 今日状态</h2>
          <p>今天的：</p>
          <dl className="p1-state-list">
            <div><dt><Lightning size={16} weight="fill" /> 精力</dt><dd>中等</dd></div>
            <div><dt><Wallet size={16} weight="fill" /> 预算</dt><dd>¥30</dd></div>
            <div><dt><Sun size={16} weight="fill" /> 天气</dt><dd>晴天</dd></div>
          </dl>
        </article>
        <article className="p1-mini-card">
          <h2><ClockCounterClockwise size={19} /> 最近选择</h2>
          <p>过去的决定记录。</p>
          <div className="p1-recent-choice">
            <span>{latestImportedCandidate ? "刚刚导入" : lastDecision ? new Date(lastDecision.completedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "今天"}</span>
            <strong>{latestImportedCandidate ? `已记录：${latestImportedCandidate.name}${latestImportedCandidate.paidAmount ?? latestImportedCandidate.unitPrice ? ` · ¥${latestImportedCandidate.paidAmount ?? latestImportedCandidate.unitPrice}` : ""}` : lastDecision ? `午餐 → ${previewOption?.name ?? "默认选择"}` : `午餐 → ${selectedOption?.name ?? "等待选择"}`}</strong>
          </div>
          <div className="p1-recent-secondary">{latestImport?.ruleDecision === "accepted" && latestImport.ruleSuggestion ? `新规则：${latestImport.ruleSuggestion.rule}` : "昨天　晚餐 → 番茄牛腩饭"}</div>
        </article>
        <article className="p1-mini-card">
          <h2><Compass size={19} /> 生活轨迹</h2>
          <p>不是预测未来。<br />只是记录你的选择。</p>
          <div className="p1-trail" aria-label="近期选择变化趋势"><i /><i /><i /><i /><i /><i /></div>
        </article>
        <aside className="p1-character-area" aria-label="生活角色切换">
          <div className="p1-character-switch" role="group" aria-label="选择角色">
            <button type="button" className={character === "boy" ? "is-active" : ""} onClick={() => setCharacter("boy")}>男孩</button>
            <button type="button" className={character === "girl" ? "is-active" : ""} onClick={() => setCharacter("girl")}>女孩</button>
          </div>
          <div className="p1-character-sprite" data-character={character} data-avatar-slot="default-life-companion">
            <img
              src={`${assetBasePath}/assets/life-character-${character}-typing.png`}
              alt={character === "girl" ? "棕色长发、眼镜、猫耳和黑色穿搭的成年女性像素角色正在敲电脑" : "棕发蓝色上衣的成年男性像素角色正在敲电脑"}
            />
            <span className="p1-typing-hands" aria-hidden="true" />
          </div>
        </aside>
      </section>

      <section className="p1-afterword" id="how-it-works">
        <div><strong>设定默认池</strong><span>留下真正会反复选择的东西。</span></div>
        <div><strong>描述今天状态</strong><span>预算、天气和精力就够了。</span></div>
        <div><strong>让系统给出答案</strong><span>你始终保留最后的决定权。</span></div>
      </section>

      <footer className="p1-about" id="about">生活不必每次从零开始。把重复交给系统，把精力留给重要的事情。</footer>
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
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return (
    <section className="context-page screen-enter">
      <button className="context-back" onClick={onBack}>
        <ArrowRight size={17} className="rotate-180" /> 返回
      </button>

      <header className="context-header">
        <div>
          <p className="context-kicker">描述现在</p>
          <h1>不用答得很精确</h1>
          <p className="context-intro">默认值已经选好，只修改今天有变化的部分即可。</p>
        </div>
        <aside className="context-system-note" aria-label="当前决策方式">
          <span className="context-system-mark" aria-hidden="true" />
          <p>系统只读取今天的状态</p>
          <strong>答案仍然来自你的默认池</strong>
        </aside>
      </header>

      <div className="context-grid">
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

      <footer className="context-footer">
        <p>推荐只在你设定的选择池内发生。</p>
        <button className="context-submit" onClick={onSubmit}>
          给我一个答案 <Sparkle size={18} weight="fill" />
        </button>
      </footer>
    </section>
  );
}

function ContextField({ icon: Icon, title, children }: { icon: typeof Wallet; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="context-field">
      <legend className="sr-only">{title}</legend>
      <div className="context-field-title">
        <Icon size={18} weight="regular" />
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
    <div className="context-segmented">
      {options.map((option) => (
        <button key={String(option.id)} className="context-segment" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
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
