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
}

export interface LifeImportCandidate {
  id: string;
  name: string;
  frequency: number;
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
