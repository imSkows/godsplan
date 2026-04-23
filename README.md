# Fraud Detection Hackathon

IBM x EFREI — Data Science Hackathon

## Project Structure

```text
.
├── dataset/                     # Raw hackathon data (read-only)
├── dataset_cleaned/             # Preprocessed parquet files (train + test at various fraud %)
├── web/                         # React/Vite dashboard
│   ├── src/                     # Frontend app source
│   ├── public/                  # Frontend static assets and derived data
│   └── scripts/                 # Frontend data prep scripts
├── ml/                          # Python ML pipeline
│   ├── mlmodel.py               # Pipeline: load, encode, train, evaluate, infer, save
│   └── models/                  # BaseModel + model implementations
├── info/
│   └── instructions.pdf         # Hackathon instructions
├── params/
│   └── ml_params.yaml           # ML config (model, optuna, threshold)
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

### ML Pipeline

```bash
pip install -r requirements.txt

# Train + evaluate + generate submission
PYTHONPATH=ml python ml/mlmodel.py \
  --train-data dataset_cleaned/prepared_train_000.5_pct.parquet \
  --eval-data dataset_cleaned/prepared_test_050.0_pct.parquet

# Without Optuna (faster)
PYTHONPATH=ml python ml/mlmodel.py \
  --train-data dataset_cleaned/prepared_train_000.5_pct.parquet \
  --eval-data dataset_cleaned/prepared_test_050.0_pct.parquet \
  --no-optuna
```

### Web Dashboard

The dashboard is split in two processes: a FastAPI backend that can trigger the
ML pipeline on demand, and the Vite dev server for the React UI.

```bash
# 1. install deps
pip install -r requirements.txt
cd web && npm install && cd ..

# 2. start the API (terminal 1)
PYTHONPATH=ml uvicorn api.server:app --reload --port 8000

# 3. start the dashboard (terminal 2)
cd web && npm run dev
```

Then open the Vite URL (http://localhost:5173). Use the **Run inference**
button in the top-right corner to train the model and refresh the dashboard's
predictions live — logs stream in real time.
```
