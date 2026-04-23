"""
Export script: Run the data pipeline and save every train/test split as Parquet.

Usage:
    python export_parquet.py

Outputs are saved to:
    datasets/parquet/train_<tag>.parquet
    datasets/parquet/test_<tag>.parquet
"""

import sys
from pathlib import Path

# Ensure the project root is importable
sys.path.insert(0, str(Path(__file__).parent))

import data_pipeline as dp  # noqa: E402


def export_splits_to_parquet() -> None:
    """Run the full pipeline and convert every split to Parquet."""

    # ── 1. Run the pipeline (merge → clean → validate → split) ──
    print("=" * 70)
    print("  Running data pipeline …")
    print("=" * 70)
    splits = dp.main()  # dict[tag, (train_df, test_df)]

    # ── 2. Prepare output directory ──
    parquet_dir = dp.OUTPUT_DIR / "parquet"
    parquet_dir.mkdir(parents=True, exist_ok=True)

    # ── 3. Convert each split to Parquet ──
    print("\n" + "=" * 70)
    print("  Exporting splits to Parquet")
    print("=" * 70)

    total_files = 0

    for tag, (train_df, test_df) in splits.items():
        train_path = parquet_dir / f"train_{tag}.parquet"
        test_path  = parquet_dir / f"test_{tag}.parquet"

        train_df.to_parquet(train_path, index=False, engine="pyarrow")
        test_df.to_parquet(test_path, index=False, engine="pyarrow")

        total_files += 2

        csv_train_size = (dp.OUTPUT_DIR / f"train_{tag}.csv").stat().st_size
        csv_test_size  = (dp.OUTPUT_DIR / f"test_{tag}.csv").stat().st_size
        pq_train_size  = train_path.stat().st_size
        pq_test_size   = test_path.stat().st_size

        train_ratio = pq_train_size / csv_train_size * 100
        test_ratio  = pq_test_size / csv_test_size * 100

        print(f"  ✅ {tag}")
        print(f"     train: {csv_train_size/1e6:>7.2f} MB (CSV) → "
              f"{pq_train_size/1e6:>7.2f} MB (Parquet)  "
              f"[{train_ratio:.0f}% of original]")
        print(f"     test : {csv_test_size/1e6:>7.2f} MB (CSV) → "
              f"{pq_test_size/1e6:>7.2f} MB (Parquet)  "
              f"[{test_ratio:.0f}% of original]")

    print(f"\n  🏁 {total_files} Parquet files saved to {parquet_dir}/")


if __name__ == "__main__":
    export_splits_to_parquet()
