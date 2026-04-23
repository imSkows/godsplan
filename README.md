# Fraud Detection Hackathon

IBM x EFREI — Data Science Hackathon

## Project Structure

```text
.
├── dataset/                     # Provided hackathon data (read-only)
├── web/                         # React/Vite dashboard
│   ├── src/                     # Frontend app source
│   ├── public/                  # Frontend static assets and derived data
│   └── scripts/                 # Frontend data prep scripts
├── ml/                          # Python ML pipeline and models
│   ├── mlmodel.py               # Orchestrateur: train, optimize, infer, save
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
    ├── rules/                   # Cursor rules (project integrity, git, ML standards)
    └── skills/                  # Cursor skills (data-scientist, ml-engineering, mlops)
```

## Usage

```bash
pip install -r requirements.txt

python ml/mlmodel.py --train-csv <features.csv> --target-col fraud_label
python ml/mlmodel.py --train-csv <features.csv> --infer-csv <eval.csv>
python ml/mlmodel.py --train-csv <features.csv> --no-optuna
```
