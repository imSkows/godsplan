"""Pipeline de préparation des données pour la détection de fraude bancaire.

Extrait du notebook `02_Data_Preparation_Pipeline.ipynb` pour pouvoir être
importé par les notebooks d'entraînement / tuning.

Usage :
    from preprocess_pipeline import preprocess_dataset
    df_prepared = preprocess_dataset(df_raw)
"""
from __future__ import annotations

import time
from typing import List

import numpy as np
import pandas as pd

# ===================================================================
# 1. Constantes
# ===================================================================

US_STATE_CENTROIDS = {
    'AL': (32.806671, -86.791130), 'AK': (61.370716, -152.404419), 'AZ': (33.729759, -111.431221),
    'AR': (34.969704, -92.373123),  'CA': (36.116203, -119.681564), 'CO': (39.059811, -105.311104),
    'CT': (41.597782, -72.755371),  'DE': (39.318523, -75.507141),  'DC': (38.897438, -77.026817),
    'FL': (27.766279, -81.686783),  'GA': (33.040619, -83.643074),  'HI': (21.094318, -157.498337),
    'ID': (44.240459, -114.478828), 'IL': (40.349457, -88.986137),  'IN': (39.849426, -86.258278),
    'IA': (42.011539, -93.210526),  'KS': (38.526600, -96.726486),  'KY': (37.668140, -84.670067),
    'LA': (31.169546, -91.867805),  'ME': (44.693947, -69.381927),  'MD': (39.063946, -76.802101),
    'MA': (42.230171, -71.530106),  'MI': (43.326618, -84.536095),  'MN': (45.694454, -93.900192),
    'MS': (32.741646, -89.678696),  'MO': (38.456085, -92.288368),  'MT': (46.921925, -110.454353),
    'NE': (41.125370, -98.268082),  'NV': (38.313515, -117.055374), 'NH': (43.452492, -71.563896),
    'NJ': (40.298904, -74.521011),  'NM': (34.840515, -106.248482), 'NY': (42.165726, -74.948051),
    'NC': (35.630066, -79.806419),  'ND': (47.528912, -99.784012),  'OH': (40.388783, -82.764915),
    'OK': (35.565342, -96.928917),  'OR': (44.572021, -122.070938), 'PA': (40.590752, -77.209755),
    'RI': (41.680893, -71.511780),  'SC': (33.856892, -80.945007),  'SD': (44.299782, -99.438828),
    'TN': (35.747845, -86.692345),  'TX': (31.054487, -97.563461),  'UT': (40.150032, -111.862434),
    'VT': (44.045876, -72.710686),  'VA': (37.769337, -78.169968),  'WA': (47.400902, -121.490494),
    'WV': (38.491226, -80.954453),  'WI': (44.268543, -89.616508),  'WY': (42.755966, -107.302490),
}

MONEY_COLS = ['amount', 'credit_limit', 'yearly_income', 'total_debt', 'per_capita_income']
BOOL_COLS  = ['has_chip', 'card_on_dark_web']

ID_COLS = ['client_id', 'card_id', 'transaction_id', 'merchant_id', 'card_number', 'cvv']

RAW_COLS_TO_DROP = [
    'date', 'datetime', 'expires', 'acct_open_date',
    'latitude', 'longitude', 'zip', 'address',
    'birth_year', 'birth_month', 'year',
    'dow', 'day_name',
    'amount', 'credit_limit', 'yearly_income',
    'total_debt', 'per_capita_income',
    'amount_clean', 'credit_limit_clean', 'yearly_income_clean',
    'total_debt_clean', 'per_capita_income_clean',
    'mcc', 'mcc_desc',
    'merchant_state_clean', 'home_state',
]

CATEGORICAL_COLS = [
    'mcc_description', 'merchant_state', 'merchant_city',
    'use_chip', 'card_type', 'card_brand',
    'gender', 'errors', 'geo_bucket',
]

# ===================================================================
# 2. Helpers bas niveau
# ===================================================================

def clean_money_column(series: pd.Series) -> pd.Series:
    """'$1,234.56' -> 1234.56 (float32). Robuste aux NaN et colonnes déjà numériques."""
    if pd.api.types.is_numeric_dtype(series):
        return series.astype(np.float32)
    return (
        series.astype(str)
        .str.replace(r'[\$,]', '', regex=True)
        .str.strip()
        .replace({'': np.nan, 'nan': np.nan, 'None': np.nan, 'NaN': np.nan})
        .astype(np.float32)
    )


def yes_no_to_int(series: pd.Series) -> pd.Series:
    """'Yes'/'YES'/'yes' -> 1, autres -> 0. NaN -> 0."""
    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0).astype(np.int8)
    return (series.astype(str).str.strip().str.lower() == 'yes').astype(np.int8)


def latlong_to_state(lat_arr: np.ndarray, lon_arr: np.ndarray) -> np.ndarray:
    """Affecte à chaque (lat, lon) l'état US du centroïde le plus proche (haversine)."""
    states = np.array(list(US_STATE_CENTROIDS.keys()))
    centroids = np.deg2rad(np.array(list(US_STATE_CENTROIDS.values())))
    pts = np.deg2rad(np.c_[lat_arr.astype(float), lon_arr.astype(float)])
    dlat = pts[:, [0]] - centroids[:, 0]
    dlon = pts[:, [1]] - centroids[:, 1]
    a = np.sin(dlat / 2) ** 2 + np.cos(pts[:, [0]]) * np.cos(centroids[:, 0]) * np.sin(dlon / 2) ** 2
    d = 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    out = states[np.argmin(d, axis=1)]
    nan_mask = np.isnan(lat_arr) | np.isnan(lon_arr)
    out = np.where(nan_mask, 'UNK', out)
    return out


def memory_mb(df: pd.DataFrame) -> float:
    return df.memory_usage(deep=True).sum() / 1024 ** 2


def safe_divide(num: pd.Series, den: pd.Series) -> pd.Series:
    """num / den en remplaçant les 0 du dénominateur par NaN et les inf par NaN."""
    den_safe = den.replace(0, np.nan)
    out = num / den_safe
    return out.replace([np.inf, -np.inf], np.nan).astype(np.float32)


# ===================================================================
# 3. Sous-fonctions par bloc de features
# ===================================================================

def _basic_cleaning(df: pd.DataFrame) -> pd.DataFrame:
    for col in MONEY_COLS:
        clean_col = f'{col}_clean'
        if clean_col in df.columns and pd.api.types.is_numeric_dtype(df[clean_col]):
            df[col] = df[clean_col].astype(np.float32)
        elif col in df.columns:
            df[col] = clean_money_column(df[col])

    for col in BOOL_COLS:
        if col in df.columns:
            df[col] = yes_no_to_int(df[col])

    if 'datetime' in df.columns and pd.api.types.is_datetime64_any_dtype(df['datetime']):
        df['_ts'] = df['datetime']
    elif 'date' in df.columns:
        df['_ts'] = pd.to_datetime(df['date'], errors='coerce')
    else:
        df['_ts'] = pd.NaT

    if 'errors' in df.columns:
        df['errors'] = df['errors'].fillna('none').astype(str).str.lower().str.strip()
        df['has_error'] = (df['errors'] != 'none').astype(np.int8)

    if 'merchant_state' in df.columns:
        df['merchant_state'] = (df['merchant_state'].astype(str).str.upper().str.strip()
                                .replace({'NAN': np.nan, 'NONE': np.nan, '': np.nan}))

    if 'amount' in df.columns:
        df['amount_abs'] = df['amount'].abs().astype(np.float32)
        df['is_refund']  = (df['amount'] < 0).astype(np.int8)

    if 'mcc_description' not in df.columns:
        if 'mcc_desc' in df.columns:
            df['mcc_description'] = df['mcc_desc'].astype(str)
        elif 'mcc' in df.columns:
            df['mcc_description'] = df['mcc'].astype(str)

    return df


def _time_features(df: pd.DataFrame) -> pd.DataFrame:
    ts = df['_ts']
    df['hour']       = ts.dt.hour.astype('Int16')
    df['dayofweek']  = ts.dt.dayofweek.astype('Int16')
    df['month']      = ts.dt.month.astype('Int16')
    df['is_weekend'] = (df['dayofweek'] >= 5).astype(np.int8)
    df['is_night']   = df['hour'].isin([22, 23, 0, 1, 2, 3, 4, 5]).astype(np.int8)
    return df


def _geo_features(df: pd.DataFrame) -> pd.DataFrame:
    if {'latitude', 'longitude'}.issubset(df.columns):
        lat = df['latitude'].astype(float).values
        lon = df['longitude'].astype(float).values
        df['home_state'] = latlong_to_state(lat, lon)
    else:
        df['home_state'] = 'UNK'

    df['is_online_tx'] = (
        df.get('use_chip', pd.Series('', index=df.index))
          .astype(str).str.lower().str.contains('online')
    ).astype(np.int8)

    ms = df.get('merchant_state', pd.Series(np.nan, index=df.index))

    df['is_out_of_state'] = np.where(
        df['is_online_tx'] == 1, 1,
        np.where(ms.isna(), 1, (ms != df['home_state']).astype(np.int8))
    ).astype(np.int8)

    df['geo_bucket'] = np.select(
        [df['is_online_tx'] == 1,
         ms.isna(),
         ms == df['home_state']],
        ['online', 'unknown_state', 'in_state'],
        default='out_of_state',
    )
    return df


def _velocity_features(df: pd.DataFrame) -> pd.DataFrame:
    if 'card_id' not in df.columns or df['_ts'].isna().all():
        df['time_since_last_trans_min']      = np.nan
        df['amount_last_24h']                = 0.0
        df['n_tx_last_24h']                  = 0
        df['previous_transaction_had_error'] = 0
        return df

    original_index = df.index.copy()
    df = df.sort_values(['card_id', '_ts'], kind='mergesort')

    df['time_since_last_trans_min'] = (
        df.groupby('card_id', sort=False)['_ts'].diff().dt.total_seconds() / 60.0
    ).astype(np.float32)
    df['time_since_last_trans_min'] = df['time_since_last_trans_min'].replace(
        [np.inf, -np.inf], np.nan
    )

    roll = (
        df.set_index('_ts')
          .groupby('card_id', sort=False)['amount_abs']
          .rolling('24h', closed='left')
    )
    rolling_sum   = roll.sum().reset_index(level=0, drop=True)
    rolling_count = roll.count().reset_index(level=0, drop=True)

    df['amount_last_24h'] = rolling_sum.values.astype(np.float32)
    df['n_tx_last_24h']   = rolling_count.values
    df['amount_last_24h'] = df['amount_last_24h'].fillna(0.0).astype(np.float32)
    df['n_tx_last_24h']   = df['n_tx_last_24h'].fillna(0).astype(np.int32)

    has_err = df.get('has_error', pd.Series(0, index=df.index))
    df['previous_transaction_had_error'] = (
        df.assign(_he=has_err)
          .groupby('card_id', sort=False)['_he']
          .shift(1)
          .fillna(0)
          .astype(np.int8)
    )

    df = df.reindex(original_index)
    return df


def _financial_ratios(df: pd.DataFrame) -> pd.DataFrame:
    if {'amount_abs', 'credit_limit'}.issubset(df.columns):
        df['ratio_amount_credit_limit'] = safe_divide(df['amount_abs'], df['credit_limit'])
    else:
        df['ratio_amount_credit_limit'] = np.nan

    if {'amount_abs', 'yearly_income'}.issubset(df.columns):
        monthly = df['yearly_income'] / 12.0
        df['ratio_amount_monthly_income'] = safe_divide(df['amount_abs'], monthly)
    else:
        df['ratio_amount_monthly_income'] = np.nan

    if {'total_debt', 'yearly_income'}.issubset(df.columns):
        df['debt_to_income'] = safe_divide(df['total_debt'], df['yearly_income'])
    else:
        df['debt_to_income'] = np.nan
    return df


def _golden_features(df: pd.DataFrame) -> pd.DataFrame:
    if 'amount_abs' in df.columns:
        df['is_micro_transaction'] = (df['amount_abs'] < 2.0).astype(np.int8)
        cents = (df['amount_abs'] * 100).round().astype('Int64')
        df['is_round_amount'] = (cents % 100 == 0).astype(np.int8)
        df['amount_log1p']    = np.log1p(df['amount_abs']).astype(np.float32)
    else:
        df['is_micro_transaction'] = 0
        df['is_round_amount']      = 0
        df['amount_log1p']         = np.nan
    return df


def _finalize_types_and_drop(df: pd.DataFrame) -> pd.DataFrame:
    df = df.drop(columns=[c for c in ID_COLS if c in df.columns], errors='ignore')
    df = df.drop(columns=[c for c in RAW_COLS_TO_DROP if c in df.columns], errors='ignore')
    df = df.drop(columns=['_ts'], errors='ignore')

    keep_int_cols = {
        'is_fraud', 'is_weekend', 'is_night', 'is_online_tx',
        'is_out_of_state', 'has_chip', 'card_on_dark_web', 'has_error',
        'is_refund', 'is_micro_transaction', 'is_round_amount',
        'previous_transaction_had_error', 'n_tx_last_24h',
        'hour', 'dayofweek', 'month',
        'num_credit_cards', 'num_cards_issued', 'credit_score',
        'current_age', 'retirement_age', 'year_pin_last_changed',
    }

    num_cols = df.select_dtypes(include=[np.number]).columns
    for c in num_cols:
        if c in keep_int_cols:
            try:
                df[c] = df[c].astype('Int32') if df[c].isna().any() else df[c].astype(np.int32)
            except Exception:
                df[c] = df[c].astype(np.float32)
        else:
            df[c] = df[c].astype(np.float32)

    for c in CATEGORICAL_COLS:
        if c in df.columns:
            df[c] = df[c].astype(str).fillna('missing').astype('category')

    if 'is_fraud' in df.columns:
        cols = ['is_fraud'] + [c for c in df.columns if c != 'is_fraud']
        df = df[cols]

    return df


# ===================================================================
# 4. Pipeline global
# ===================================================================

def preprocess_dataset(df: pd.DataFrame, verbose: bool = False) -> pd.DataFrame:
    """Applique l'intégralité du pipeline de préparation à un DataFrame.

    Étapes :
      1. Nettoyage de base ($ -> float, Yes/No -> 0/1, date -> datetime)
      2. Features temporelles
      3. Features géographiques (home_state, is_out_of_state)
      4. Velocity features (sur card_id)
      5. Ratios financiers
      6. Golden features
      7. Typage final + drop des identifiants

    Fonction idempotente : applicable plusieurs fois sans casser le résultat.
    """
    df = df.copy()
    steps = [
        ('01_basic_cleaning',    _basic_cleaning),
        ('02_time_features',     _time_features),
        ('03_geo_features',      _geo_features),
        ('04_velocity_features', _velocity_features),
        ('05_financial_ratios',  _financial_ratios),
        ('06_golden_features',   _golden_features),
        ('07_finalize',          _finalize_types_and_drop),
    ]
    for name, fn in steps:
        t0 = time.perf_counter()
        df = fn(df)
        if verbose:
            print(f'  [{name}] done in {time.perf_counter()-t0:.2f}s '
                  f'| shape={df.shape} | mem={memory_mb(df):.2f} MB')
    return df
