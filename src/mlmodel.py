"""Module central des modeles: registry + train + infer + optuna."""
from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any, Dict, Type

import optuna
import pandas as pd
import yaml
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from models import BaseModel, XGBoost

log = logging.getLogger(__name__)

MODEL_REGISTRY: Dict[str, Type[BaseModel]] = {
    "xgboost": XGBoost,
}


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


class MLModel:

    def __init__(self, config_path: str = "params/ml_params.yaml") -> None:
        self.cfg = load_config(config_path)
        model_name = self.cfg["model"]["name"]

        if model_name not in MODEL_REGISTRY:
            raise ValueError(f"Modèle inconnu: '{model_name}'. Disponibles: {list(MODEL_REGISTRY)}")

        self.model_cls = MODEL_REGISTRY[model_name]
        self.model: BaseModel = self.model_cls()
        self.best_params: Dict[str, Any] = {}

    def optuna_objectives(self, model_name: str, trial: optuna.Trial) -> dict:
        """Un seul point d'entree Optuna. Ajouter une section par modele."""
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
        test_size = cv_cfg.get("validation_size", 0.2)
        random_state = cv_cfg.get("random_state", 42)

        X_train, X_valid, y_train, y_valid = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=random_state,
            stratify=y,
        )
        model = self.model_cls(params=params)
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_valid)
        return roc_auc_score(y_valid, proba)

    def optimize(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        """Lance Optuna et applique les meilleurs parametres au modele."""
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
        """Processus general d'entrainement."""
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

    def run(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_infer: pd.DataFrame | None = None,
        use_optuna: bool = True,
    ) -> pd.DataFrame | None:
        """Processus general: train puis infer (optionnel)."""
        self.train(X_train, y_train, use_optuna=use_optuna)
        self.save()
        if X_infer is None:
            return None
        return self.infer(X_infer)


def _read_train_frame(train_csv: str, target_col: str) -> tuple[pd.DataFrame, pd.Series]:
    train_df = pd.read_csv(train_csv)
    if target_col not in train_df.columns:
        raise ValueError(f"Colonne target '{target_col}' absente dans {train_csv}")
    X_train = train_df.drop(columns=[target_col])
    y_train = train_df[target_col].astype(int)
    return X_train, y_train


def main() -> None:
    """Main minimal qui appelle le processus run()."""
    parser = argparse.ArgumentParser(description="Main minimal pour entrainer et inferer")
    parser.add_argument("--config", default="params/ml_params.yaml")
    parser.add_argument("--train-csv", required=True)
    parser.add_argument("--target-col", default="fraud_label")
    parser.add_argument("--infer-csv")
    parser.add_argument("--no-optuna", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")

    ml = MLModel(config_path=args.config)
    X_train, y_train = _read_train_frame(args.train_csv, args.target_col)
    X_infer = pd.read_csv(args.infer_csv) if args.infer_csv else None
    pred_df = ml.run(
        X_train=X_train,
        y_train=y_train,
        X_infer=X_infer,
        use_optuna=not args.no_optuna,
    )

    if pred_df is not None:
        output_path = Path("outputs/submissions/predictions.csv")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pred_df.to_csv(output_path, index=False)
        log.info("Predictions saved to %s", output_path)


if __name__ == "__main__":
    main()
