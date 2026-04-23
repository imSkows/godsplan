"""
FastAPI backend for the fraud-detection dashboard.

Endpoints
---------
POST /api/run                 Train + evaluate the model.
POST /api/export-submission   Generate submission CSV from the trained model.
GET  /api/status              Current job status & last-run summary.
GET  /api/logs                Stream of log lines from the current/last run.

Only one job runs at a time. Subprocess stdout/stderr is captured line-by-line
and exposed to the frontend so the UI can stream progress.

Run:
    PYTHONPATH=ml uvicorn api.server:app --reload --port 8000
"""
from __future__ import annotations

import json
import logging
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

log = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="Fraud Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobState:
    """Thread-safe wrapper for the currently running / most recent pipeline job."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.status: str = "idle"  # idle | running | completed | failed
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None
        self.exit_code: Optional[int] = None
        self.error: Optional[str] = None
        self.logs: Deque[str] = deque(maxlen=2000)
        self.current_step: str = ""
        self.proc: Optional[subprocess.Popen[str]] = None

    def reset(self) -> None:
        with self._lock:
            self.status = "running"
            self.started_at = time.time()
            self.finished_at = None
            self.exit_code = None
            self.error = None
            self.logs.clear()
            self.current_step = "Starting..."

    def append_log(self, line: str) -> None:
        with self._lock:
            self.logs.append(line)

    def set_step(self, step: str) -> None:
        with self._lock:
            self.current_step = step

    def finish(self, exit_code: int, error: Optional[str] = None) -> None:
        with self._lock:
            self.status = "completed" if exit_code == 0 else "failed"
            self.exit_code = exit_code
            self.finished_at = time.time()
            self.error = error
            self.proc = None

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "status": self.status,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "exit_code": self.exit_code,
                "error": self.error,
                "current_step": self.current_step,
                "duration": (
                    (self.finished_at or time.time()) - self.started_at
                    if self.started_at
                    else None
                ),
                "log_count": len(self.logs),
            }

    def get_logs(self, offset: int = 0) -> list[str]:
        with self._lock:
            return list(self.logs)[offset:]


job = JobState()


class RunRequest(BaseModel):
    train_data: str = "dataset_cleaned/train_original_ratio.parquet"
    test_data: Optional[str] = "dataset_cleaned/test_original_ratio.parquet"
    eval_data: Optional[str] = "dataset_cleaned/test_original_ratio.parquet"
    target_col: str = "is_fraud"
    no_optuna: bool = False
    export_web: bool = True


def _stream_process(proc: subprocess.Popen[str], step_label: str) -> int:
    """Read stdout line-by-line and push into the global job log."""
    job.set_step(step_label)
    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.rstrip()
        if not line:
            continue
        job.append_log(line)
    proc.wait()
    return proc.returncode or 0


def _run_pipeline(req: RunRequest) -> None:
    """Run the ML pipeline as a subprocess, then export data to the web folder."""
    try:
        env_bin = sys.executable

        cmd = [
            env_bin,
            str(PROJECT_ROOT / "ml" / "mlmodel.py"),
            "--train-data", str(PROJECT_ROOT / req.train_data),
            "--target-col", req.target_col,
        ]
        if req.test_data:
            cmd += ["--test-data", str(PROJECT_ROOT / req.test_data)]
        if req.eval_data:
            cmd += ["--eval-data", str(PROJECT_ROOT / req.eval_data)]
        if req.no_optuna:
            cmd += ["--no-optuna"]

        job.append_log(f"$ {' '.join(cmd)}")
        import os as _os
        env = _os.environ.copy()
        env["PYTHONPATH"] = str(PROJECT_ROOT / "ml")
        env["PYTHONUNBUFFERED"] = "1"
        proc = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        job.proc = proc
        rc = _stream_process(proc, "Training & evaluating")

        if rc != 0:
            job.finish(rc, error="ml pipeline failed")
            return

        if req.export_web:
            export_cmd = [
                env_bin,
                str(PROJECT_ROOT / "ml" / "export_web.py"),
            ]
            job.append_log(f"$ {' '.join(export_cmd)}")
            proc2 = subprocess.Popen(
                export_cmd,
                cwd=str(PROJECT_ROOT),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            job.proc = proc2
            rc2 = _stream_process(proc2, "Exporting predictions for dashboard")

            if rc2 != 0:
                job.finish(rc2, error="web export failed")
                return

            preprocess_cmd = [
                str(PROJECT_ROOT / "node_modules" / ".bin" / "tsx"),
                str(PROJECT_ROOT / "web" / "scripts" / "preprocess.ts"),
            ]
            job.append_log(f"$ {' '.join(preprocess_cmd)}")
            proc3 = subprocess.Popen(
                preprocess_cmd,
                cwd=str(PROJECT_ROOT),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            job.proc = proc3
            rc3 = _stream_process(proc3, "Regenerating dashboard metrics")

            if rc3 != 0:
                job.finish(rc3, error="preprocess failed")
                return

        job.set_step("Done")
        job.finish(0)
    except Exception as exc:  # noqa: BLE001 — surface to UI
        job.append_log(f"[error] {exc}")
        job.finish(-1, error=str(exc))


@app.post("/api/run")
def trigger_run(req: RunRequest) -> Dict[str, Any]:
    if job.status == "running":
        raise HTTPException(status_code=409, detail="A job is already running")

    job.reset()
    thread = threading.Thread(target=_run_pipeline, args=(req,), daemon=True)
    thread.start()
    return {"ok": True, "status": job.snapshot()}


@app.get("/api/status")
def get_status() -> Dict[str, Any]:
    return job.snapshot()


@app.get("/api/logs")
def get_logs(offset: int = 0) -> Dict[str, Any]:
    return {"offset": offset, "lines": job.get_logs(offset=offset)}


class ExportRequest(BaseModel):
    eval_data: str = "dataset_cleaned/test_original_ratio.parquet"
    target_col: str = "is_fraud"


def _run_export(req: ExportRequest) -> None:
    """Run inference on eval data using the saved model, then export web predictions."""
    try:
        env_bin = sys.executable
        import os as _os
        env = _os.environ.copy()
        env["PYTHONPATH"] = str(PROJECT_ROOT / "ml")
        env["PYTHONUNBUFFERED"] = "1"

        # Step 1: generate submission via mlmodel.py --eval-data (uses saved model)
        cmd = [
            env_bin,
            str(PROJECT_ROOT / "ml" / "mlmodel.py"),
            "--train-data", str(PROJECT_ROOT / "dataset_cleaned" / "train_original_ratio.parquet"),
            "--eval-data", str(PROJECT_ROOT / req.eval_data),
            "--target-col", req.target_col,
            "--no-optuna",
        ]
        job.append_log(f"$ {' '.join(cmd)}")
        proc = subprocess.Popen(
            cmd, cwd=str(PROJECT_ROOT), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        job.proc = proc
        rc = _stream_process(proc, "Generating submission")
        if rc != 0:
            job.finish(rc, error="submission generation failed")
            return

        # Step 2: export predictions.json for web dashboard
        export_cmd = [env_bin, str(PROJECT_ROOT / "ml" / "export_web.py")]
        job.append_log(f"$ {' '.join(export_cmd)}")
        proc2 = subprocess.Popen(
            export_cmd, cwd=str(PROJECT_ROOT), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        job.proc = proc2
        rc2 = _stream_process(proc2, "Exporting predictions for dashboard")
        if rc2 != 0:
            job.finish(rc2, error="web export failed")
            return

        job.set_step("Done")
        job.finish(0)
    except Exception as exc:
        job.append_log(f"[error] {exc}")
        job.finish(-1, error=str(exc))


@app.post("/api/export-submission")
def trigger_export(req: ExportRequest = ExportRequest()) -> Dict[str, Any]:
    if job.status == "running":
        raise HTTPException(status_code=409, detail="A job is already running")

    model_path = PROJECT_ROOT / "outputs" / "models" / "xgboost_fraud.joblib"
    if not model_path.exists():
        raise HTTPException(status_code=400, detail="No trained model found. Run training first.")

    job.reset()
    thread = threading.Thread(target=_run_export, args=(req,), daemon=True)
    thread.start()
    return {"ok": True, "status": job.snapshot()}


@app.get("/api/predictions-meta")
def predictions_meta() -> Dict[str, Any]:
    """Quick check so UI knows whether predictions are ready."""
    path = PROJECT_ROOT / "web" / "public" / "data" / "predictions.json"
    if not path.exists():
        return {"exists": False}
    stat = path.stat()
    try:
        with open(path) as f:
            data = json.load(f)
        count = len(data.get("predictions", []))
    except Exception:
        count = 0
    return {
        "exists": True,
        "mtime": stat.st_mtime,
        "size_bytes": stat.st_size,
        "count": count,
    }


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}
