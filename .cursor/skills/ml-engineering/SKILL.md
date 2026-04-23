---
name: ml-engineering
description: Guides model class creation, inference pipeline design, and production-ready ML code for fraud detection. Use when adding a new model to src/models/, editing src/mlmodel.py, building a prediction pipeline, or writing reusable training/inference code.
---

# ML Engineering — Fraud Detection

## Model Class Convention

Every new model goes in `src/models/<name>_model.py` and inherits `BaseFraudModel`:

```python
# src/models/lgbm_model.py
from __future__ import annotations
import joblib
import pandas as pd
import lightgbm as lgb
from .base_model import BaseFraudModel

class LGBMFraudModel(BaseFraudModel):
    def __init__(self, params: dict | None = None):
        self.params = params or {
            'objective': 'binary', 'metric': 'auc',
            'is_unbalance': True, 'verbose': -1,
        }
        self.model = None

    @property
    def name(self) -> str:
        return "lightgbm"

    def fit(self, X: pd.DataFrame, y: pd.Series) -> None:
        dtrain = lgb.Dataset(X, label=y)
        self.model = lgb.train(self.params, dtrain, num_boost_round=500)

    def predict(self, X: pd.DataFrame) -> pd.Series:
        return (self.predict_proba(X) >= 0.5).astype(int)

    def predict_proba(self, X: pd.DataFrame) -> pd.Series:
        return pd.Series(self.model.predict(X), index=X.index)

    def save(self, path: str) -> None:
        joblib.dump(self.model, path)

    @classmethod
    def load(cls, path: str) -> "LGBMFraudModel":
        instance = cls()
        instance.model = joblib.load(path)
        return instance
```

## Registering in MLModel

Add to `src/mlmodel.py` `MODEL_REGISTRY`:

```python
from models.lgbm_model import LGBMFraudModel

MODEL_REGISTRY = {
    "logistic_regression": LogisticFraudModel,
    "random_forest": RandomForestFraudModel,
    "lightgbm": LGBMFraudModel,          # add here
}
```

## Inference Pipeline

`src/mlmodel.py` is the single inference entrypoint:
- Load config from `params/ml_params.yaml`
- Instantiate model by name via `MODEL_REGISTRY`
- Call `model.load(path)` then `mlmodel.infer(X)` → returns DataFrame with `fraud_score` + `fraud_prediction`

## Submission Format

```python
submission = pd.DataFrame({
    "transaction_id": eval_df["transaction_id"],
    "fraud_prediction": preds,            # int 0/1
})
submission.to_csv("outputs/submissions/submission.csv", index=False)
```

## Code Quality Rules

- No model-specific logic in `mlmodel.py` — only dispatch via registry
- `BaseFraudModel` interface must stay stable (never remove methods)
- Each model file is self-contained (imports, save/load)
- No `print()` in model classes — use `logging`
