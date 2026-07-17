"use client";

import { CaretUp, GearSix, X } from "@phosphor-icons/react";
import { useState } from "react";

export function LifeAssistantIp({
  assetBasePath = "",
  onOpenDefaults,
  onUpdateToday,
  onUseExampleOrder,
}: {
  assetBasePath?: string;
  onOpenDefaults: () => void;
  onUpdateToday: () => void;
  onUseExampleOrder: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <aside className={`life-assistant-ip ${isOpen ? "is-open" : "is-collapsed"}`} aria-label="Default Life 像素助手">
      <div className="life-assistant-shell">
        <div className="life-assistant-topbar">
          <span className="life-assistant-status"><i aria-hidden="true" /> Life</span>
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
              {isOpen ? <X size={15} weight="bold" /> : <CaretUp size={15} weight="bold" />}
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
            <div className="life-assistant-stage">
              <div className="life-assistant-copy">
                <span>正在整理默认规则</span>
                <strong>今天的选择，已经在你的边界之内。</strong>
                <p>系统只在你留下的偏好范围内做决定。</p>
              </div>
              <div className="life-assistant-art" data-avatar-slot="default-life-companion">
                <img src={`${assetBasePath}/assets/assistant-ip/workstation.png`} alt="正在电脑前工作的像素生活助手" />
                <span className="life-assistant-typing" aria-label="正在输入" />
              </div>
            </div>

            <div className="life-assistant-actions" aria-label="Life 助手快捷入口">
              <button type="button" onClick={() => { onOpenDefaults(); close(); }}>查看我的规则</button>
              <button type="button" onClick={() => { onUpdateToday(); close(); }}>更新今日状态</button>
              <button type="button" onClick={() => { onUseExampleOrder(); close(); }}>使用示例订单</button>
              <button type="button" onClick={() => { document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" }); close(); }}>如何使用</button>
            </div>
          </>
        ) : (
          <button className="life-assistant-collapsed" type="button" onClick={() => setIsOpen(true)}>
            <span className="life-assistant-collapsed-art"><img src={`${assetBasePath}/assets/assistant-ip/workstation.png`} alt="展开 Default Life 像素助手" /></span>
            <span className="life-assistant-collapsed-copy"><b>Life</b><small>正在整理你的默认规则</small><em><i aria-hidden="true" /> 在线</em></span>
          </button>
        )}
      </div>
    </aside>
  );
}
