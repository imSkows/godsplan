"""
Export ML predictions to web/public/data/predictions.json.

Loads the trained model and the train parquet, applies the same feature
preparation as mlmodel.py, then writes predictions for the web dashboard.

Usage:
    PYTHONPATH=ml python ml/export_web.py
    PYTHONPATH=ml python ml/export_web.py --data dataset_cleaned/train_original_ratio.parquet
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from mlmodel import _load_file, _prepare_features, _encode_categories

log = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export ML predictions for web dashboard")
    parser.add_argument("--model", default="xgb_OPTUNA_BEST.ubj")
    parser.add_argument("--cat-maps", default="outputs/models/cat_maps.json")
    parser.add_argument("--data", default="prepared_test_050.0_pct.parquet",
                        help="Parquet file to predict on (must have transaction_id)")
    parser.add_argument("--target-col", default="is_fraud")
    parser.add_argument("--output", default="web/public/data/predictions.json")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")

    import joblib
    log.info("Loading model from %s", args.model)
    if args.model.endswith(".ubj") or args.model.endswith(".json"):
        import xgboost as xgb
        model = xgb.XGBClassifier()
        model.load_model(args.model)
    else:
        model = joblib.load(args.model)

    cat_maps = None
    cat_maps_path = Path(args.cat_maps)
    if cat_maps_path.exists():
        with open(cat_maps_path) as f:
            cat_maps = json.load(f)
        log.info("Loaded category maps from %s (%d columns)", cat_maps_path, len(cat_maps))
    else:
        log.warning("No cat_maps.json found — encoding from scratch (may mismatch training!)")

    log.info("Loading data from %s", args.data)
    raw_df = _load_file(args.data)

    X_raw, y, txn_ids = _prepare_features(raw_df, args.target_col)
    X, _ = _encode_categories(X_raw, cat_maps=cat_maps)
    log.info("Prepared %d x %d features", X.shape[0], X.shape[1])

    log.info("Predicting on %d transactions...", len(X))
    probas = model.predict_proba(X)[:, 1]

    if txn_ids is None:
        txn_ids = pd.Series(range(len(X)))

    predictions = []
    for tid, prob in zip(txn_ids.values, probas):
        predictions.append({
            "transaction_id": str(tid),
            "predicted_fraud": bool(prob >= 0.5),
            "probability": round(float(prob), 4),
        })

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"predictions": predictions}, f)

    n_fraud_pred = sum(1 for p in predictions if p["predicted_fraud"])
    log.info("Wrote %d predictions to %s (predicted fraud: %d)", len(predictions), out_path, n_fraud_pred)


if __name__ == "__main__":
    main()
