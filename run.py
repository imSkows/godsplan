import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from fraud_detection.config import load_config
from fraud_detection.predict import generate_submission
from fraud_detection.train import train_baseline


def main() -> None:
    parser = argparse.ArgumentParser(description="Fraud detection baseline CLI")
    parser.add_argument("command", choices=["train", "predict"])
    parser.add_argument("--config", default="configs/baseline.yaml")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.command == "train":
        train_baseline(config)
    elif args.command == "predict":
        generate_submission(config)


if __name__ == "__main__":
    main()
