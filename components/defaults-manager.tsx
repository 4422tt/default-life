"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeSlash,
  Fire,
  HeartStraight,
  PencilSimple,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import { energyLabels, kindLabels, priceLabels, weatherLabels } from "@/lib/labels";
import {
  addFoodOption,
  deleteFoodOption,
  type FoodOptionInput,
  updateFoodOption,
} from "@/lib/storage";
import type {
  Companion,
  Energy,
  FoodKind,
  FoodOption,
  HealthLevel,
  LoveLevel,
  PriceLevel,
  Weather,
} from "@/lib/types";

interface DefaultsManagerProps {
  options: FoodOption[];
  onImport: () => void;
}

const weatherValues: Weather[] = ["hot", "cold", "rain", "normal"];
const energyValues: Energy[] = ["low", "normal", "high"];
const companionValues: Companion[] = ["solo", "friends"];

export function DefaultsManager({ options, onImport }: DefaultsManagerProps) {
  const [editing, setEditing] = useState<FoodOption | null | undefined>(undefined);
  const activeCount = options.filter((option) => option.active).length;
  const sorted = useMemo(
    () => [...options].sort((a, b) => Number(b.active) - Number(a.active) || b.love - a.love),
    [options],
  );

  return (
    <section className="screen-enter mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-10 md:pt-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--accent-strong)]">我的默认池</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">把真正喜欢的留下来</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)] md:text-base">
            目前有 {activeCount} 个可推荐选项。你可以从过去的选择生成规则，也可以继续编辑每一个细节。
          </p>
        </div>
        <div className="self-start sm:text-right">
          <button className="app-button app-button-primary" onClick={onImport}>
            <Sparkle size={18} weight="fill" />
            导入我的生活
          </button>
          <p className="mt-2 max-w-xs text-xs leading-5 text-[var(--muted)]">上传过去的选择，让 AI 帮你生成默认规则</p>
        </div>
      </div>

      {options.some((option) => option.isSample) && (
        <div className="app-soft mt-7 flex items-start gap-3 p-4 text-sm leading-6 text-[var(--muted)]">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <PencilSimple size={16} />
          </span>
          <p>这里先放了几个示例，方便立即体验。编辑任意字段后，它就会成为你的真实默认值。</p>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="app-surface mt-8 grid min-h-72 place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <Sparkle size={28} weight="fill" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">还没有默认规则</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">从过去的选择开始，系统会先替你整理。</p>
            <button className="app-button app-button-primary mt-5" onClick={onImport}>
              导入我的生活 <ArrowRight size={17} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sorted.map((option) => (
            <OptionCard key={option.id} option={option} onEdit={() => setEditing(option)} />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <OptionDialog option={editing} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}

function OptionCard({ option, onEdit }: { option: FoodOption; onEdit: () => void }) {
  const handleDelete = async () => {
    if (window.confirm(`删除“${option.name}”？历史记录仍会保留当时的名称。`)) {
      await deleteFoodOption(option.id);
    }
  };

  return (
    <article className={`app-surface p-5 ${option.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="option-chip">{kindLabels[option.kind]}</span>
            {option.isSample && <span className="option-chip" data-accent="true">示例</span>}
            {option.craving && (
              <span className="option-chip" data-accent="true">
                <Fire size={13} weight="fill" /> 最近想吃
              </span>
            )}
          </div>
          <h2 className="mt-4 truncate text-xl font-semibold tracking-[-0.02em]">{option.name}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {priceLabels[option.priceLevel]} / 约 {option.etaMinutes} 分钟 / 选过 {option.choiceCount} 次
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[var(--accent-strong)]" aria-label={`喜欢程度 ${option.love} 星`}>
          <HeartStraight size={18} weight="fill" />
          <span className="text-sm font-bold">{option.love}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          className="app-button app-button-quiet min-h-10 px-3 text-sm"
          aria-pressed={option.craving}
          onClick={() => updateFoodOption(option.id, { craving: !option.craving })}
        >
          <Fire size={17} weight={option.craving ? "fill" : "regular"} />
          {option.craving ? "取消想吃" : "最近想吃"}
        </button>
        <button
          className="app-button app-button-quiet min-h-10 px-3 text-sm"
          aria-pressed={option.active}
          onClick={() => updateFoodOption(option.id, { active: !option.active })}
        >
          {option.active ? <Eye size={17} /> : <EyeSlash size={17} />}
          {option.active ? "推荐中" : "已隐藏"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button className="app-icon-button" aria-label={`编辑 ${option.name}`} onClick={onEdit}>
            <PencilSimple size={18} />
          </button>
          <button className="app-icon-button text-[var(--danger)]" aria-label={`删除 ${option.name}`} onClick={handleDelete}>
            <Trash size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function OptionDialog({ option, onClose }: { option: FoodOption | null; onClose: () => void }) {
  const [name, setName] = useState(option?.name ?? "");
  const [kind, setKind] = useState<FoodKind>(option?.kind ?? "delivery");
  const [priceLevel, setPriceLevel] = useState<PriceLevel>(option?.priceLevel ?? 2);
  const [love, setLove] = useState<LoveLevel>(option?.love ?? 4);
  const [health, setHealth] = useState<HealthLevel>(option?.health ?? 3);
  const [etaMinutes, setEtaMinutes] = useState(option?.etaMinutes ?? 25);
  const [weatherTags, setWeatherTags] = useState<Weather[]>(option?.weatherTags ?? weatherValues);
  const [energyTags, setEnergyTags] = useState<Energy[]>(option?.energyTags ?? energyValues);
  const [companionTags, setCompanionTags] = useState<Companion[]>(option?.companionTags ?? companionValues);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("请写下一个具体、可以直接执行的选项。 ");
      return;
    }
    if (weatherTags.length === 0 || energyTags.length === 0 || companionTags.length === 0) {
      setError("每组适用场景至少保留一个选项。 ");
      return;
    }

    setSaving(true);
    const input: FoodOptionInput = {
      name: name.trim(),
      kind,
      priceLevel,
      love,
      health,
      etaMinutes: Math.max(1, Math.min(180, etaMinutes)),
      weatherTags,
      energyTags,
      companionTags,
    };

    if (option) await updateFoodOption(option.id, input);
    else await addFoodOption(input);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="option-dialog-title">
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <div>
            <p className="text-xs font-semibold text-[var(--accent-strong)]">默认选项</p>
            <h2 id="option-dialog-title" className="mt-1 text-xl font-semibold">{option ? "编辑选项" : "添加选项"}</h2>
          </div>
          <button className="app-icon-button" aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <form className="space-y-7 p-5 md:p-7" onSubmit={handleSubmit}>
          <div>
            <label className="form-label" htmlFor="option-name">名称</label>
            <input
              id="option-name"
              className="form-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：A 店番茄牛腩饭"
              autoFocus
            />
            <p className="form-help">写到拿到推荐后可以直接下单或出发的程度。</p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="option-kind">类型</label>
              <select id="option-kind" className="form-select" value={kind} onChange={(event) => setKind(event.target.value as FoodKind)}>
                {(Object.keys(kindLabels) as FoodKind[]).map((value) => (
                  <option key={value} value={value}>{kindLabels[value]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="option-eta">预计时间</label>
              <div className="relative">
                <input
                  id="option-eta"
                  className="form-input pr-14"
                  type="number"
                  min="1"
                  max="180"
                  value={etaMinutes}
                  onChange={(event) => setEtaMinutes(Number(event.target.value))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">分钟</span>
              </div>
            </div>
          </div>

          <FieldGroup title="价格" help="用于匹配今天的预算，不代表价值判断。">
            <div className="segmented-control">
              {([1, 2, 3] as PriceLevel[]).map((value) => (
                <button key={value} type="button" className="segment" aria-pressed={priceLevel === value} onClick={() => setPriceLevel(value)}>
                  {priceLabels[value]}
                </button>
              ))}
            </div>
          </FieldGroup>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FieldGroup title="喜欢程度" help="这是推荐中权重最高的个人信号。">
              <Rating value={love} onChange={(value) => setLove(value as LoveLevel)} label="喜欢程度" />
            </FieldGroup>
            <FieldGroup title="清爽程度" help="先记录下来，当前版本不会替你定义健康。">
              <Rating value={health} onChange={(value) => setHealth(value as HealthLevel)} label="清爽程度" />
            </FieldGroup>
          </div>

          <FieldGroup title="适合的天气">
            <ToggleSet values={weatherValues} selected={weatherTags} labels={weatherLabels} onChange={setWeatherTags} />
          </FieldGroup>
          <FieldGroup title="适合的精力状态">
            <ToggleSet values={energyValues} selected={energyTags} labels={energyLabels} onChange={setEnergyTags} />
          </FieldGroup>
          <FieldGroup title="适合谁一起">
            <ToggleSet
              values={companionValues}
              selected={companionTags}
              labels={{ solo: "一个人", friends: "和朋友" }}
              onChange={setCompanionTags}
            />
          </FieldGroup>

          {error && <p className="rounded-[10px] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}

          <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:justify-end">
            <button type="button" className="app-button app-button-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="app-button app-button-primary" disabled={saving}>
              {saving ? "正在保存" : option ? "保存修改" : "加入默认池"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FieldGroup({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="form-label">{title}</legend>
      {children}
      {help && <p className="form-help">{help}</p>}
    </fieldset>
  );
}

function Rating({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="grid grid-cols-5 gap-2" aria-label={label}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          className="grid min-h-11 place-items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted)] data-[selected=true]:border-[var(--accent)] data-[selected=true]:bg-[var(--accent-soft)] data-[selected=true]:text-[var(--accent-strong)]"
          data-selected={rating <= value}
          aria-pressed={rating === value}
          aria-label={`${rating} 级`}
          onClick={() => onChange(rating)}
        >
          <HeartStraight size={17} weight={rating <= value ? "fill" : "regular"} />
        </button>
      ))}
    </div>
  );
}

function ToggleSet<T extends string>({
  values,
  selected,
  labels,
  onChange,
}: {
  values: T[];
  selected: T[];
  labels: Record<T, string>;
  onChange: (value: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            className="option-chip"
            data-accent={active}
            aria-pressed={active}
            onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])}
          >
            {labels[value]}
          </button>
        );
      })}
    </div>
  );
}
