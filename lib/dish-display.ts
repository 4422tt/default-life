export interface DishDisplay {
  rawDishName: string;
  displayDishName: string;
  displayTags: string[];
}

const tagTerms = ["加量", "大份", "少辣", "双蛋", "微辣", "免辣", "少油", "无糖", "去冰"];

/**
 * Keeps imported order data untouched while making noisy OCR-style names usable
 * in compact product surfaces such as the home recommendation card.
 */
export function formatDishDisplay(rawDishName: string): DishDisplay {
  const raw = rawDishName.trim();
  if (!raw) return { rawDishName, displayDishName: "未命名选择", displayTags: [] };

  const displayTags: string[] = [];
  const collectTag = (value: string) => {
    const tag = value.replace(/[【】\[\]()（）]/g, "").trim();
    if (tag && tag.length <= 8 && !displayTags.includes(tag)) displayTags.push(tag);
  };

  let normalized = raw.replace(/[【\[]([^】\]]+)[】\]]/g, (_match, content: string) => {
    content.split(/[、,，/|]/).forEach(collectTag);
    return " ";
  });

  tagTerms.forEach((term) => {
    if (normalized.includes(term)) {
      collectTag(term);
      normalized = normalized.replaceAll(term, " ");
    }
  });

  normalized = normalized
    .replace(/[+/｜|]/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\s|[、,，])*(?:时|份|约|选项)+$/u, "")
    .trim()
    .replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/gu, "");

  const categoryTag = displayTags.find((tag) => /餐$/.test(tag));
  if (categoryTag && !normalized.includes(categoryTag)) normalized += categoryTag;

  const displayDishName = normalized || raw.replace(/[【】\[\]]/g, "").trim() || raw;
  return { rawDishName: raw, displayDishName, displayTags };
}
