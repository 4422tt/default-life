type FoodSpriteSize = "sm" | "md" | "lg";

function foodVariant(name: string) {
  if (/炸鸡|小食|鸡排|鸡翅/.test(name)) return "fried";
  if (/沙拉|轻食|蔬菜/.test(name)) return "salad";
  if (/麻辣烫|火锅|冒菜/.test(name)) return "hotpot";
  if (/拉面|米线|面|粉/.test(name)) return "noodle";
  return "rice";
}

export function FoodSprite({ name, size = "md" }: { name: string; size?: FoodSpriteSize }) {
  return (
    <span className="food-sprite" data-food={foodVariant(name)} data-size={size} role="img" aria-label={`${name} 像素食物图标`}>
      <span className="food-sprite-shadow" />
      <span className="food-sprite-vessel" />
      <span className="food-sprite-main" />
      <span className="food-sprite-detail" />
      <span className="food-sprite-garnish" />
    </span>
  );
}

export function PixelDie({
  compact = false,
  animated = true,
  shifting = false,
  rolling = false,
  resultVisible = false,
  value = 5,
}: {
  compact?: boolean;
  animated?: boolean;
  shifting?: boolean;
  rolling?: boolean;
  resultVisible?: boolean;
  value?: number;
}) {
  if (compact) {
    return (
      <span
        className="pixel-die"
        data-compact="true"
        data-animated={animated}
        data-shifting={shifting}
        role="img"
        aria-label="黑色像素骰子"
      >
        <span className="pixel-die-shadow" />
        <span className="pixel-die-body">
          <span className="pixel-pip pixel-pip-1" />
          <span className="pixel-pip pixel-pip-2" />
          <span className="pixel-pip pixel-pip-3" />
          <span className="pixel-pip pixel-pip-4" />
          <span className="pixel-pip pixel-pip-5" />
        </span>
      </span>
    );
  }

  return (
    <span
      className="pixel-die pixel-die-reference"
      data-compact="false"
      data-animated={animated}
      data-rolling={rolling || shifting}
      data-result-visible={resultVisible}
      data-value={value}
      role="img"
      aria-label={`黑色像素骰子，当前点数 ${value}`}
    >
      <span className="pixel-die-cube" aria-hidden="true">
        <DieFace side="front" value={value} />
        <DieFace side="back" value={oppositeFace(value)} />
        <DieFace side="right" value={rightFace(value)} />
        <DieFace side="left" value={leftFace(value)} />
        <DieFace side="top" value={topFace(value)} />
        <DieFace side="bottom" value={bottomFace(value)} />
      </span>
    </span>
  );
}

const pipPositions = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
  } as const satisfies Record<number, readonly string[]>;

function safeDieValue(value: number) {
  return Math.min(6, Math.max(1, Math.round(value))) as keyof typeof pipPositions;
}

function oppositeFace(value: number) {
  return 7 - safeDieValue(value);
}

function rightFace(value: number) {
  return ((safeDieValue(value) + 1) % 6) + 1;
}

function leftFace(value: number) {
  return ((safeDieValue(value) + 3) % 6) + 1;
}

function topFace(value: number) {
  return ((safeDieValue(value) + 4) % 6) + 1;
}

function bottomFace(value: number) {
  return ((safeDieValue(value) + 2) % 6) + 1;
}

function DieFace({ side, value }: { side: "front" | "back" | "right" | "left" | "top" | "bottom"; value: number }) {
  const safeValue = safeDieValue(value);

  return (
    <span className={`pixel-die-face pixel-die-face-${side}`} data-face-value={safeValue}>
      {pipPositions[safeValue].map((position) => (
        <span className={`pixel-cube-pip pixel-cube-pip-${position}`} key={position} />
      ))}
    </span>
  );
}
