import type { LifeImportAnalysis, LifeImportCandidate } from "@/lib/types";

export interface ImportImageDescriptor {
  name: string;
  size: number;
  type: string;
}

const candidateTemplates: Omit<LifeImportCandidate, "frequency">[] = [
  {
    id: "import-beef-rice",
    name: "番茄牛腩饭",
    kind: "delivery",
    priceLevel: 2,
    love: 5,
    health: 4,
    etaMinutes: 28,
    weatherTags: ["cold", "rain", "normal"],
    energyTags: ["low", "normal"],
    companionTags: ["solo", "friends"],
  },
  {
    id: "import-ramen",
    name: "日式豚骨拉面",
    kind: "restaurant",
    priceLevel: 2,
    love: 4,
    health: 3,
    etaMinutes: 30,
    weatherTags: ["cold", "rain", "normal"],
    energyTags: ["normal", "high"],
    companionTags: ["solo", "friends"],
  },
  {
    id: "import-malatang",
    name: "楼下麻辣烫",
    kind: "restaurant",
    priceLevel: 1,
    love: 4,
    health: 3,
    etaMinutes: 18,
    weatherTags: ["hot", "cold", "rain", "normal"],
    energyTags: ["low", "normal"],
    companionTags: ["solo", "friends"],
  },
];

export function analyzeLifeImages(images: ImportImageDescriptor[]): LifeImportAnalysis {
  const imageCount = Math.max(1, images.length);
  const frequencies = [imageCount * 4, imageCount * 2 + 2, imageCount * 2];

  return {
    candidates: candidateTemplates.map((candidate, index) => ({
      ...candidate,
      frequency: frequencies[index],
    })),
    profile: {
      windowDays: 90,
      familiarDinnerShare: 68,
      keywords: ["稳定", "高效", "低决策成本"],
      taste: "偏辣",
      budgetLabel: "中预算",
      dinnerPattern: "30 分钟内解决晚餐",
      weekdayRule: "快速解决",
      weekendRule: "探索新口味",
      insight: "你不是没有选择，只是你的生活已经形成了一套规则。",
    },
  };
}
