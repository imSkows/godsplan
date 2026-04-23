/**
 * Build-time preprocessing:
 *  - Parses the training + evaluation CSVs and the fraud label JSON
 *  - Generates mock predictions (realistic 92% accuracy) for the training set,
 *    ONLY if a user-provided predictions.json is not present in public/data/
 *  - Computes all aggregated metrics used by the dashboard
 *  - Writes public/data/aggregated.json
 *
 * Run with:  npm run prepare-data
 */
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC_DATA = join(ROOT, "public", "data");
mkdirSync(PUBLIC_DATA, { recursive: true });

type Row = Record<string, string>;

interface Tx {
  id: string;
  date: string;
  client_id: string;
  amount: number;
  merchant_state: string;
  mcc: string;
}
interface UserRow {
  id: string;
  current_age: number;
  yearly_income: number;
  credit_score: number;
}
type Labels = Record<string, "Yes" | "No">;

function parseAmount(raw: string): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

async function streamCSV<T>(path: string, map: (r: Row) => T): Promise<T[]> {
  const text = readFileSync(path, "utf8");
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    Papa.parse<Row>(text, {
      header: true,
      skipEmptyLines: true,
      step: (r) => rows.push(map(r.data)),
      complete: () => resolve(rows),
      error: reject,
    });
  });
}

function loadJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

console.log("Reading data...");
const [train, evalRows, users, mccCodes, labelsWrapper] = await Promise.all([
  streamCSV<Tx>(join(PUBLIC_DATA, "transactions_train.csv"), (r) => ({
    id: r.transaction_id,
    date: r.date,
    client_id: r.client_id,
    amount: parseAmount(r.amount),
    merchant_state: r.merchant_state,
    mcc: r.mcc,
  })),
  streamCSV<Tx>(join(PUBLIC_DATA, "evaluation_features.csv"), (r) => ({
    id: r.transaction_id,
    date: r.date,
    client_id: r.client_id,
    amount: parseAmount(r.amount),
    merchant_state: r.merchant_state,
    mcc: r.mcc,
  })),
  streamCSV<UserRow>(join(PUBLIC_DATA, "users_data.csv"), (r) => ({
    id: r.id,
    current_age: Number(r.current_age),
    yearly_income: parseAmount(r.yearly_income),
    credit_score: Number(r.credit_score),
  })),
  Promise.resolve(loadJSON<Record<string, string>>(join(PUBLIC_DATA, "mcc_codes.json"))),
  Promise.resolve(loadJSON<{ target: Labels }>(join(PUBLIC_DATA, "train_fraud_labels.json"))),
]);

const labels = labelsWrapper.target;
console.log(`Train rows: ${train.length.toLocaleString()} | Eval rows: ${evalRows.length.toLocaleString()}`);

// ----- Predictions: use supplied file if present, otherwise generate mock ------
type Pred = { transaction_id: string; predicted_fraud: boolean; probability: number };
const predsPath = join(PUBLIC_DATA, "predictions.json");
let predictions: Record<string, Pred> = {};

if (existsSync(predsPath)) {
  const raw = loadJSON<Record<string, Pred> | { predictions: Pred[] }>(predsPath);
  if (Array.isArray((raw as { predictions?: Pred[] }).predictions)) {
    for (const p of (raw as { predictions: Pred[] }).predictions) predictions[p.transaction_id] = p;
  } else {
    predictions = raw as Record<string, Pred>;
  }
  console.log(`Using supplied predictions.json (${Object.keys(predictions).length.toLocaleString()} entries)`);
} else {
  console.log("No predictions.json supplied — generating mock predictions...");
  // Mock: derived from ground truth with realistic error rates
  //  - Recall ~0.78 (miss 22% of fraud)
  //  - FPR ~0.015 (1.5% of legit flagged)
  const rng = mulberry32(42);
  for (const tx of train) {
    const actual = labels[tx.id] === "Yes";
    const r = rng();
    const amt = Math.min(Math.abs(tx.amount), 5000) / 5000;
    let prob: number;
    if (actual) {
      // Most fraud gets high prob, 22% leak through as low prob
      prob = r < 0.22 ? 0.10 + rng() * 0.35 : 0.55 + rng() * 0.40;
    } else {
      // Most legit gets low prob, ~1.5% spike up
      prob = r < 0.015 ? 0.55 + rng() * 0.40 : rng() * 0.45;
    }
    // Small amount-based tilt
    prob = Math.max(0, Math.min(1, prob + (amt - 0.5) * 0.06));
    const pred = prob >= 0.5;
    predictions[tx.id] = { transaction_id: tx.id, predicted_fraud: pred, probability: Number(prob.toFixed(4)) };
  }
  writeFileSync(predsPath, JSON.stringify({ predictions: Object.values(predictions) }));
  console.log(`Wrote mock predictions to ${predsPath}`);
}

// ------------------------- Metrics --------------------------------------------
function computeMetrics(txs: Tx[], labels: Labels, preds: Record<string, Pred>) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const rocBuckets = new Array(101).fill(0).map(() => ({ fraud: 0, total: 0 }));
  for (const tx of txs) {
    const actual = labels[tx.id] === "Yes";
    const p = preds[tx.id];
    if (!p) continue;
    const pred = p.predicted_fraud;
    if (pred && actual) tp++;
    else if (pred && !actual) fp++;
    else if (!pred && !actual) tn++;
    else fn++;
    const bucket = Math.min(100, Math.max(0, Math.floor(p.probability * 100)));
    rocBuckets[bucket].total++;
    if (actual) rocBuckets[bucket].fraud++;
  }
  const total = tp + fp + tn + fn;
  const accuracy = total ? (tp + tn) / total : 0;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const tpr = recall;
  const fpr = fp + tn ? fp / (fp + tn) : 0;

  // ROC curve: sweep threshold t from 0..1
  const curve: { fpr: number; tpr: number; threshold: number }[] = [];
  const posTotal = rocBuckets.reduce((acc, b) => acc + b.fraud, 0);
  const negTotal = rocBuckets.reduce((acc, b) => acc + (b.total - b.fraud), 0);
  let tpCum = 0, fpCum = 0;
  for (let b = rocBuckets.length - 1; b >= 0; b--) {
    tpCum += rocBuckets[b].fraud;
    fpCum += rocBuckets[b].total - rocBuckets[b].fraud;
    curve.push({
      threshold: b / 100,
      tpr: posTotal ? tpCum / posTotal : 0,
      fpr: negTotal ? fpCum / negTotal : 0,
    });
  }
  return { accuracy, precision, recall, f1, tpr, fpr, tp, fp, tn, fn, total, rocCurve: curve };
}

const metricsTrain = computeMetrics(train, labels, predictions);
console.log(`Training accuracy: ${(metricsTrain.accuracy * 100).toFixed(2)}%`);

// ------------------------- Aggregations ---------------------------------------
const userMap = new Map(users.map((u) => [u.id, u]));
const byDate = new Map<string, { fraud: number; total: number }>();
const byState = new Map<string, { fraud: number; total: number }>();
const byMcc = new Map<string, { fraud: number; total: number }>();
const byDow = new Map<string, { fraud: number; total: number }>();
const byHour = new Map<number, { fraud: number; total: number }>();
const byMonth = new Map<string, { fraud: number; total: number }>();
const byAge = new Map<string, { fraud: number; total: number }>();
const byIncome = new Map<string, { fraud: number; total: number }>();
const byCredit = new Map<string, { fraud: number; total: number }>();

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Amount histogram: log-scale bins
const amtBins = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, Infinity];
const binLabels = amtBins.slice(0, -1).map((lo, i) => {
  const hi = amtBins[i + 1];
  if (hi === Infinity) return `$${lo}+`;
  if (lo === 0) return `<$1`;
  return `$${lo}-${hi}`;
});
const amountHistogram: { bin: string; count: number; fraudCount: number }[] = binLabels.map((bin) => ({
  bin,
  count: 0,
  fraudCount: 0,
}));

function ageGroup(age: number) {
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  if (age < 65) return "55-64";
  return "65+";
}
function incomeBracket(i: number) {
  if (i < 30000) return "<$30k";
  if (i < 60000) return "$30-60k";
  if (i < 100000) return "$60-100k";
  if (i < 200000) return "$100-200k";
  return "$200k+";
}
function creditRange(s: number) {
  if (s < 580) return "<580";
  if (s < 670) return "580-669";
  if (s < 740) return "670-739";
  if (s < 800) return "740-799";
  return "800+";
}

let totalAmount = 0;
let fraudCount = 0;
let minDate = "￿";
let maxDate = "";

for (const tx of train) {
  const isFraud = labels[tx.id] === "Yes";
  if (isFraud) fraudCount++;
  totalAmount += Math.abs(tx.amount);
  if (tx.date < minDate) minDate = tx.date;
  if (tx.date > maxDate) maxDate = tx.date;

  const day = tx.date.slice(0, 10);
  upsert(byDate, day, isFraud);

  if (tx.merchant_state) upsert(byState, tx.merchant_state, isFraud);
  if (tx.mcc) upsert(byMcc, tx.mcc, isFraud);

  const d = new Date(tx.date.replace(" ", "T"));
  if (!Number.isNaN(d.getTime())) {
    upsert(byDow, DOW[d.getDay()], isFraud);
    upsert(byHour, d.getHours(), isFraud);
    upsert(byMonth, tx.date.slice(0, 7), isFraud);
  }

  // amount histogram
  const a = Math.abs(tx.amount);
  for (let i = 0; i < amtBins.length - 1; i++) {
    if (a >= amtBins[i] && a < amtBins[i + 1]) {
      amountHistogram[i].count++;
      if (isFraud) amountHistogram[i].fraudCount++;
      break;
    }
  }

  const u = userMap.get(tx.client_id);
  if (u) {
    upsert(byAge, ageGroup(u.current_age), isFraud);
    upsert(byIncome, incomeBracket(u.yearly_income), isFraud);
    upsert(byCredit, creditRange(u.credit_score), isFraud);
  }
}

function upsert<K>(map: Map<K, { fraud: number; total: number }>, key: K, isFraud: boolean) {
  const cur = map.get(key) ?? { fraud: 0, total: 0 };
  cur.total++;
  if (isFraud) cur.fraud++;
  map.set(key, cur);
}
function rateRows<K extends string | number>(map: Map<K, { fraud: number; total: number }>, keyName: string) {
  return Array.from(map.entries()).map(([k, v]) => ({
    [keyName]: k,
    fraud: v.fraud,
    total: v.total,
    rate: v.total ? v.fraud / v.total : 0,
  })) as Array<{ [k: string]: unknown; fraud: number; total: number; rate: number }>;
}

const ageOrder = ["<25", "25-34", "35-44", "45-54", "55-64", "65+"];
const incomeOrder = ["<$30k", "$30-60k", "$60-100k", "$100-200k", "$200k+"];
const creditOrder = ["<580", "580-669", "670-739", "740-799", "800+"];

const aggregated = {
  summary: {
    totalTransactions: train.length,
    totalEvaluation: evalRows.length,
    fraudCount,
    fraudRate: train.length ? fraudCount / train.length : 0,
    totalAmount,
    dateRange: { min: minDate, max: maxDate },
  },
  fraudByDate: Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date)),
  fraudByState: (rateRows(byState, "state") as { state: string; fraud: number; total: number; rate: number }[]).sort(
    (a, b) => b.fraud - a.fraud
  ),
  amountHistogram,
  fraudByMcc: (rateRows(byMcc, "mcc") as { mcc: string; fraud: number; total: number; rate: number }[])
    .map((r) => ({ ...r, label: mccCodes[r.mcc] ?? r.mcc }))
    .sort((a, b) => b.rate - a.rate),
  fraudByDayOfWeek: DOW.map((d) => ({ day: d, ...(byDow.get(d) ?? { fraud: 0, total: 0 }) })),
  fraudByHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, ...(byHour.get(h) ?? { fraud: 0, total: 0 }) })),
  fraudByMonth: Array.from(byMonth.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month)),
  fraudByAgeGroup: ageOrder.map((g) => ({
    group: g,
    ...(byAge.get(g) ?? { fraud: 0, total: 0 }),
    rate: (byAge.get(g)?.total ?? 0) ? (byAge.get(g)!.fraud / byAge.get(g)!.total) : 0,
  })),
  fraudByIncomeBracket: incomeOrder.map((b) => ({
    bracket: b,
    ...(byIncome.get(b) ?? { fraud: 0, total: 0 }),
    rate: (byIncome.get(b)?.total ?? 0) ? (byIncome.get(b)!.fraud / byIncome.get(b)!.total) : 0,
  })),
  fraudByCreditScore: creditOrder.map((r) => ({
    range: r,
    ...(byCredit.get(r) ?? { fraud: 0, total: 0 }),
    rate: (byCredit.get(r)?.total ?? 0) ? (byCredit.get(r)!.fraud / byCredit.get(r)!.total) : 0,
  })),
  metricsTrain,
  metricsEval: null,
};

writeFileSync(join(PUBLIC_DATA, "aggregated.json"), JSON.stringify(aggregated));
console.log(`Wrote aggregated.json (${(JSON.stringify(aggregated).length / 1024).toFixed(1)} KB)`);

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
