"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkle, X } from "@phosphor-icons/react";
import { analyzeLifeReport, type LifeReport, type NutritionSignal } from "@/lib/life-report";

type AnalysisState = "input" | "loading" | "report" | "error";

const REPORT_ERROR = "暂时无法分析，请稍后再试。";

const signalLabels: Record<NutritionSignal, "Low" | "Medium" | "High"> = {
  偏低: "Low",
  中等: "Medium",
  偏高: "High",
};

export function AiLifeReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<AnalysisState>("input");
  const [report, setReport] = useState<LifeReport | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "loading") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, state]);

  useEffect(() => {
    if (!open) return;
    setState("input");
    setReport(null);
    setErrorMessage("");
  }, [open]);

  if (!open) return null;

  const runAnalysis = async () => {
    if (!input.trim() || state === "loading") return;
    setState("loading");
    setErrorMessage("");
    try {
      const nextReport = await analyzeLifeReport(input);
      setReport(nextReport);
      setState("report");
    } catch {
      setErrorMessage(REPORT_ERROR);
      setState("error");
    }
  };

  return (
    <div
      className="life-report-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "loading") onClose();
      }}
    >
      <section className="life-report-sheet" role="dialog" aria-modal="true" aria-labelledby="life-report-title">
        <header className="life-report-header">
          <div>
            <p>AI LIFE REPORT</p>
            <h2 id="life-report-title">今日生活分析</h2>
          </div>
          <button className="life-report-close" type="button" onClick={onClose} disabled={state === "loading"} aria-label="关闭今日生活分析">
            <X size={20} />
          </button>
        </header>

        {state === "loading" ? (
          <div className="life-report-loading" aria-live="polite">
            <Sparkle size={21} weight="regular" />
            <strong>AI正在分析你的今日生活...</strong>
            <p>正在把今天的记录整理成一份轻量反馈。</p>
            <div className="life-report-loading-lines" aria-hidden="true"><i /><i /><i /></div>
          </div>
        ) : state === "report" && report ? (
          <LifeReportResult report={report} onAnalyzeAgain={() => setState("input")} />
        ) : (
          <div className="life-report-input-state">
            <p className="life-report-intro">不是健康考核。只是帮你看见今天的选择，给下一次少一点犹豫的参考。</p>
            <label htmlFor="life-report-foods">告诉我今天吃了什么</label>
            <textarea
              id="life-report-foods"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={"告诉我今天吃了什么，例如：\n麦当劳套餐、麻辣烫、奶茶、牛肉饭"}
              rows={5}
            />
            {state === "error" && <p className="life-report-error" role="alert">{errorMessage}</p>}
            <div className="life-report-input-footer">
              <span>所有结果均为约值与日常参考，不构成健康建议。</span>
              <button className="life-report-primary" type="button" onClick={runAnalysis} disabled={!input.trim()}>
                开始分析 <ArrowRight size={17} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function LifeReportResult({ report, onAnalyzeAgain }: { report: LifeReport; onAnalyzeAgain: () => void }) {
  const nutritionItems = [
    { label: "Protein", name: "蛋白质", value: report.nutritionSummary.protein },
    { label: "Carbs", name: "碳水", value: report.nutritionSummary.carbohydrate },
    { label: "Fat", name: "脂肪", value: report.nutritionSummary.fat },
  ];

  return (
    <div className="life-report-result">
      <section className="life-report-total" aria-label="今日摄入估算">
        <span>今日摄入</span>
        <strong>{report.totalCalories}</strong>
        <p>估算值，仅作为今天生活节奏的一点参考。</p>
      </section>

      <section className="life-report-foods" aria-labelledby="life-report-foods-title">
        <div className="life-report-section-heading">
          <span id="life-report-foods-title">今天吃了什么</span>
          <small>{report.foods.length} 项记录</small>
        </div>
        <ul>
          {report.foods.map((food) => (
            <li key={`${food.name}-${food.calories}`}>
              <div>
                <strong>{food.name}</strong>
                <span>{food.category}</span>
              </div>
              <em>{food.calories}</em>
            </li>
          ))}
        </ul>
      </section>

      <section className="life-report-nutrition" aria-labelledby="life-report-nutrition-title">
        <div className="life-report-section-heading">
          <span id="life-report-nutrition-title">今日状态</span>
          <small>轻量估算</small>
        </div>
        <div className="life-report-nutrition-grid">
          {nutritionItems.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.name}</strong>
              <em>{signalLabels[item.value]}</em>
              <small>{item.value}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="life-report-advice" aria-labelledby="life-report-advice-title">
        <div>
          <Sparkle size={18} weight="regular" />
          <span id="life-report-advice-title">AI 建议</span>
        </div>
        <p>{report.suggestion}</p>
      </section>

      <footer className="life-report-result-footer">
        <p>把重复选择交给 AI，把时间留给重要事情。</p>
        <button className="life-report-secondary" type="button" onClick={onAnalyzeAgain}>重新分析</button>
      </footer>
    </div>
  );
}
