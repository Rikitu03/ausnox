#!/usr/bin/env python
"""Download or verify the authentic source products used by the pipeline.

Products and their recorded size / SHA-256 are listed in ausnox_pipeline/sources.py.
Downloads resume from a .part file (HTTP Range) and are verified before being moved into
place; nothing unverified is ever used by build_terrain.py.

Usage:
  python scripts/fetch_sources.py                     # all products (about 1.86 GB)
  python scripts/fetch_sources.py --only hirise_dtm   # one product by key
  python scripts/fetch_sources.py --verify-only       # no network: report local status
  python scripts/fetch_sources.py --dest DIR          # use another directory

Exit code 0 only when every selected product is present and verified.
"""
from __future__ import annotations

import argparse
import ssl
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import certifi  # noqa: E402

from ausnox_pipeline.sources import ALL_DOWNLOADS, RAW_DIR, SourceProduct, SourceVerificationError, file_fingerprint, verify_source  # noqa: E402

CHUNK = 4 * 1024 * 1024


def local_status(product: SourceProduct, path: Path) -> tuple[str, str]:
    try:
        verify_source(product, path)
    except SourceVerificationError as e:
        return ("MISSING" if not path.exists() else "MISMATCH"), str(e)
    if product.live:
        size, sha = file_fingerprint(path)
        return "PRESENT", f"live layer, checksum recorded per build ({size} bytes, sha256 {sha[:16]}...)"
    return "OK", f"{product.bytes} bytes, SHA-256 verified"


def download(product: SourceProduct, dest: Path, ctx: ssl.SSLContext) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() and not product.live else 0
    headers = {"User-Agent": "ausnox-pipeline/1.0 (+https://github.com/Rikitu03/ausnox)"}
    if have:
        headers["Range"] = f"bytes={have}-"
    req = urllib.request.Request(product.url, headers=headers)
    with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
        if have and r.status != 206:
            have = 0  # server ignored the range request: start over
        total = product.bytes if product.bytes else None
        done = have
        last = time.time()
        with open(part, "ab" if have else "wb") as fh:
            while True:
                block = r.read(CHUNK)
                if not block:
                    break
                fh.write(block)
                done += len(block)
                if time.time() - last > 10:
                    pct = f" ({100 * done / total:.1f}%)" if total else ""
                    print(f"  {product.key}: {done / 1e6:.1f} MB{pct}", flush=True)
                    last = time.time()
    part.replace(dest)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", default=None, help="product key (repeatable)")
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--dest", type=Path, default=RAW_DIR)
    args = ap.parse_args(argv)
    keys = {p.key for p in ALL_DOWNLOADS}
    if args.only and not set(args.only) <= keys:
        print(f"unknown key(s): {sorted(set(args.only) - keys)}; known: {sorted(keys)}")
        return 2
    selected = [p for p in ALL_DOWNLOADS if not args.only or p.key in args.only]
    ctx = ssl.create_default_context(cafile=certifi.where())
    ok = True
    for product in selected:
        path = args.dest / product.filename
        status, msg = local_status(product, path)
        if status not in ("OK", "PRESENT") and not args.verify_only:
            if status == "MISMATCH":
                aside = path.with_name(path.name + ".mismatch")
                path.replace(aside)
                print(f"  moved mismatching file aside: {aside.name}")
            print(f"  downloading {product.key} from {product.url}")
            try:
                download(product, path, ctx)
            except Exception as e:  # noqa: BLE001
                print(f"[FAIL    ] {product.key}: download failed: {e}")
                ok = False
                continue
            status, msg = local_status(product, path)
        ok &= status in ("OK", "PRESENT")
        print(f"[{status:8}] {product.key}: {msg}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
