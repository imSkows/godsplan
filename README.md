# Fraud Detection Hackathon Starter

Base project scaffold for the IBM x EFREI fraud detection hackathon, initialized from the God's Plan template spirit and adapted to the provided dataset files.

## Project Structure

```text
.
├── dataset/                     # Provided hackathon datasets
├── info/
│   └── instructions.pdf         # Hackathon instructions
├── configs/
│   └── baseline.yaml            # Paths and training defaults
├── notebooks/                   # Optional exploration notebooks
├── outputs/
│   ├── models/                  # Trained artifacts
│   └── submissions/             # Generated submission CSVs
├── src/
│   └── fraud_detection/
│       ├── __init__.py
│       ├── config.py
│       ├── data.py
│       ├── features.py
│       ├── train.py
│       └── predict.py
├── requirements.txt
└── run.py                       # Simple CLI entrypoint
```

## Quick Start

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Train a baseline model:

```bash
python run.py train
```

4. Generate submission on evaluation set:

```bash
python run.py predict
```

Submission file is written to `outputs/submissions/submission.csv` with:
- `transaction_id`
- `fraud_prediction`
