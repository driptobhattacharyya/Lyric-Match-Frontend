"""Check the song catalogue packs against catalog/README.md.

Usage (from backend/):

    python scripts/validate_catalog.py [--dir lyric_match/catalog] [--allow-missing]

Prints per-pack counts, invalid entries, duplicates (within and across packs,
first pack wins) and rule violations. Exits 1 if there is any problem, 0 if
the catalogue is clean.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lyric_match.catalog_rules import pack_rule_violations  # noqa: E402
from lyric_match.songs import DEFAULT_CATALOG_DIR, read_catalog  # noqa: E402


def validate(directory: Path, allow_missing: bool = False, out=sys.stdout) -> int:
    try:
        _, reports = read_catalog(directory)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"index.json is invalid: {type(exc).__name__}: {exc}", file=out)
        return 1
    problems = 0
    total = 0
    for report in reports:
        pack = report.pack
        if report.status == "missing":
            print(f"{pack.id}: MISSING", file=out)
            problems += 0 if allow_missing else 1
            continue
        rules = pack_rule_violations(pack.id, pack.language, report.raw, report.entries)
        issues = report.invalid + [f"duplicate: {d}" for d in report.duplicates] + rules
        total += len(report.entries)
        print(
            f"{pack.id}: {len(report.entries)} songs ({len(report.raw)} entries, "
            f"{len(report.invalid)} invalid, {len(report.duplicates)} duplicates, "
            f"{len(rules)} rule violations)",
            file=out,
        )
        for issue in issues:
            print(f"  - {issue}", file=out)
        problems += len(issues)
    print(f"total: {total} songs in {len(reports)} packs; {problems} problem(s)", file=out)
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", type=Path, default=DEFAULT_CATALOG_DIR)
    parser.add_argument(
        "--allow-missing", action="store_true", help="do not fail on packs without a file"
    )
    args = parser.parse_args(argv)
    return validate(args.dir, args.allow_missing)


if __name__ == "__main__":
    sys.exit(main())
