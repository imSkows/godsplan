---
name: data-scientist
description: Guides EDA, feature engineering, and model exploration for fraud detection tabular datasets. Use when exploring data, building features, analyzing distributions, checking class imbalance, or producing insights from transactions/users/cards tables.
---

# Data Scientist — Fraud Detection

## EDA Checklist

When exploring a new dataset:
- Shape, dtypes, missing values per table
- Target distribution — always plot and print imbalance ratio
- Distributions: numeric (log scale for amounts), categorical (use_chip, mcc, merchant_state)
- Correlations between features and fraud label
- Temporal patterns: hour, day_of_week, month

## Cold-Start Rule (critical)

> The evaluation set contains **unseen clients**. Features aggregated per `client_id` are **leakage**.

Safe features must be computable for a brand-new client:
- Transaction-level: amount, date, use_chip, mcc, merchant_state, errors
- Card-level: card_on_dark_web, has_chip, credit_limit, expires
- User-level: credit_score, income, debt (static profile, not history)
- MCC fraud rate: target-encode on training folds only (CV)

Forbidden features:
- `client_id` rolling fraud rate
- nb transactions per client
- any aggregate keyed on `client_id`

## Feature Engineering Conventions

```python
df['log_amount'] = np.log1p(df['amount'].clip(lower=0))

df['hour'] = df['date'].dt.hour
df['is_night'] = df['hour'].between(0, 5).astype(int)
df['is_weekend'] = (df['date'].dt.dayofweek >= 5).astype(int)

# MCC target encoding — use only within CV folds
mcc_rates = train.groupby('mcc')['fraud_label'].mean().to_dict()
df['mcc_fraud_rate'] = df['mcc'].map(mcc_rates).fillna(global_rate)
```

## Notebook Conventions

- One notebook per author/experiment: `notebooks/exploration_<name>.ipynb`
- Cell order: imports -> load -> EDA -> features -> model sketch
- Save outputs (plots, stats) in `outputs/res_perf/` if shareable

## Metrics

Primary: `ROC-AUC`
Secondary: `PR-AUC` (more informative on extreme imbalance), `F1` with threshold search
