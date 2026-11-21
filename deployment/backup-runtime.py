"""Create and verify a private online SQLite backup without stopping the app."""
import argparse
from contextlib import closing
import datetime
import json
import os
from pathlib import Path
import sqlite3
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--database", type=Path, default=Path("/srv/hackaton/shared/runtime/conversations.sqlite"))
parser.add_argument("--destination", type=Path, default=Path("/srv/hackaton/shared/backups"))
args = parser.parse_args()
source = args.database.resolve(strict=True)
destination = args.destination.resolve()
os.umask(0o077)
destination.mkdir(mode=0o700, parents=True, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
output = destination / f"conversations-{stamp}.sqlite"
# An exclusive private file prevents accidental overwrite of an existing backup.
with output.open("xb"):
    pass
deadline = time.monotonic() + 60

def progress(status, remaining, total):
    if time.monotonic() > deadline:
        raise TimeoutError("Online backup exceeded 60 seconds; inspect application load.")

try:
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=10)) as original:
        with closing(sqlite3.connect(output, timeout=10)) as backup:
            original.backup(backup, pages=256, progress=progress, sleep=0.1)
            integrity = backup.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError("Backup failed SQLite integrity verification.")
    os.chmod(output, 0o600)
except Exception:
    # Only the newly created file is removed; existing backups are preserved.
    output.unlink(missing_ok=True)
    raise
print(json.dumps({"status": "ok", "backup": str(output), "bytes": output.stat().st_size, "integrity": integrity}))
