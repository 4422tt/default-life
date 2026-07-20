import { SlidersHorizontal } from "@phosphor-icons/react";
import { contextLabels } from "@/lib/labels";
import type { DecisionContext } from "@/lib/types";

interface TodayStateSummaryProps {
  context?: DecisionContext;
  onEdit: () => void;
}

export function TodayStateSummary({ context, onEdit }: TodayStateSummaryProps) {
  const labels = context ? contextLabels(context) : [];
  const hasState = labels.length > 0;

  return (
    <section className="today-state-summary" aria-labelledby="today-state-summary-title">
      <div className="today-state-summary-copy">
        <div className="today-state-summary-heading">
          <span className="today-state-summary-icon" aria-hidden="true">
            <SlidersHorizontal size={18} />
          </span>
          <h2 id="today-state-summary-title">今日状态</h2>
        </div>
        {hasState ? (
          <>
            <div className="today-state-summary-chips" aria-label="今天的筛选条件">
              {labels.map((label) => <span key={label}>{label}</span>)}
            </div>
            <p>系统会根据这些条件，从默认池中筛选今天更合适的选项。</p>
          </>
        ) : (
          <p>你还没有设置今天的状态。系统会先根据你的状态，再从默认池中筛选更合适的选项。</p>
        )}
      </div>
      <button className="app-button app-button-secondary today-state-summary-action" type="button" onClick={onEdit}>
        {hasState ? "修改" : "去设置"}
      </button>
    </section>
  );
}
