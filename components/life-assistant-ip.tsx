"use client";

import { ChatDots, GearSix, X } from "@phosphor-icons/react";
import { useState } from "react";

type AssistantVariant = "chat" | "workstation" | "dock";

const variants: Array<{
  id: AssistantVariant;
  label: string;
  title: string;
  detail: string;
  image: string;
}> = [
  {
    id: "chat",
    label: "A",
    title: "聊天助手卡片型",
    detail: "用一句轻提示，把规则说清楚。",
    image: "chat.png",
  },
  {
    id: "workstation",
    label: "B",
    title: "小工作台型",
    detail: "默认形态。她正在整理你的默认规则。",
    image: "workstation.png",
  },
  {
    id: "dock",
    label: "C",
    title: "IP 停靠组件型",
    detail: "更轻的入口，适合在需要时再展开。",
    image: "dock.png",
  },
];

export function LifeAssistantIp({ assetBasePath = "" }: { assetBasePath?: string }) {
  const [activeVariant, setActiveVariant] = useState<AssistantVariant>("workstation");
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const active = variants.find((variant) => variant.id === activeVariant) ?? variants[1];

  return (
    <aside className={`life-assistant-ip ${isOpen ? "is-open" : "is-collapsed"}`} aria-label="Default Life 像素助手">
      <div className="life-assistant-shell">
        <div className="life-assistant-topbar">
          <span className="life-assistant-status"><i aria-hidden="true" /> Life assistant</span>
          <div className="life-assistant-top-actions">
            <button
              className="life-assistant-icon-button"
              type="button"
              aria-label="打开角色设置"
              aria-expanded={showSettings}
              onClick={() => setShowSettings((value) => !value)}
            >
              <GearSix size={15} weight="bold" />
            </button>
            <button
              className="life-assistant-icon-button"
              type="button"
              aria-label={isOpen ? "收起生活助手" : "展开生活助手"}
              onClick={() => setIsOpen((value) => !value)}
            >
              {isOpen ? <X size={15} weight="bold" /> : <ChatDots size={15} weight="fill" />}
            </button>
          </div>
          {showSettings && (
            <div className="life-assistant-settings" role="dialog" aria-label="角色设置">
              <strong>角色设置</strong>
              <span>当前角色：女生 IP</span>
              <button type="button" disabled>男生版本 · 即将开放</button>
            </div>
          )}
        </div>

        {isOpen ? (
          <>
            <div className={`life-assistant-stage is-${active.id}`}>
              <div className="life-assistant-copy">
                <span>{active.id === "workstation" ? "正在整理默认规则" : active.title}</span>
                <strong>{active.id === "workstation" ? "今天的选择，已经在你的边界之内。" : active.detail}</strong>
                <p>{active.id === "chat" ? "先留下真正会重复选择的东西，我来帮你记住。" : "系统只在你留下的偏好范围内做决定。"}</p>
              </div>
              <div className="life-assistant-art" data-avatar-slot="default-life-companion">
                <img src={`${assetBasePath}/assets/assistant-ip/${active.image}`} alt={`${active.title}中的像素生活助手`} />
                {active.id === "workstation" && <span className="life-assistant-typing" aria-label="正在输入" />}
              </div>
            </div>

            <div className="life-assistant-previews" aria-label="像素助手方案预览">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  className={activeVariant === variant.id ? "is-active" : ""}
                  type="button"
                  onClick={() => setActiveVariant(variant.id)}
                  aria-pressed={activeVariant === variant.id}
                >
                  <span className="life-assistant-preview-art">
                    <img src={`${assetBasePath}/assets/assistant-ip/${variant.image}`} alt="" />
                  </span>
                  <span><b>{variant.label}</b>{variant.id === "workstation" ? " 默认" : ""}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button className="life-assistant-collapsed" type="button" onClick={() => setIsOpen(true)}>
            <img src={`${assetBasePath}/assets/assistant-ip/workstation.png`} alt="展开 Default Life 像素助手" />
            <span><b>Life</b>助手</span>
          </button>
        )}
      </div>
    </aside>
  );
}
