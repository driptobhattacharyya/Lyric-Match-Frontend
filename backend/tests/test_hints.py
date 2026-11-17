import pytest
from conftest import FIXTURE_CATALOG

from lyric_match.hints import letters_hint, title_mask
from lyric_match.songs import read_catalog

RAW_SONGS = [
    (e["title"], e["artist"]) for r in read_catalog(FIXTURE_CATALOG)[1] for e in r.entries
] + [("Shake It Off", "x"), ("Don't Start Now", "x"), ("Pal", "x"), ("Tum Hi Ho", "x")]


def revealed(mask):
    return {i for i, ch in enumerate(mask) if ch != "_"}


def test_title_mask():
    assert title_mask("Shake It Off") == "_____ __ ___"
    assert title_mask("Don't Start Now") == "___'_ _____ ___"
    assert title_mask("Anti-Hero") == "____-____"


def test_level_one_reveals_first_letters():
    assert letters_hint("Shake It Off", "tok", 1) == "S____ I_ O__"
    assert letters_hint("Don't Start Now", "tok", 1) == "D__'_ S____ N__"


@pytest.mark.parametrize(("title", "_artist"), RAW_SONGS)
def test_levels_are_supersets_and_never_reveal_everything(title, _artist):
    masks = [letters_hint(title, "some-token", level) for level in (1, 2, 3)]
    sets = [revealed(m) for m in masks]
    assert sets[0] <= sets[1] <= sets[2]
    assert "_" in masks[2]
    for mask in masks:
        assert len(mask) == len(title)
        assert all(m == "_" or m == t for m, t in zip(mask, title, strict=True))


def test_deterministic_per_token_and_fractions():
    title = "Something Just Like This"
    letters = sum(ch.isalnum() for ch in title)
    assert letters_hint(title, "t1", 2) == letters_hint(title, "t1", 2)
    l2 = revealed(letters_hint(title, "t1", 2)) - {i for i, c in enumerate(title) if c == " "}
    l3 = revealed(letters_hint(title, "t1", 3)) - {i for i, c in enumerate(title) if c == " "}
    assert len(l2) == round(0.4 * letters)
    assert len(l3) == round(0.6 * letters)
