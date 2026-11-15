import pytest

from lyric_match.matching import is_correct, normalize


@pytest.mark.parametrize(
    ("guess", "title", "expected"),
    [
        ("shake it off", "Shake It Off", True),
        ("SHAKE IT OFF!!", "Shake It Off", True),
        ("  shake   it off ", "Shake It Off", True),
        ("shake it of", "Shake It Off", True),
        ("shakeitoff", "Shake It Off", True),
        ("e", "Shake It Off", False),
        ("It", "Shake It Off", False),
        ("Off", "Shake It Off", False),
        ("shake", "Shake It Off", False),
        ("bad guy", "bad guy", True),
        ("Bad Guy", "bad guy", True),
        ("bad", "bad guy", False),
        ("dont start now", "Don't Start Now", True),
        ("Don’t Start Now", "Don't Start Now", True),
        ("anti hero", "Anti-Hero", True),
        ("shake it off (taylor's version)", "Shake It Off", True),
        ("Stay", "Stay (feat. Someone)", True),
        ("shake it off by taylor swift", "Shake It Off", True),
        ("Shake It Off - Taylor Swift", "Shake It Off", True),
        ("hello", "Hello", True),
        ("helo", "Hello", True),
        ("yellow", "Hello", False),
        ("lonely", "Lovely", False),
        ("blank space", "Shake It Off", False),
        ("", "Shake It Off", False),
        ("!!!", "Shake It Off", False),
    ],
)
def test_is_correct(guess, title, expected):
    assert is_correct(guess, title) is expected


def test_normalize():
    assert normalize("  Viva  La Vida (Remastered) ") == "viva la vida"
    assert normalize("Beyoncé") == "beyonce"
