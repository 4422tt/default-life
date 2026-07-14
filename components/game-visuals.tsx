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
  value = 5,
}: {
  compact?: boolean;
  animated?: boolean;
  shifting?: boolean;
  rolling?: boolean;
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
      className="pixel-die pixel-die-illustration"
      data-compact="false"
      data-animated={animated}
      data-rolling={rolling || shifting}
      role="img"
      aria-label={`黑色像素骰子，当前点数 ${value}`}
    >
      <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/pixel-die-isometric.png`} alt="" />
    </span>
  );
}
