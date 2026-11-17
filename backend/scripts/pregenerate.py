"""Pre-generate lyric snippets so production rarely needs the LLM.

Usage (from backend/, keys in .env or the environment):

    python scripts/pregenerate.py --pack hi-indie --limit 50 --variants 2 --max-calls 100

Providers are tried in the server's order (Gemini, then OpenAI). Snippets are
written to the local cache file (--output) and, when SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY are set, to the Supabase ``snippets`` table
(disable with --no-supabase). Existing snippets (file and database) count
toward --variants, so the script can be interrupted and re-run.
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
from lyric_match.llm import GeminiGenerator, OpenAIGenerator, clean_snippet  # noqa: E402
from lyric_match.snippets import SnippetCache, load_cache_file, save_cache_file  # noqa: E402
from lyric_match.songs import Catalogue  # noqa: E402
from lyric_match.supabase import PostgrestClient, SupabaseSnippetStore  # noqa: E402

log = logging.getLogger("pregenerate")


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    settings = load_settings()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", default=settings["SNIPPET_CACHE_PATH"])
    parser.add_argument("--pack", action="append", default=[], help="pack id (repeatable)")
    parser.add_argument("--limit", type=int, default=None, help="max songs to process")
    parser.add_argument("--variants", type=int, default=settings["MAX_VARIANTS_PER_SONG"])
    parser.add_argument("--max-calls", type=int, default=100)
    parser.add_argument("--delay", type=float, default=4.0, help="seconds between LLM calls")
    parser.add_argument("--no-supabase", action="store_true", help="only write the local file")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("httpx2").setLevel(logging.WARNING)

    if settings["FAKE_LLM"]:
        log.error("FAKE_LLM is set; refusing to store placeholder text")
        return 2
    generators = [
        g
        for g in (
            GeminiGenerator(
                settings["GEMINI_API_KEY"],
                settings["GEMINI_MODEL"],
                settings["GEMINI_TIMEOUT_SECONDS"],
            ),
            OpenAIGenerator(
                settings["OPENAI_API_KEY"],
                settings["OPENAI_MODEL"],
                settings["OPENAI_TIMEOUT_SECONDS"],
                settings["OPENAI_REASONING_EFFORT"],
            ),
        )
        if g.available
    ]
    if not generators:
        log.error("Neither GEMINI_API_KEY nor OPENAI_API_KEY is set")
        return 2

    store = None
    if not args.no_supabase and settings["SUPABASE_URL"] and settings["SUPABASE_SERVICE_ROLE_KEY"]:
        store = SupabaseSnippetStore(
            PostgrestClient(
                settings["SUPABASE_URL"],
                settings["SUPABASE_SERVICE_ROLE_KEY"],
                settings["SUPABASE_TIMEOUT_SECONDS"],
            )
        )
        log.info("writing snippets to Supabase as well as %s", args.output)

    # Ids are only used in log lines here; snippets are keyed by title|artist.
    catalogue = Catalogue(
        derive_key(os.environ.get("SECRET_KEY", "pregenerate"), "song-id"), settings["CATALOG_DIR"]
    )
    unknown = [p for p in args.pack if catalogue.pack(p) is None]
    if unknown:
        log.error("unknown pack(s): %s", ", ".join(unknown))
        return 2
    songs = catalogue.songs_in(args.pack)
    if args.limit is not None:
        songs = songs[: max(0, args.limit)]

    variants = max(1, args.variants)
    cache = SnippetCache(variants, load_cache_file(args.output))
    calls = 0
    for song in songs:
        if store is not None and len(cache.get(song.cache_key)) < variants:
            for text in store.fetch(song, limit=variants):
                cache.add(song.cache_key, text)
        attempts = 0
        while len(cache.get(song.cache_key)) < variants and attempts < variants + 2:
            attempts += 1
            text = provider = None
            for generator in generators:
                if calls >= args.max_calls:
                    log.info("max calls reached (%d)", calls)
                    return 0
                if calls:
                    time.sleep(args.delay)
                calls += 1
                text = clean_snippet(generator.generate(song))
                if text:
                    provider = generator.name
                    break
            if not text:
                continue
            cache.add(song.cache_key, text)
            save_cache_file(args.output, cache.snapshot())
            if store is not None:
                store.save(song, text, provider)
            log.info(
                "%s [%s via %s]: %d/%d variants",
                song.cache_key,
                song.pack_id,
                provider,
                len(cache.get(song.cache_key)),
                variants,
            )
    log.info("done after %d calls over %d songs; cache at %s", calls, len(songs), args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
