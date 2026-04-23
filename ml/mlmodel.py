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


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_file(path: str) -> pd.DataFrame:
    if path.endswith(".parquet"):
        return pd.read_parquet(path)
    return pd.read_csv(path)


def _encode_categories(
    df: pd.DataFrame,
    cat_maps: dict[str, dict] | None = None,
) -> tuple[pd.DataFrame, dict[str, dict]]:
    """
    Encode category/object columns as int codes.
    Si cat_maps est fourni (eval), on reutilise le mapping du train.
    Si cat_maps est None (train), on le construit.
    """
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

        X_train, X_valid, y_train, y_valid = train_test_split(
            X, y,
            test_size=cv_cfg.get("validation_size", 0.2),
            random_state=trial.number,
            stratify=y,
        )
        model = self.model_cls(params=params)
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_valid)
        return roc_auc_score(y_valid, proba)

    def optimize(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        optuna_cfg = self.cfg.get("optuna", {})
        n_trials = optuna_cfg.get("n_trials", 20)

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
    parser.add_argument("--train-data", required=True, help="Train file (CSV or Parquet, with target)")
    parser.add_argument("--eval-data", help="Eval file (CSV or Parquet)")
    parser.add_argument("--target-col", default="is_fraud", help="Target column name")
    parser.add_argument("--no-optuna", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")

    # --- Load train ---
    log.info("Loading train: %s", args.train_data)
    train_df = _load_file(args.train_data)
    if args.target_col not in train_df.columns:
        raise ValueError(f"Colonne '{args.target_col}' absente dans {args.train_data}")

    y_full = train_df[args.target_col].astype(int)
    X_full, cat_maps = _encode_categories(train_df.drop(columns=[args.target_col]))
    log.info("Train: %d x %d (fraud=%d / %.3f%%)",
             X_full.shape[0], X_full.shape[1], y_full.sum(), y_full.mean() * 100)

    # --- Load eval (meme encoding que train) ---
    X_eval, txn_ids = None, None
    if args.eval_data:
        log.info("Loading eval: %s", args.eval_data)
        eval_df = _load_file(args.eval_data)
        drop_cols = []
        if args.target_col in eval_df.columns:
            drop_cols.append(args.target_col)
        if "transaction_id" in eval_df.columns:
            txn_ids = eval_df["transaction_id"]
            drop_cols.append("transaction_id")
        else:
            txn_ids = pd.Series(range(len(eval_df)))
        X_eval, _ = _encode_categories(eval_df.drop(columns=drop_cols), cat_maps=cat_maps)
        log.info("Eval: %d x %d", X_eval.shape[0], X_eval.shape[1])

    # --- Phase 1: split, optimize, train, evaluate ---
    indices = np.arange(len(X_full))
    train_idx, val_idx = train_test_split(
        indices, test_size=0.2, random_state=42, stratify=y_full,
    )
    X_tr, X_val = X_full.iloc[train_idx], X_full.iloc[val_idx]
    y_tr, y_val = y_full.iloc[train_idx], y_full.iloc[val_idx]

    ml = MLModel(config_path=args.config)
    ml.train(X_tr, y_tr, use_optuna=not args.no_optuna)
    ml.evaluate(X_val, y_val)

    # --- Phase 2: retrain on full data, save, infer ---
    log.info("Retraining on full train set...")
    ml.fit(X_full, y_full)
    ml.save()

    if X_eval is not None and txn_ids is not None:
        pred_df = ml.infer(X_eval)
        submission = pd.DataFrame({
            "transaction_id": txn_ids.values,
            "fraud_prediction": pred_df["fraud_prediction"].values,
        })
        out_path = Path("outputs/submissions/submission.csv")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        submission.to_csv(out_path, index=False)
        log.info("Submission saved to %s (%d rows)", out_path, len(submission))


if __name__ == "__main__":
    main()
