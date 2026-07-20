export type PriceLevel = 1 | 2 | 3;
export type LoveLevel = 1 | 2 | 3 | 4 | 5;
export type HealthLevel = 1 | 2 | 3 | 4 | 5;
export type Energy = "low" | "normal" | "high";
export type Weather = "hot" | "cold" | "rain" | "normal";
export type Companion = "solo" | "friends";
export type Intent = "familiar" | "explore";
export type Urgency = "rush" | "relaxed";
export type FoodKind = "delivery" | "restaurant" | "food";
export type FeedbackValue = "great" | "okay" | "avoid";
export type ThemePreference = "system" | "light" | "dark";
export type LifeImportSource = "screenshots" | "records";

export interface FoodOption {
  id: string;
  poolId: "solo-food";
  name: string;
  kind: FoodKind;
  priceLevel: PriceLevel;
  love: LoveLevel;
  health: HealthLevel;
  etaMinutes: number;
  weatherTags: Weather[];
  energyTags: Energy[];
  companionTags: Companion[];
  active: boolean;
  craving: boolean;
  isSample?: boolean;
  choiceCount: number;
  preferenceDelta: number;
  lastChosenAt?: string;
  cooldownUntil?: string;
  createdAt: string;
  updatedAt: string;
  merchantName?: string | null;
  historicalCount?: number;
  price?: number | null;
  category?: string | null;
  source?: "screenshot-import" | "manual";
  importedAt?: string;
}

export interface DecisionContext {
  budget: PriceLevel;
  energy: Energy;
  weather: Weather;
  companion: Companion;
  intent: Intent;
  urgency: Urgency;
}

export interface ScoreFactor {
  key: "love" | "context" | "recency" | "feedback" | "intent";
  label: string;
  contribution: number;
  max: number;
}

export interface RankedOption {
  option: FoodOption;
  score: number;
  factors: ScoreFactor[];
  reasons: string[];
}

export interface RecommendationResult {
  primary: RankedOption;
  alternatives: RankedOption[];
  ranked: RankedOption[];
  relaxedBudget: boolean;
}

export interface DecisionRecord {
  id: string;
  context: DecisionContext;
  recommendedId: string;
  recommendedName: string;
  alternativeIds: string[];
  shownIds: string[];
  selectedId: string;
  selectedName: string;
  selectionMode: "recommended" | "alternative" | "manual";
  feedback?: FeedbackValue;
  scoreSnapshot: Array<{
    optionId: string;
    optionName: string;
    score: number;
    factors: ScoreFactor[];
  }>;
  createdAt: string;
  completedAt: string;
}

export interface AppSettings {
  id: "app";
  theme: ThemePreference;
  weightVersion: 1;
  todayContext?: DecisionContext;
}

export interface LifeImportCandidate {
  id: string;
  name: string;
  frequency: number;
  /** The accumulated count after this import. It is calculated by the system, never user-entered. */
  historyCount?: number;
  /** The accumulated count for the merchant after this import. */
  merchantCount?: number;
  isRepeatOrder?: boolean;
  /** The amount this import adds to the option. Legacy batch imports omit this and use frequency. */
  importIncrement?: number;
  quantity?: number;
  merchantName?: string | null;
  unitPrice?: number | null;
  paidAmount?: number | null;
  category?: string | null;
  confidence?: number;
  sourceImageId?: string;
  sourceFileName?: string;
  kind: FoodKind;
  priceLevel: PriceLevel;
  love: LoveLevel;
  health: HealthLevel;
  etaMinutes: number;
  weatherTags: Weather[];
  energyTags: Energy[];
  companionTags: Companion[];
}

export interface LifeProfile {
  windowDays: number;
  familiarDinnerShare: number;
  keywords: string[];
  taste: string;
  budgetLabel: string;
  dinnerPattern: string;
  weekdayRule: string;
  weekendRule: string;
  insight: string;
}

export interface LifeImportAnalysis {
  candidates: LifeImportCandidate[];
  profile: LifeProfile;
  totalOrders?: number;
}

export type DefaultRuleKind = "repeat-order" | "frequent-merchant" | "drink-pattern" | "budget-limit" | "learning";
export type DefaultRuleDecision = "pending" | "accepted" | "dismissed";

export interface DefaultRuleSuggestion {
  id: string;
  kind: DefaultRuleKind;
  title: string;
  explanation: string;
  evidence: string;
  rule: string;
}

export interface LifeImportRecord {
  id: string;
  source: LifeImportSource;
  fileCount: number;
  candidates: LifeImportCandidate[];
  profile: LifeProfile;
  addedCount: number;
  updatedCount: number;
  createdAt: string;
  isDemo?: boolean;
  ruleSuggestion?: DefaultRuleSuggestion;
  ruleDecision?: DefaultRuleDecision;
}

export interface BackupPayload {
  format: "default-life-backup";
  version: 1;
  exportedAt: string;
  options: FoodOption[];
  decisions: DecisionRecord[];
  settings: AppSettings[];
  imports?: LifeImportRecord[];
}
