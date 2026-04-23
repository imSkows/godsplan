---
name: mlops-mlflow
description: Handles MLflow experiment tracking, run logging, model registry, and artifact management. Use when training models, logging metrics/params/artifacts, comparing runs, registering models, or setting up reproducible ML experiments.
---

# MLOps — MLflow

## Setup

```python
import mlflow

mlflow.set_tracking_uri("mlruns/")
mlflow.set_experiment("fraud-detection")
```

## Standard Run Template

```python
with mlflow.start_run(run_name="xgboost-baseline"):
    mlflow.log_params({
        "model": "xgboost",
        "n_estimators": 300,
        "threshold": 0.5,
        "features": len(feature_cols),
    })

    model.fit(X_train, y_train)

    mlflow.log_metrics({
        "roc_auc": roc_auc_score(y_val, proba),
        "pr_auc": average_precision_score(y_val, proba),
        "f1": f1_score(y_val, preds),
    })

    mlflow.sklearn.log_model(model, artifact_path="model")

    if hasattr(model, 'feature_importances_'):
        fi = pd.Series(model.feature_importances_, index=feature_cols)
        fi.to_csv("outputs/res_perf/feature_importance.csv")
        mlflow.log_artifact("outputs/res_perf/feature_importance.csv")
```

## Model Registry

```python
mlflow.register_model(
    model_uri=f"runs:/{run_id}/model",
    name="fraud-detector"
)
```

## Artifact Paths Convention

| Artifact            | Path                                        |
|---------------------|---------------------------------------------|
| Trained models      | `mlruns/` (managed by MLflow)               |
| Submission CSVs     | `outputs/submissions/`                      |
| Performance reports | `outputs/res_perf/`                         |
| Feature importance  | `outputs/res_perf/feature_importance_<run>.csv` |

## Reproducibility

- Always log `random_state` as param
- Log dataset hash or row count as tag: `mlflow.set_tag("n_train", len(X_train))`
- Pin library versions in `requirements.txt` before logging runs
