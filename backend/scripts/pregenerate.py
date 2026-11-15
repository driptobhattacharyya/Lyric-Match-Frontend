"""Fill the on-disk snippet cache locally so production rarely needs the LLM.

Usage (from backend/, with GEMINI_API_KEY in .env or the environment):

    python scripts/pregenerate.py --variants 3 --max-calls 100

Existing entries are kept; only songs with fewer than --variants snippets are
topped up. The file is rewritten after every successful call, so the script
can be interrupted and re-run.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

from lyric_match.config import load_settings  # noqa: E402
from lyric_match.keys import derive_key  # noqa: E402
from lyric_match.llm import GeminiGenerator  # noqa: E402
from lyric_match.snippets import SnippetCache, load_cache_file, save_cache_file  # noqa: E402
from lyric_match.songs import Catalogue  # noqa: E402

log = logging.getLogger("pregenerate")


def main() -> int:
    load_dotenv()
    settings = load_settings()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", default=settings["SNIPPET_CACHE_PATH"])
    parser.add_argument("--variants", type=int, default=settings["MAX_VARIANTS_PER_SONG"])
    parser.add_argument("--max-calls", type=int, default=100)
    parser.add_argument("--delay", type=float, default=4.0, help="seconds between calls")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if settings["FAKE_LLM"]:
        log.error("FAKE_LLM is set; refusing to write placeholder text to the cache")
        return 2
    generator = GeminiGenerator(
        settings["GEMINI_API_KEY"], settings["GEMINI_MODEL"], settings["GEMINI_TIMEOUT_SECONDS"]
    )
    if not generator.available:
        log.error("GEMINI_API_KEY is not set")
        return 2

    variants = max(1, args.variants)
    cache = SnippetCache(variants, load_cache_file(args.output))
    # Ids are only used in log lines here; the cache is keyed by title|artist.
    catalogue = Catalogue(derive_key(os.environ.get("SECRET_KEY", "pregenerate"), "song-id"))
    calls = 0
    for song in catalogue.songs:
        attempts = 0
        while len(cache.get(song.cache_key)) < variants and attempts < variants + 2:
            if calls >= args.max_calls:
                log.info("max calls reached (%d)", calls)
                return 0
            if calls:
                time.sleep(args.delay)
            calls += 1
            attempts += 1
            text = generator.generate(song)
            if text:
                cache.add(song.cache_key, text)
                save_cache_file(args.output, cache.snapshot())
                log.info(
                    "%s: %d/%d variants", song.cache_key, len(cache.get(song.cache_key)), variants
                )
    log.info("done after %d calls; cache at %s", calls, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
