from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any, Dict, Type

import numpy as np
import optuna
import pandas as pd
import yaml
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
)
from sklearn.model_selection import train_test_split

from models import BaseModel, XGBoost

log = logging.getLogger(__name__)

MODEL_REGISTRY: Dict[str, Type[BaseModel]] = {
    "xgboost": XGBoost,
}

ID_COLS = ["transaction_id", "client_id", "card_id", "merchant_id", "card_number", "cvv"]
DROP_COLS = [
    "date", "address", "acct_open_date", "expires",
    "amount", "credit_limit", "per_capita_income", "yearly_income", "total_debt",
    "card_on_dark_web", "datetime", "day_name",
    "birth_year", "birth_month", "latitude", "longitude",
    "mcc_desc", "year",
]
TARGET_COL_DEFAULT = "is_fraud"


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_file(path: str) -> pd.DataFrame:
    if path.endswith(".parquet"):
        return pd.read_parquet(path)
    return pd.read_csv(path)


def _prepare_features(df: pd.DataFrame, target_col: str) -> tuple[pd.DataFrame, pd.Series | None, pd.Series | None]:
    """
    Prepare features from raw merged data.
    Returns (X, y_or_None, transaction_ids_or_None).
    """
    txn_ids = df["transaction_id"] if "transaction_id" in df.columns else None
    y = df[target_col].astype(int) if target_col in df.columns else None

    drop = [c for c in ID_COLS + DROP_COLS + [target_col] if c in df.columns]
    X = df.drop(columns=drop)

    # Parse $-string columns if they survived (fallback)
    for col in X.columns:
        if X[col].dtype == object:
            sample = str(X[col].dropna().iloc[0]) if len(X[col].dropna()) > 0 else ""
            if sample.startswith("$"):
                X[col] = X[col].astype(str).str.replace("$", "", regex=False).str.replace(",", "").astype(float)

    # Keep _clean columns, ensure numeric
    for col in X.select_dtypes(include=["datetime64"]).columns:
        X = X.drop(columns=[col])

    return X, y, txn_ids


def _encode_categories(
    df: pd.DataFrame,
    cat_maps: dict[str, dict] | None = None,
) -> tuple[pd.DataFrame, dict[str, dict]]:
    out = df.copy()
    fitted_maps: dict[str, dict] = {}

    for col in out.columns:
        if out[col].dtype.name == "category" or out[col].dtype == object:
            series = out[col].astype(object)
            if cat_maps and col in cat_maps:
                mapping = cat_maps[col]
                out[col] = series.map(mapping).fillna(-1).astype(int)
            else:
                cat = series.astype("category")
                mapping = {v: i for i, v in enumerate(cat.cat.categories)}
                out[col] = cat.cat.codes
            fitted_maps[col] = mapping

    # Fill remaining NaN with -1
    out = out.fillna(-1)
    return out, fitted_maps


class MLModel:

    def __init__(self, config_path: str = "params/ml_params.yaml") -> None:
        self.cfg = load_config(config_path)
        model_name = self.cfg["model"]["name"]

        if model_name not in MODEL_REGISTRY:
            raise ValueError(f"Modele inconnu: '{model_name}'. Disponibles: {list(MODEL_REGISTRY)}")

        self.model_cls = MODEL_REGISTRY[model_name]
        self.model: BaseModel = self.model_cls()
        self.best_params: Dict[str, Any] = {}

    def optuna_objectives(self, model_name: str, trial: optuna.Trial) -> dict:
        optuna_cfg = self.cfg.get("optuna", {})

        if model_name == "xgboost":
            return {
                "objective": "binary:logistic",
                "eval_metric": "auc",
                "verbosity": 0,
                "n_estimators": optuna_cfg.get("n_estimators", 300),
                "max_depth": trial.suggest_int("max_depth", 3, 7),
                "learning_rate": trial.suggest_float("learning_rate", 0.03, 0.15, log=True),
                "scale_pos_weight": trial.suggest_int("scale_pos_weight", 300, 900),
            }

        raise ValueError(f"Aucune section Optuna pour le modele '{model_name}'")

    def _objective(self, trial: optuna.Trial, X: pd.DataFrame, y: pd.Series) -> float:
        params = self.optuna_objectives(self.model.name, trial)
        cv_cfg = self.cfg.get("optuna", {})
        n_trials = cv_cfg.get("n_trials", 20)

        log.info("[Optuna] Trial %d/%d starting...", trial.number + 1, n_trials)

        X_train, X_valid, y_train, y_valid = train_test_split(
            X, y,
            test_size=cv_cfg.get("validation_size", 0.2),
            random_state=trial.number,
            stratify=y,
        )
        model = self.model_cls(params=params)
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_valid)
        score = roc_auc_score(y_valid, proba)
        log.info("[Optuna] Trial %d/%d — ROC-AUC: %.4f", trial.number + 1, n_trials, score)
        return score

    def optimize(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        optuna_cfg = self.cfg.get("optuna", {})
        n_trials = optuna_cfg.get("n_trials", 20)

        log.info("[Optuna] Starting hyperparameter search (%d trials)", n_trials)
        optuna.logging.set_verbosity(optuna.logging.WARNING)
        study = optuna.create_study(direction="maximize")
        study.optimize(lambda trial: self._objective(trial, X, y), n_trials=n_trials)

        self.best_params = study.best_params
        self.best_params["n_estimators"] = optuna_cfg.get("n_estimators", 300)
        log.info("Best ROC-AUC: %.4f", study.best_value)
        log.info("Best params: %s", self.best_params)

        full_params = {
            "objective": "binary:logistic",
            "eval_metric": "auc",
            "verbosity": 0,
            **self.best_params,
        }
        self.model = self.model_cls(params=full_params)
        return self.best_params

    def train(self, X_train: pd.DataFrame, y_train: pd.Series, use_optuna: bool = True) -> None:
        if use_optuna:
            self.optimize(X_train, y_train)
        self.fit(X_train, y_train)

    def fit(self, X: pd.DataFrame, y: pd.Series) -> None:
        self.model.fit(X, y)

    def infer(self, X: pd.DataFrame, threshold: float | None = None) -> pd.DataFrame:
        thr = threshold or self.cfg["model"].get("threshold", 0.5)
        scores = self.model.predict_proba(X)
        preds = (scores >= thr).astype(int)
        return pd.DataFrame({"fraud_score": scores, "fraud_prediction": preds}, index=X.index)

    def save(self, path: str | None = None) -> None:
        p = path or self.cfg["model"].get("output_path", "outputs/models/model.joblib")
        Path(p).parent.mkdir(parents=True, exist_ok=True)
        self.model.save(p)

    def load(self, path: str | None = None) -> None:
        p = path or self.cfg["model"].get("output_path", "outputs/models/model.joblib")
        self.model = self.model_cls.load(p)

    def evaluate(
        self,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        threshold: float | None = None,
    ) -> dict[str, Any]:
        thr = threshold or self.cfg["model"].get("threshold", 0.5)
        scores = self.model.predict_proba(X_val)
        preds = (scores >= thr).astype(int)

        roc = roc_auc_score(y_val, scores)
        pr = average_precision_score(y_val, scores)

        report = classification_report(y_val, preds, target_names=["legit", "fraud"], digits=4)
        cm = confusion_matrix(y_val, preds)

        log.info("=== EVALUATION (threshold=%.2f) ===", thr)
        log.info("ROC-AUC: %.4f | PR-AUC: %.4f", roc, pr)
        log.info("\n%s", report)
        log.info(
            "Confusion matrix:\n"
            "                Pred legit  Pred fraud\n"
            "  Actual legit  %10d  %10d\n"
            "  Actual fraud  %10d  %10d",
            cm[0, 0], cm[0, 1], cm[1, 0], cm[1, 1],
        )

        return {"roc_auc": roc, "pr_auc": pr, "confusion_matrix": cm, "report": report}

    def run(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_infer: pd.DataFrame | None = None,
        use_optuna: bool = True,
    ) -> pd.DataFrame | None:
        self.train(X_train, y_train, use_optuna=use_optuna)
        self.save()
        if X_infer is None:
            return None
        return self.infer(X_infer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline fraud detection")
    parser.add_argument("--config", default="params/ml_params.yaml")
    parser.add_argument("--train-data", required=True, help="Train file (CSV or Parquet)")
    parser.add_argument("--test-data", help="Test file (CSV or Parquet, with target for evaluation)")
    parser.add_argument("--eval-data", help="Eval file (no target, for submission)")
    parser.add_argument("--target-col", default="is_fraud", help="Target column name")
    parser.add_argument("--no-optuna", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")

    # --- Load & prepare train ---
    log.info("Loading train: %s", args.train_data)
    train_raw = _load_file(args.train_data)
    X_train_raw, y_train, _ = _prepare_features(train_raw, args.target_col)
    X_train, cat_maps = _encode_categories(X_train_raw)
    log.info("Train: %d x %d (fraud=%d / %.3f%%)",
             X_train.shape[0], X_train.shape[1], y_train.sum(), y_train.mean() * 100)

    # --- Load & prepare test (with labels, for evaluation) ---
    X_test, y_test = None, None
    if args.test_data:
        log.info("Loading test: %s", args.test_data)
        test_raw = _load_file(args.test_data)
        X_test_raw, y_test, _ = _prepare_features(test_raw, args.target_col)
        X_test, _ = _encode_categories(X_test_raw, cat_maps=cat_maps)
        log.info("Test: %d x %d (fraud=%d / %.3f%%)",
                 X_test.shape[0], X_test.shape[1], y_test.sum(), y_test.mean() * 100)

    # --- Load & prepare eval (no labels, for submission) ---
    X_eval, txn_ids_eval = None, None
    if args.eval_data:
        log.info("Loading eval: %s", args.eval_data)
        eval_raw = _load_file(args.eval_data)
        X_eval_raw, _, txn_ids_eval = _prepare_features(eval_raw, args.target_col)
        X_eval, _ = _encode_categories(X_eval_raw, cat_maps=cat_maps)
        if txn_ids_eval is None:
            txn_ids_eval = pd.Series(range(len(X_eval)))
        log.info("Eval: %d x %d", X_eval.shape[0], X_eval.shape[1])

    # --- Train (Optuna on train, evaluate on test) ---
    ml = MLModel(config_path=args.config)
    ml.train(X_train, y_train, use_optuna=not args.no_optuna)

    if X_test is not None and y_test is not None:
        log.info("Evaluating on test set...")
        ml.evaluate(X_test, y_test)

    ml.save()

    # Save category mappings so export_web.py uses identical encoding
    import json as _json
    cat_maps_path = Path("outputs/models/cat_maps.json")
    cat_maps_path.parent.mkdir(parents=True, exist_ok=True)
    serialisable = {col: {str(k): int(v) for k, v in mapping.items()} for col, mapping in cat_maps.items()}
    with open(cat_maps_path, "w") as _f:
        _json.dump(serialisable, _f)
    log.info("Category maps saved to %s (%d columns)", cat_maps_path, len(serialisable))

    # --- Inference on eval set ---
    if X_eval is not None:
        from datetime import datetime
        pred_df = ml.infer(X_eval)
        submission = pd.DataFrame({
            "transaction_id": txn_ids_eval.values,
            "fraud_prediction": pred_df["fraud_prediction"].values,
        })
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = Path("outputs/submissions")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"submission_{stamp}.csv"
        submission.to_csv(out_path, index=False)
        latest = out_dir / "submission.csv"
        submission.to_csv(latest, index=False)
        log.info("Submission saved to %s (%d rows)", out_path, len(submission))
        log.info("Latest alias: %s", latest)


if __name__ == "__main__":
    main()
