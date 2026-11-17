import io
import json
import logging
import random
import shutil

import pytest
from conftest import FIXTURE_CATALOG

from lyric_match.catalog_rules import pack_rule_violations, validate_entry
from lyric_match.keys import derive_key
from lyric_match.songs import DEFAULT_CATALOG_DIR, Catalogue, read_catalog

KEY = derive_key("test", "song-id")


@pytest.fixture
def catalogue():
    return Catalogue(KEY, FIXTURE_CATALOG)


def test_loader_skips_missing_broken_invalid_and_duplicates(caplog):
    with caplog.at_level(logging.WARNING, logger="lyric_match.songs"):
        cat = Catalogue(KEY, FIXTURE_CATALOG)
    counts = {pid: len(songs) for pid, songs in cat.pack_songs.items()}
    assert counts == {
        "en-alpha": 6,
        "en-beta": 4,
        "en-missing": 0,
        "en-broken": 0,
        "hi-one": 6,
        "hi-two": 2,
    }
    assert len(cat.songs) == 18
    messages = caplog.text
    assert "catalog_pack_missing pack=en-missing" in messages
    assert "catalog_pack_unreadable pack=en-broken" in messages
    assert "catalog_duplicates_skipped pack=en-beta count=1" in messages
    assert "catalog_entries_skipped pack=en-alpha invalid=4" in messages
    # First pack wins for the duplicate.
    lanterns = [s for s in cat.songs if s.title.casefold() == "paper lanterns"]
    assert len(lanterns) == 1 and lanterns[0].pack_id == "en-alpha"


def test_song_fields_and_opaque_ids(catalogue):
    song = next(s for s in catalogue.songs if s.title == "Pyaar Ka Safar")
    assert song.language == "hi" and song.pack_id == "hi-one"
    assert song.film == "Safar Express" and song.year == 1998
    assert song.cache_key == "Pyaar Ka Safar|Kalpit Gayak & Sapna Swar"
    assert len(song.id) == 12 and "pyaar" not in song.id
    assert catalogue.get(song.id) is song
    assert Catalogue(derive_key("other", "song-id"), FIXTURE_CATALOG).get(song.id) is None


def test_meta_lists_only_loaded_packs(catalogue):
    meta = catalogue.meta()
    assert [lang["id"] for lang in meta] == ["en", "hi"]
    assert [p["id"] for p in meta[0]["packs"]] == ["en-alpha", "en-beta"]


def test_eligible_and_songs_in(catalogue):
    hi_two = catalogue.songs_in(["hi-two"])
    assert {s.pack_id for s in hi_two} == {"hi-two"}
    assert catalogue.songs_in([]) == list(catalogue.songs)
    assert catalogue.eligible([s.id for s in hi_two], ["hi-two"]) == hi_two
    assert catalogue.eligible([hi_two[0].id], ["hi-two"]) == [hi_two[1]]
    assert catalogue.songs_in(["en-missing"]) == []


def test_distractors(catalogue):
    rng = random.Random(1)
    song = catalogue.songs_in(["hi-two"])[0]
    for _ in range(20):
        titles = catalogue.distractor_titles(song, 3, rng)
        assert len(titles) == 3 == len(set(titles))
        assert song.title not in titles
        by_title = {s.title: s for s in catalogue.songs}
        assert all(by_title[t].language == "hi" for t in titles)
        # The only other hi-two song is always included (same pack first).
        assert catalogue.songs_in(["hi-two"])[1].title in titles


def test_index_lists_all_13_packs():
    data = json.loads((DEFAULT_CATALOG_DIR / "index.json").read_text())
    ids = [p["id"] for p in data["packs"]]
    assert ids == [
        "en-pop-2010s",
        "en-pop-2000s",
        "en-pop-80s90s",
        "en-rock-classic",
        "en-rock-modern",
        "en-hiphop-rnb",
        "en-country-folk",
        "en-soul-dance",
        "hi-bollywood-2010s",
        "hi-bollywood-2000s",
        "hi-bollywood-90s",
        "hi-bollywood-classics",
        "hi-indie",
    ]
    assert all(p["name"] and p["language"] == p["id"][:2] for p in data["packs"])


@pytest.mark.parametrize(
    ("raw", "ok"),
    [
        ({"title": "A", "artist": "B", "year": 2000, "language": "en"}, True),
        ({"title": "  A   B ", "artist": "C", "year": 2000, "language": "en"}, True),
        ({"title": "A", "artist": "B", "year": 2000, "language": "hi"}, False),
        ({"title": "", "artist": "B", "year": 2000, "language": "en"}, False),
        ({"title": "A", "artist": "B", "year": 1800, "language": "en"}, False),
        ({"title": "A", "artist": "B", "year": True, "language": "en"}, False),
        ({"title": "तुम", "artist": "B", "year": 2000, "language": "en"}, False),
        ({"title": "A", "artist": "B", "year": 2000, "language": "en", "film": 5}, False),
        ({"title": "x" * 121, "artist": "B", "year": 2000, "language": "en"}, False),
        ("not a dict", False),
    ],
)
def test_validate_entry(raw, ok):
    entry, reason = validate_entry(raw, "en")
    assert (entry is not None) is ok
    assert (reason is None) is ok


def test_rule_violations():
    raws = [
        {"title": f"Song {i}", "artist": "Same", "year": 2000, "language": "en", "genre": "pop"}
        for i in range(6)
    ] + [
        {"title": "Hit (feat. Someone)", "artist": "X", "year": 2000, "language": "en",
         "genre": "rock", "bonus": 1},
    ]  # fmt: skip
    entries = [validate_entry(r, "en")[0] for r in raws]
    problems = pack_rule_violations("en-test", "en", raws, entries)
    text = "\n".join(problems)
    assert "'Same' has 6 songs (max 5)" in text
    assert "feat." in text
    assert "unexpected keys: bonus" in text
    assert "mixed genres" in text


def test_hindi_rules():
    raws = [
        {"title": "Gaana", "artist": "A & B & C", "year": 2000, "language": "hi", "genre": "b"},
    ]
    entries = [validate_entry(r, "hi")[0] for r in raws]
    text = "\n".join(pack_rule_violations("hi-bollywood-x", "hi", raws, entries))
    assert "more than two singers" in text and "without film" in text


def _run_validator(directory, *args):
    from scripts.validate_catalog import validate

    out = io.StringIO()
    code = validate(directory, *args, out=out)
    return code, out.getvalue()


def test_validate_script_reports_problems():
    code, out = _run_validator(FIXTURE_CATALOG)
    assert code == 1
    assert "en-alpha: 6 songs (10 entries, 4 invalid, 0 duplicates" in out
    assert "en-missing: MISSING" in out
    assert "en-broken" in out and "unreadable" in out
    assert "already in en-alpha" in out


def test_validate_script_clean_catalogue(tmp_path):
    for name in ("index.json", "hi-one.json", "hi-two.json"):
        shutil.copy(FIXTURE_CATALOG / name, tmp_path / name)
    index = json.loads((tmp_path / "index.json").read_text())
    index["packs"] = [p for p in index["packs"] if p["id"].startswith("hi-")]
    (tmp_path / "index.json").write_text(json.dumps(index))
    code, out = _run_validator(tmp_path)
    assert code == 0, out
    assert "total: 8 songs in 2 packs; 0 problem(s)" in out
    (tmp_path / "hi-two.json").unlink()
    assert _run_validator(tmp_path)[0] == 1
    assert _run_validator(tmp_path, True)[0] == 0


def test_read_catalog_survives_garbage_pack(tmp_path):
    shutil.copy(FIXTURE_CATALOG / "index.json", tmp_path / "index.json")
    (tmp_path / "en-alpha.json").write_text('{"not": "a list"}')
    (tmp_path / "hi-one.json").write_text("[1, null, []]")
    _, reports = read_catalog(tmp_path)
    by_id = {r.pack.id: r for r in reports}
    assert by_id["en-alpha"].status == "unreadable"
    assert by_id["hi-one"].status == "ok" and len(by_id["hi-one"].invalid) == 3
    assert all(not r.entries for r in reports)
