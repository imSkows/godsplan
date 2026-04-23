export interface Transaction {
  transaction_id: string;
  date: string; // ISO-like: YYYY-MM-DD HH:MM:SS
  client_id: string;
  card_id: string;
  amount: number; // parsed from "$12.35"
  use_chip: string;
  merchant_id: string;
  merchant_city: string;
  merchant_state: string;
  zip: string;
  mcc: string;
  errors: string;
  /** Lowercased merchant_city — precomputed once at parse time for fast filtering */
  _cityLower: string;
  /** Epoch ms — precomputed for sort without re-parsing dates */
  _ts: number;
}

export interface User {
  id: string;
  current_age: number;
  retirement_age: number;
  birth_year: number;
  birth_month: number;
  gender: string;
  address: string;
  latitude: number;
  longitude: number;
  per_capita_income: number;
  yearly_income: number;
  total_debt: number;
  credit_score: number;
  num_credit_cards: number;
}

export interface Card {
  id: string;
  client_id: string;
  card_brand: string;
  card_type: string;
  card_number: string;
  expires: string;
  cvv: string;
  has_chip: string;
  num_cards_issued: number;
  credit_limit: number;
  acct_open_date: string;
  year_pin_last_changed: number;
  card_on_dark_web: string;
}

export type MCCCodes = Record<string, string>;
export type FraudLabels = Record<string, "Yes" | "No">;

export interface Prediction {
  transaction_id: string;
  predicted_fraud: boolean;
  probability: number; // 0..1
}
export type PredictionsMap = Record<string, Prediction>;

export interface MetricsData {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  tpr: number;
  fpr: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  total: number;
  rocCurve?: { fpr: number; tpr: number; threshold: number }[];
}

export interface AggregatedData {
  summary: {
    totalTransactions: number;
    totalEvaluation: number;
    fraudCount: number;
    fraudRate: number;
    totalAmount: number;
    dateRange: { min: string; max: string };
  };
  fraudByDate: { date: string; fraud: number; total: number }[];
  fraudByState: { state: string; fraud: number; total: number; rate: number }[];
  amountHistogram: { bin: string; count: number; fraudCount: number }[];
  fraudByMcc: { mcc: string; label: string; fraud: number; total: number; rate: number }[];
  fraudByDayOfWeek: { day: string; fraud: number; total: number }[];
  fraudByHour: { hour: number; fraud: number; total: number }[];
  fraudByMonth: { month: string; fraud: number; total: number }[];
  fraudByAgeGroup: { group: string; fraud: number; total: number; rate: number }[];
  fraudByIncomeBracket: { bracket: string; fraud: number; total: number; rate: number }[];
  fraudByCreditScore: { range: string; fraud: number; total: number; rate: number }[];
  metricsTrain: MetricsData;
  metricsEval: MetricsData | null;
}

export type DataSource = "train" | "evaluation";
