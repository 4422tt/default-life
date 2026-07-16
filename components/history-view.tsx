"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle,
  ClockCounterClockwise,
  ForkKnife,
  Path,
  Sparkle,
  TrendUp,
} from "@phosphor-icons/react";
import { FoodSprite } from "@/components/game-visuals";
import { contextLabels, feedbackLabels, formatShortDate } from "@/lib/labels";
import type { DecisionRecord, LifeImportRecord } from "@/lib/types";

interface HistoryViewProps {
  decisions: DecisionRecord[];
  imports: LifeImportRecord[];
}

type TimelineEntry =
  | { kind: "decision"; at: string; decision: DecisionRecord; choiceNumber: number }
  | { kind: "import"; at: string; record: LifeImportRecord };

export function HistoryView({ decisions, imports }: HistoryViewProps) {
  const [trajectoryOpen, setTrajectoryOpen] = useState(false);
  const sorted = [...decisions].sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  if (trajectoryOpen) {
    return <LifeTrajectory decisions={decisions} imports={imports} onBack={() => setTrajectoryOpen(false)} />;
  }

  return (
    <section className="screen-enter mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-10 md:pt-10">
      <div>
        <p className="mb-2 text-sm font-semibold text-[var(--accent-strong)]">选择历史</p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">看见默认值怎么变化</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)] md:text-base">
          每次推荐都保存当时的情境和评分版本。删除选项也不会抹掉过去的选择。
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="app-surface mt-8 grid min-h-80 place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <ClockCounterClockwise size={28} />
            </div>
            <h2 className="mt-5 text-xl font-semibold">还没有选择记录</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">完成第一次推荐后，这里会留下当时的答案。</p>
            <button className="app-button app-button-quiet mt-5 text-sm" onClick={() => setTrajectoryOpen(true)}>
              我的人生轨迹 <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            {sorted.map((decision, index) => (
              <article key={decision.id} className={`app-surface p-5 md:p-6 ${index === 0 ? "app-surface-raised" : ""}`}>
                <div className="flex items-start gap-4">
                  <FoodSprite name={decision.selectedName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-[var(--muted)]">{formatShortDate(decision.completedAt)}</p>
                        <h2 className="mt-1 truncate text-xl font-semibold">{decision.selectedName}</h2>
                      </div>
                      {decision.feedback && (
                        <span className="option-chip" data-accent={decision.feedback === "great"}>
                          <CheckCircle size={14} />
                          {feedbackLabels[decision.feedback]}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {contextLabels(decision.context).slice(0, 4).map((label) => (
                        <span className="option-chip" key={label}>{label}</span>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                      {decision.selectionMode === "recommended" && "接受了主推荐。"}
                      {decision.selectionMode === "alternative" && `没有选主推荐“${decision.recommendedName}”，改选了备选。`}
                      {decision.selectionMode === "manual" && `跳过主推荐“${decision.recommendedName}”，自己做了决定。`}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="app-soft h-fit p-5 lg:sticky lg:top-8">
            <p className="text-sm font-semibold">这不是效率报表</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              历史只负责帮助你修正默认值，不评价选择是否正确。反馈会有限度地影响下次排序。
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-[var(--surface-raised)] p-4">
                <dt className="text-xs text-[var(--muted)]">完成选择</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{sorted.length}</dd>
              </div>
              <div className="rounded-[12px] bg-[var(--surface-raised)] p-4">
                <dt className="text-xs text-[var(--muted)]">觉得很准</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{sorted.filter((item) => item.feedback === "great").length}</dd>
              </div>
            </dl>
            <button className="app-button app-button-quiet mt-5 w-full justify-between border-t border-[var(--line)] px-1 pt-5 text-sm" onClick={() => setTrajectoryOpen(true)}>
              <span className="flex items-center gap-2"><Path size={18} /> 我的人生轨迹</span>
              <ArrowRight size={16} />
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}

function LifeTrajectory({ decisions, imports, onBack }: HistoryViewProps & { onBack: () => void }) {
  const entries = useMemo(() => buildTimeline(decisions, imports), [decisions, imports]);
  const latestImport = [...imports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const uniqueChoices = new Set(decisions.map((decision) => decision.selectedName)).size;

  return (
    <section className="screen-enter mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-10 md:pt-10">
      <button className="app-button app-button-quiet -ml-3 min-h-10 px-3 text-sm" onClick={onBack}>
        <ArrowLeft size={17} /> 返回历史
      </button>

      <div className="mt-7 max-w-3xl">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">隐藏视图</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] md:text-6xl">我的人生轨迹</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">
          每天吃什么、选择了多少次、偏好如何变化，都在这里变成一条可以回看的时间线。
        </p>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          {entries.length === 0 ? (
            <div className="app-surface grid min-h-72 place-items-center p-8 text-center">
              <div><Path size={30} className="mx-auto text-[var(--accent-strong)]" /><h2 className="mt-5 text-xl font-semibold">轨迹还没有开始</h2><p className="mt-2 text-sm text-[var(--muted)]">完成一次选择或生活导入后，这里会出现第一个节点。</p></div>
            </div>
          ) : (
            <ol className="life-timeline" aria-label="人生选择时间线">
              {entries.map((entry) => (
                <li className="life-timeline-item" key={entry.kind === "decision" ? entry.decision.id : entry.record.id}>
                  <div className="life-timeline-icon">
                    {entry.kind === "decision" ? <ForkKnife size={18} /> : <Brain size={18} />}
                  </div>
                  <article className="app-surface p-5 md:p-6">
                    {entry.kind === "decision" ? (
                      <DecisionTimelineCard entry={entry} />
                    ) : (
                      <ImportTimelineCard record={entry.record} />
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-8 lg:h-fit">
          <section className="app-surface-raised p-5 md:p-6">
            <div className="flex items-start gap-3"><TrendUp size={22} className="mt-0.5 shrink-0 text-[var(--accent-strong)]" /><div><h2 className="font-semibold">轨迹摘要</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">这里记录趋势，不给生活打分。</p></div></div>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              <div className="app-soft p-4"><dt className="text-xs text-[var(--muted)]">完成选择</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{decisions.length}</dd></div>
              <div className="app-soft p-4"><dt className="text-xs text-[var(--muted)]">不同答案</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{uniqueChoices}</dd></div>
            </dl>
          </section>

          {latestImport && (
            <section className="app-soft p-5 md:p-6">
              <Sparkle size={21} className="text-[var(--accent-strong)]" />
              <p className="mt-4 text-xs text-[var(--muted)]">最近的生活画像</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] tabular-nums">{latestImport.profile.familiarDinnerShare}%</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">晚餐来自熟悉选项，关键词是 {latestImport.profile.keywords.join("、")}。</p>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

function DecisionTimelineCard({ entry }: { entry: Extract<TimelineEntry, { kind: "decision" }> }) {
  const decision = entry.decision;
  const preferenceChange = decision.feedback === "great"
    ? "偏好增强"
    : decision.feedback === "avoid"
      ? "进入 14 天冷却"
      : decision.feedback === "okay"
        ? "偏好保持"
        : "等待反馈";

  return (
    <>
      <p className="text-xs font-medium text-[var(--muted)]">{formatShortDate(decision.completedAt)}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-xl font-semibold">{decision.selectedName}</h2>
        <span className="option-chip" data-accent={decision.feedback === "great"}>{preferenceChange}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">这是时间线里的第 {entry.choiceNumber} 次“{decision.selectedName}”。</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {contextLabels(decision.context).slice(0, 3).map((label) => <span className="option-chip" key={label}>{label}</span>)}
      </div>
    </>
  );
}

function ImportTimelineCard({ record }: { record: LifeImportRecord }) {
  const totalChoices = record.candidates.reduce((sum, candidate) => sum + (candidate.historyCount ?? candidate.frequency), 0);
  const summary = record.isDemo
    ? `已记录 ${record.candidates.length} 笔示例订单，累计 ${totalChoices} 次选择。`
    : `从 ${record.fileCount} 份截图中确认 ${record.candidates.length} 笔订单，累计 ${totalChoices} 次选择。`;
  const ruleStatus = record.ruleDecision === "accepted" && record.ruleSuggestion
    ? `已确认规则：${record.ruleSuggestion.rule}`
    : "订单已保存，默认规则仍由你确认。";
  return (
    <>
      <p className="text-xs font-medium text-[var(--muted)]">{formatShortDate(record.createdAt)}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-xl font-semibold">导入了一段过去的生活</h2>
        <span className="option-chip" data-accent="true">{record.isDemo ? "示例订单" : "订单整理"}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{summary}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{ruleStatus}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {record.candidates.map((candidate) => <span className="option-chip" key={candidate.id}>{candidate.name} {candidate.historyCount ?? candidate.frequency} 次</span>)}
      </div>
    </>
  );
}

function buildTimeline(decisions: DecisionRecord[], imports: LifeImportRecord[]): TimelineEntry[] {
  const counts = new Map<string, number>();
  const decisionEntries: TimelineEntry[] = [...decisions]
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((decision) => {
      const choiceNumber = (counts.get(decision.selectedName) ?? 0) + 1;
      counts.set(decision.selectedName, choiceNumber);
      return { kind: "decision", at: decision.completedAt, decision, choiceNumber };
    });
  const importEntries: TimelineEntry[] = imports.map((record) => ({ kind: "import", at: record.createdAt, record }));
  return [...decisionEntries, ...importEntries].sort((a, b) => b.at.localeCompare(a.at));
}
