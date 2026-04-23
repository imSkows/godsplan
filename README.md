# Fraud Detection Hackathon

IBM x EFREI — Data Science Hackathon

## Project Structure

```text
.
├── dataset/                     # Raw hackathon data (read-only)
├── dataset_cleaned/             # Preprocessed parquet files (train + test at various fraud %)
├── info/
│   └── instructions.pdf         # Hackathon instructions
├── params/
│   └── ml_params.yaml           # ML config (model, optuna, threshold)
├── src/
│   ├── mlmodel.py               # Pipeline: load, encode, train, evaluate, infer, save
│   └── models/
│       ├── base_model.py        # BaseModel (interface abstraite)
│       └── xgboost.py           # XGBoost
├── notebooks/
│   └── exploration_anthony.ipynb
├── outputs/
│   ├── res_perf/                # Performance results
│   └── submissions/             # Submission CSVs
├── requirements.txt
└── .cursor/
    ├── rules/
    └── skills/
```

## Usage

```bash
pip install -r requirements.txt

# Train + evaluate + generate submission
PYTHONPATH=src python src/mlmodel.py \
  --train-data dataset_cleaned/prepared_train_000.5_pct.parquet \
  --eval-data dataset_cleaned/prepared_test_050.0_pct.parquet

# Without Optuna (faster)
PYTHONPATH=src python src/mlmodel.py \
  --train-data dataset_cleaned/prepared_train_000.5_pct.parquet \
  --eval-data dataset_cleaned/prepared_test_050.0_pct.parquet \
  --no-optuna

# Train only (no eval submission)
PYTHONPATH=src python src/mlmodel.py \
  --train-data dataset_cleaned/prepared_train_000.5_pct.parquet

# Custom target column name
PYTHONPATH=src python src/mlmodel.py \
  --train-data my_data.csv --target-col fraud_label
```
