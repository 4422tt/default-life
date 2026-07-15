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
      className="pixel-die pixel-die-cube"
      data-compact="false"
      data-animated={animated}
      data-rolling={rolling || shifting}
      data-result-visible={resultVisible}
      data-value={value}
      role="img"
      aria-label={`黑色像素骰子，当前点数 ${value}`}
    >
      <span className="pixel-die-ground-shadow" aria-hidden="true" />
      <span className="pixel-die-cube-anchor" aria-hidden="true">
        <span className="pixel-die-cube-inner">
          {diceFaces(value).map((face) => (
            <DiceFace key={face.side} side={face.side} value={face.value} />
          ))}
        </span>
      </span>
    </span>
  );
}

type DiceSide = "front" | "back" | "right" | "left" | "top" | "bottom";

function diceFaces(value: number): Array<{ side: DiceSide; value: number }> {
  const safeValue = Math.min(6, Math.max(1, Math.round(value)));
  const oppositePairs = [[1, 6], [2, 5], [3, 4]] as const;
  const remainingPairs = oppositePairs.filter((pair) => !(pair as readonly number[]).includes(safeValue));

  return [
    { side: "front", value: safeValue },
    { side: "back", value: 7 - safeValue },
    { side: "right", value: remainingPairs[0][0] },
    { side: "left", value: remainingPairs[0][1] },
    { side: "top", value: remainingPairs[1][0] },
    { side: "bottom", value: remainingPairs[1][1] },
  ];
}

function DiceFace({ side, value }: { side: DiceSide; value: number }) {
  const positions = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
  } as const;

  return (
    <span className={`pixel-die-face pixel-die-face-${side}`} data-face-value={value}>
      {positions[value as keyof typeof positions].map((position) => (
        <span className={`pixel-cube-pip pixel-cube-pip-${position}`} key={position} />
      ))}
    </span>
  );
}
