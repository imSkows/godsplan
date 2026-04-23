from __future__ import annotations

import logging

import joblib
import pandas as pd
import xgboost as xgb

from .base_model import BaseModel

log = logging.getLogger(__name__)


class XGBoost(BaseModel):

    def __init__(self, params: dict | None = None) -> None:
        self.params = params or {
            "objective": "binary:logistic",
            "eval_metric": "auc",
            "scale_pos_weight": 666,
            "max_depth": 5,
            "learning_rate": 0.05,
            "n_estimators": 300,
            "verbosity": 0,
        }
        n_estimators = self.params.pop("n_estimators", 300)
        self.model = xgb.XGBClassifier(n_estimators=n_estimators, **self.params)
        self.params["n_estimators"] = n_estimators

    @property
    def name(self) -> str:
        return "xgboost"

    def fit(self, X: pd.DataFrame, y: pd.Series) -> None:
        log.info("Training XGBoost (%d samples, %d features)", len(X), X.shape[1])
        self.model.fit(X, y)

    def predict(self, X: pd.DataFrame) -> pd.Series:
        return pd.Series(self.model.predict(X), index=X.index)

    def predict_proba(self, X: pd.DataFrame) -> pd.Series:
        return pd.Series(self.model.predict_proba(X)[:, 1], index=X.index)

    def save(self, path: str) -> None:
        joblib.dump(self.model, path)
        log.info("Model saved to %s", path)

    @classmethod
    def load(cls, path: str) -> "XGBoost":
        instance = cls()
        if path.endswith(".ubj") or path.endswith(".json"):
            import xgboost as xgb
            instance.model = xgb.XGBClassifier()
            instance.model.load_model(path)
        else:
            instance.model = joblib.load(path)
        return instance
