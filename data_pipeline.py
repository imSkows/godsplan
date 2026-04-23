"""
Data Pipeline: Merge, clean, validate, and create multiple train/test splits.

- users_data.csv         : `id` is the client identifier
- cards_data.csv         : `client_id` links each card to a user
- transactions_train.csv : `client_id` + `card_id` link each txn to a user and card
- train_fraud_labels.json: fraud labels per transaction_id

Pipeline steps:
  1. Load & merge raw data
  2. Attach fraud labels + data cleaning (amounts, dates, …)
  3. Validate cleaned data quality
  4. Generate 10 train/test pairs with varying fraud proportions
     - Test: keeps original ratio (~315/210 000 ≈ 0.15 %)
     - Train: fraud ratio from 50 % down to ~0.5 %
"""

import json
import sys
import numpy as np
import pandas as pd
from pathlib import Path

# ════════════════════════════════════════════════════════════════════════
# 1. Configuration
# ════════════════════════════════════════════════════════════════════════
DATA_DIR = Path(__file__).parent
OUTPUT_DIR = DATA_DIR / "datasets"
OUTPUT_DIR.mkdir(exist_ok=True)

FILES = {
    "users": DATA_DIR / "users_data.csv",
    "cards": DATA_DIR / "cards_data.csv",
    "transactions": DATA_DIR / "transactions_train.csv",
    "labels": DATA_DIR / "train_fraud_labels.json",
    "mcc": DATA_DIR / "mcc_codes.json",
}

# Original dataset constants
TOTAL_TRANSACTIONS = 210_000
TOTAL_FRAUD = 315

# 10 target fraud percentages for training sets (from 50 % down to 0.5 %)
TRAIN_FRAUD_PERCENTAGES = [50.0, 45.0, 40.0, 35.0, 30.0, 20.0, 10.0, 5.0, 2.0, 0.5]

# Test size as a fraction of the full dataset
TEST_RATIO = 0.2

RANDOM_SEED = 42

# ════════════════════════════════════════════════════════════════════════
# 2. Load & merge raw data
# ════════════════════════════════════════════════════════════════════════
def load_and_merge() -> pd.DataFrame:
    """Load the three CSV sources and merge them into one DataFrame."""
    print("═" * 70)
    print("  STEP 1 · Load & merge raw data")
    print("═" * 70)

    users = pd.read_csv(FILES["users"]).rename(columns={"id": "client_id"})
    cards = pd.read_csv(FILES["cards"]).rename(columns={"id": "card_id"})
    transactions = pd.read_csv(FILES["transactions"])

    print(f"  users        : {users.shape[0]:>8,} rows × {users.shape[1]} cols")
    print(f"  cards        : {cards.shape[0]:>8,} rows × {cards.shape[1]} cols")
    print(f"  transactions : {transactions.shape[0]:>8,} rows × {transactions.shape[1]} cols")

    # Merge cards ← users on client_id
    cards_users = pd.merge(cards, users, on="client_id", how="left",
                           suffixes=("_card", "_user"))

    # Merge transactions ← cards_users on client_id + card_id
    merged = pd.merge(transactions, cards_users,
                      on=["client_id", "card_id"], how="left",
                      suffixes=("_txn", "_card"))

    print(f"  merged       : {merged.shape[0]:>8,} rows × {merged.shape[1]} cols")
    return merged


# ════════════════════════════════════════════════════════════════════════
# 3. Attach labels & clean
# ════════════════════════════════════════════════════════════════════════
def attach_labels_and_clean(df: pd.DataFrame) -> pd.DataFrame:
    """Add fraud label, parse monetary strings, parse datetime."""
    print("\n" + "═" * 70)
    print("  STEP 2 · Attach fraud labels & clean columns")
    print("═" * 70)

    # ── Fraud labels ──
    with open(FILES["labels"]) as f:
        labels = json.load(f)["target"]
    df["is_fraud"] = (df["transaction_id"]
                      .astype(str)
                      .map(labels)
                      .map({"Yes": 1, "No": 0})
                      .astype(int))
    print(f"  Fraud: {df['is_fraud'].sum()} / {len(df)} "
          f"({df['is_fraud'].mean()*100:.3f} %)")

    # ── MCC descriptions ──
    with open(FILES["mcc"]) as f:
        mcc_map = json.load(f)
    df["mcc_desc"] = df["mcc"].astype(str).map(mcc_map)

    # ── Parse monetary columns (strip '$' and ',') ──
    for col in ["amount", "credit_limit", "per_capita_income",
                "yearly_income", "total_debt"]:
        clean_col = f"{col}_clean"
        df[clean_col] = (df[col]
                         .astype(str)
                         .str.replace("$", "", regex=False)
                         .str.replace(",", "", regex=False)
                         .astype(float))
        print(f"  Parsed {col} → {clean_col}")

    # ── Parse datetime ──
    df["datetime"] = pd.to_datetime(df["date"])
    df["hour"]     = df["datetime"].dt.hour
    df["dow"]      = df["datetime"].dt.dayofweek   # 0 = Monday
    df["month"]    = df["datetime"].dt.month
    df["year"]     = df["datetime"].dt.year
    df["day_name"] = df["datetime"].dt.day_name()
    print("  Parsed date → datetime, hour, dow, month, year, day_name")

    return df


# ════════════════════════════════════════════════════════════════════════
# 4. Validate cleaned data
# ════════════════════════════════════════════════════════════════════════
def validate(df: pd.DataFrame) -> bool:
    """Run sanity checks on the cleaned dataset. Return True if OK."""
    print("\n" + "═" * 70)
    print("  STEP 3 · Validate cleaned data")
    print("═" * 70)
    errors: list[str] = []

    # 4a. Expected row count
    if len(df) != TOTAL_TRANSACTIONS:
        errors.append(
            f"Row count mismatch: expected {TOTAL_TRANSACTIONS:,}, "
            f"got {len(df):,}")

    # 4b. Expected fraud count
    n_fraud = int(df["is_fraud"].sum())
    if n_fraud != TOTAL_FRAUD:
        errors.append(
            f"Fraud count mismatch: expected {TOTAL_FRAUD}, got {n_fraud}")

    # 4c. is_fraud values should be only 0 or 1
    unique_fraud = set(df["is_fraud"].unique())
    if not unique_fraud.issubset({0, 1}):
        errors.append(
            f"is_fraud has unexpected values: {unique_fraud}")

    # 4d. Monetary _clean columns must be numeric (no NaN from bad parse)
    for col in ["amount_clean", "credit_limit_clean",
                "per_capita_income_clean", "yearly_income_clean",
                "total_debt_clean"]:
        n_null = int(df[col].isnull().sum())
        if n_null > 0:
            errors.append(f"{col} has {n_null:,} null(s) after parsing")

    # 4e. datetime must be non-null
    n_null_dt = int(df["datetime"].isnull().sum())
    if n_null_dt > 0:
        errors.append(f"datetime has {n_null_dt:,} null(s)")

    # 4f. amount_clean – flag negative values (refunds/chargebacks) as info
    n_neg = int((df["amount_clean"] < 0).sum())
    if n_neg > 0:
        print(f"  ℹ️  amount_clean has {n_neg:,} negative value(s) "
              f"(likely refunds/chargebacks — OK)")

    # Report
    if errors:
        print("\n  ❌ VALIDATION FAILED:")
        for e in errors:
            print(f"     • {e}")
        return False
    else:
        print("  ✅ All validation checks passed")
        return True


# ════════════════════════════════════════════════════════════════════════
# 5. Create train/test splits with varying fraud proportions
# ════════════════════════════════════════════════════════════════════════
def create_train_test_splits(df: pd.DataFrame) -> dict:
    """
    Generate 10 train/test dataset pairs.

    • The **test** set always preserves the original fraud ratio
      (~315/210 000 ≈ 0.15 %).
    • The **training** sets vary the fraud proportion from 50 % down to
      0.5 % by under-sampling the sane (non-fraud) transactions while
      keeping ALL 315 fraud transactions in the training pool.

    Naming convention:
        datasets/train_XX.X_pct.csv   (XX.X = fraud %)
        datasets/test_XX.X_pct.csv
    """
    print("\n" + "═" * 70)
    print("  STEP 4 · Create train/test splits")
    print("═" * 70)

    rng = np.random.RandomState(RANDOM_SEED)

    # ── Separate fraud and non-fraud ──
    fraud_df = df[df["is_fraud"] == 1].copy()
    sane_df  = df[df["is_fraud"] == 0].copy()

    n_fraud = len(fraud_df)
    n_sane  = len(sane_df)
    print(f"  Total fraud : {n_fraud:>8,}")
    print(f"  Total sane  : {n_sane:>8,}")

    # ── Build a *shared* test set that preserves the original ratio ──
    # We take TEST_RATIO of both classes so proportions stay the same.
    n_fraud_test = max(1, int(round(n_fraud * TEST_RATIO)))
    n_sane_test  = max(1, int(round(n_sane * TEST_RATIO)))

    fraud_indices = rng.permutation(fraud_df.index)
    sane_indices  = rng.permutation(sane_df.index)

    test_fraud_idx = fraud_indices[:n_fraud_test]
    test_sane_idx  = sane_indices[:n_sane_test]

    # Remaining pool for training
    train_fraud_idx = fraud_indices[n_fraud_test:]
    train_sane_pool = sane_indices[n_sane_test:]

    test_set = pd.concat([df.loc[test_fraud_idx], df.loc[test_sane_idx]])
    test_set = test_set.sample(frac=1, random_state=RANDOM_SEED)  # shuffle

    n_train_fraud = len(train_fraud_idx)  # fraud available for training

    print(f"\n  Test set : {len(test_set):>8,} rows  "
          f"(fraud {n_fraud_test}, sane {n_sane_test}, "
          f"ratio {n_fraud_test / len(test_set) * 100:.3f} %)")
    print(f"  Training fraud pool : {n_train_fraud}")
    print(f"  Training sane pool  : {len(train_sane_pool)}")

    # ── For each target fraud %, build a training set ──
    print(f"\n  {'Dataset':>8}  {'Fraud%':>7}  {'Fraud':>6}  {'Sane':>8}  "
          f"{'Total':>8}  File")
    print("  " + "─" * 66)

    splits: dict[str, tuple[pd.DataFrame, pd.DataFrame]] = {}

    for idx, fraud_pct in enumerate(TRAIN_FRAUD_PERCENTAGES, start=1):
        # fraud_pct = n_fraud / (n_fraud + n_sane) * 100
        # ⇒ n_sane = n_fraud * (100 / fraud_pct − 1)
        n_sane_needed = int(round(n_train_fraud * (100.0 / fraud_pct - 1)))

        # Cap at available sane transactions
        if n_sane_needed > len(train_sane_pool):
            n_sane_needed = len(train_sane_pool)

        # Ensure at least 1 sane transaction
        n_sane_needed = max(1, n_sane_needed)

        # Sample sane transactions
        selected_sane_idx = rng.choice(
            train_sane_pool, size=n_sane_needed, replace=False)

        train_set = pd.concat([
            df.loc[train_fraud_idx],
            df.loc[selected_sane_idx]
        ])
        train_set = train_set.sample(frac=1, random_state=RANDOM_SEED)

        actual_pct = n_train_fraud / len(train_set) * 100

        # ── Save files ──
        tag = f"{fraud_pct:05.1f}_pct"
        train_path = OUTPUT_DIR / f"train_{tag}.csv"
        test_path  = OUTPUT_DIR / f"test_{tag}.csv"
        train_set.to_csv(train_path, index=False)
        test_set.to_csv(test_path, index=False)
        splits[tag] = (train_set, test_set)

        print(f"  {idx:>8}  {actual_pct:>6.2f}%  {n_train_fraud:>6}  "
              f"{n_sane_needed:>8,}  {len(train_set):>8,}  "
              f"{train_path.name}")

    print(f"\n  ✅ {len(TRAIN_FRAUD_PERCENTAGES)} train/test pairs saved "
          f"to {OUTPUT_DIR}/")

    return splits


# ════════════════════════════════════════════════════════════════════════
# Main entry-point
# ════════════════════════════════════════════════════════════════════════
def main():
    # Step 1 – Load & merge
    df = load_and_merge()

    # Step 2 – Labels + cleaning
    df = attach_labels_and_clean(df)

    # Step 3 – Validate
    ok = validate(df)
    if not ok:
        print("\n⛔  Pipeline aborted — fix the issues above first.")
        sys.exit(1)

    # Step 4 – Create splits
    splits = create_train_test_splits(df)

    print("\n🏁  Pipeline finished successfully.")
    return splits


if __name__ == "__main__":
    main()
