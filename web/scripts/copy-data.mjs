import { mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..");
const PROJECT_ROOT = join(__dirname, "..", "..");
const SRC = join(PROJECT_ROOT, "dataset");
const DST = join(WEB_ROOT, "public", "data");

const files = [
  "transactions_train.csv",
  "evaluation_features.csv",
  "users_data.csv",
  "cards_data.csv",
  "mcc_codes.json",
  "train_fraud_labels.json",
];

if (!existsSync(SRC)) {
  console.error(`Source folder not found: ${SRC}`);
  process.exit(1);
}

mkdirSync(DST, { recursive: true });

for (const f of files) {
  const s = join(SRC, f);
  const d = join(DST, f);
  if (!existsSync(s)) {
    console.warn(`Skipping missing file: ${f}`);
    continue;
  }
  copyFileSync(s, d);
  const sz = statSync(d).size;
  console.log(`Copied ${f} (${(sz / 1024 / 1024).toFixed(2)} MB)`);
}

console.log("Data copy complete.");
