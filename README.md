# Fraud Detection Hackathon

IBM x EFREI — Data Science Hackathon

## Project Structure

```text
.
├── dataset/                     # Provided hackathon data (read-only)
├── info/
│   └── instructions.pdf         # Hackathon instructions
├── params/
│   └── ml_params.yaml           # ML config (model, optuna, threshold)
├── src/
│   ├── mlmodel.py               # Orchestrateur: train, optimize, infer, save
│   └── models/
│       ├── base_model.py        # BaseModel (interface abstraite)
│       └── xgboost.py           # XGBoost (premier modele)
├── notebooks/
│   └── exploration_anthony.ipynb
├── outputs/
│   ├── res_perf/                # Performance results
│   └── submissions/             # Submission CSVs
├── requirements.txt
└── .cursor/
    ├── rules/                   # Cursor rules (project integrity, git, ML standards)
    └── skills/                  # Cursor skills (data-scientist, ml-engineering, mlops)
```

## Usage

```bash
pip install -r requirements.txt

python src/mlmodel.py --train-csv <features.csv> --target-col fraud_label
python src/mlmodel.py --train-csv <features.csv> --infer-csv <eval.csv>
python src/mlmodel.py --train-csv <features.csv> --no-optuna
```
