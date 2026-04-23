import { create } from "zustand";
import { parseCSV, loadJSON } from "@/lib/csv";
import { parseAmount } from "@/lib/utils";
import type {
  AggregatedData,
  Card,
  DataSource,
  FraudLabels,
  MCCCodes,
  PredictionsMap,
  Transaction,
  User,
} from "@/types";

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DataState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  progress: string;

  aggregated: AggregatedData | null;
  trainTransactions: Transaction[];
  evalTransactions: Transaction[];
  users: Map<string, User>;
  cards: Map<string, Card>;
  mcc: MCCCodes;
  fraudLabels: FraudLabels;
  predictions: PredictionsMap;
  predictionsAvailable: boolean;

  source: DataSource;
  dateRange: DateRange;

  setSource: (s: DataSource) => void;
  setDateRange: (r: DateRange) => void;

  bootstrap: () => Promise<void>;
  loadTransactions: () => Promise<void>;
}

const DATA_BASE = "/data";

function parseTransactionRow(row: Record<string, string>): Transaction {
  const city = row.merchant_city ?? "";
  const date = row.date ?? "";
  const ts = date ? Date.parse(date.replace(" ", "T")) : 0;
  return {
    transaction_id: row.transaction_id,
    date,
    client_id: row.client_id,
    card_id: row.card_id,
    amount: parseAmount(row.amount),
    use_chip: row.use_chip,
    merchant_id: row.merchant_id,
    merchant_city: city,
    merchant_state: row.merchant_state,
    zip: row.zip,
    mcc: row.mcc,
    errors: row.errors || "",
    _cityLower: city.toLowerCase(),
    _ts: Number.isFinite(ts) ? ts : 0,
  };
}

function parseUserRow(row: Record<string, string>): User {
  return {
    id: row.id,
    current_age: Number(row.current_age),
    retirement_age: Number(row.retirement_age),
    birth_year: Number(row.birth_year),
    birth_month: Number(row.birth_month),
    gender: row.gender,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    per_capita_income: parseAmount(row.per_capita_income),
    yearly_income: parseAmount(row.yearly_income),
    total_debt: parseAmount(row.total_debt),
    credit_score: Number(row.credit_score),
    num_credit_cards: Number(row.num_credit_cards),
  };
}

function parseCardRow(row: Record<string, string>): Card {
  return {
    id: row.id,
    client_id: row.client_id,
    card_brand: row.card_brand,
    card_type: row.card_type,
    card_number: row.card_number,
    expires: row.expires,
    cvv: row.cvv,
    has_chip: row.has_chip,
    num_cards_issued: Number(row.num_cards_issued),
    credit_limit: parseAmount(row.credit_limit),
    acct_open_date: row.acct_open_date,
    year_pin_last_changed: Number(row.year_pin_last_changed),
    card_on_dark_web: row.card_on_dark_web,
  };
}

export const useDataStore = create<DataState>((set, get) => ({
  status: "idle",
  error: null,
  progress: "",
  aggregated: null,
  trainTransactions: [],
  evalTransactions: [],
  users: new Map(),
  cards: new Map(),
  mcc: {},
  fraudLabels: {},
  predictions: {},
  predictionsAvailable: false,
  source: "train",
  dateRange: { from: null, to: null },

  setSource: (s) => set({ source: s }),
  setDateRange: (r) => set({ dateRange: r }),

  bootstrap: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null, progress: "Loading aggregated metrics..." });
    try {
      const [aggregated, mcc, users, cards] = await Promise.all([
        loadJSON<AggregatedData>(`${DATA_BASE}/aggregated.json`),
        loadJSON<MCCCodes>(`${DATA_BASE}/mcc_codes.json`),
        parseCSV<User>({ url: `${DATA_BASE}/users_data.csv`, transform: parseUserRow }),
        parseCSV<Card>({ url: `${DATA_BASE}/cards_data.csv`, transform: parseCardRow }),
      ]);

      const usersMap = new Map(users.map((u) => [u.id, u]));
      const cardsMap = new Map(cards.map((c) => [c.id, c]));

      // Optional predictions file — wired for drop-in
      let predictions: PredictionsMap = {};
      let predictionsAvailable = false;
      try {
        const raw = await loadJSON<Record<string, { predicted_fraud: boolean; probability: number }> | { predictions: { transaction_id: string; predicted_fraud: boolean; probability: number }[] }>(
          `${DATA_BASE}/predictions.json`
        );
        if (Array.isArray((raw as any).predictions)) {
          for (const p of (raw as any).predictions) predictions[p.transaction_id] = p;
        } else {
          for (const [id, v] of Object.entries(raw as Record<string, { predicted_fraud: boolean; probability: number }>)) {
            predictions[id] = { transaction_id: id, ...v };
          }
        }
        predictionsAvailable = Object.keys(predictions).length > 0;
      } catch {
        predictionsAvailable = false;
      }

      set({
        aggregated,
        mcc,
        users: usersMap,
        cards: cardsMap,
        predictions,
        predictionsAvailable,
        status: "ready",
        progress: "",
      });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e), progress: "" });
    }
  },

  loadTransactions: async () => {
    if (get().trainTransactions.length > 0) return;
    set({ progress: "Loading transactions (this may take a few seconds)..." });
    try {
      const [train, evalRows, fraudLabelsRaw] = await Promise.all([
        parseCSV<Transaction>({
          url: `${DATA_BASE}/transactions_train.csv`,
          transform: parseTransactionRow,
        }),
        parseCSV<Transaction>({
          url: `${DATA_BASE}/evaluation_features.csv`,
          transform: parseTransactionRow,
        }),
        loadJSON<{ target: FraudLabels }>(`${DATA_BASE}/train_fraud_labels.json`),
      ]);
      set({
        trainTransactions: train,
        evalTransactions: evalRows,
        fraudLabels: fraudLabelsRaw.target,
        progress: "",
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), progress: "" });
    }
  },
}));
