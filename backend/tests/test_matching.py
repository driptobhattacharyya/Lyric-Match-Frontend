import pytest

from lyric_match.matching import fold_romanised, is_correct, normalize


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
    assert is_correct(guess, title, "en") is expected


@pytest.mark.parametrize(
    ("guess", "title", "expected"),
    [
        ("tum hi ho", "Tum Hi Ho", True),
        ("tum hee ho", "Tum Hi Ho", True),
        ("chand ki raat", "Chaand Ki Raat", True),
        ("chaand kee raat", "Chand Ki Rat", True),
        ("chand kee rat", "Chaand Ki Raat", True),
        ("pyar ka safar", "Pyaar Ka Safar", True),
        ("dil ki duri", "Dil Ki Doori", True),
        ("ishq vala mausam", "Ishq Wala Mausam", True),
        ("ishk wala mosam", "Ishq Wala Mausam", True),
        ("fir se milenge", "Phir Se Milenge", True),
        ("chaiyan chaiyan jhum", "Chhaiyaan Chhaiyaan Jhoom", True),
        ("kal ho naa ho", "Kal Ho Na Ho", True),
        ("kal ho na hoh", "Kal Ho Naa Ho", True),
        ("dilwale", "Dilvaale", True),
        ("saanson ki mala pe", "Sanson Ki Maala Pe", True),
        ("tujhe dekha toh", "Tujhe Dekha To", True),
        ("Tum Hi Ho - Arijit Singh", "Tum Hi Ho", True),
        ("tum", "Tum Hi Ho", False),
        ("dil", "Dil Ki Doori", False),
        ("pyaar", "Pyaar Ka Safar", False),
        ("chand", "Chaand Ki Raat", False),
        ("tum ho", "Tum Hi Ho", False),
        ("dil se", "Dil Ki Doori", False),
        ("kal ho", "Kal Ho Na Ho", False),
        ("mausam", "Ishq Wala Mausam", False),
        ("", "Tum Hi Ho", False),
    ],
)
def test_is_correct_hindi_romanisation(guess, title, expected):
    assert is_correct(guess, title, "hi") is expected


def test_romanisation_folding_is_hindi_only():
    # English titles keep the strict behaviour: no vowel folding.
    assert is_correct("fil me in", "Feel Me In", "hi") is True
    assert is_correct("fil me in", "Feel Me In", "en") is False


def test_fold_romanised():
    assert fold_romanised("chhaiyaan pyaar kee ishq wala phir") == "chaiyan pyar ki ishk vala fir"
    assert fold_romanised("raah oh") == "ra oh"


def test_normalize():
    assert normalize("  Viva  La Vida (Remastered) ") == "viva la vida"
    assert normalize("Beyoncé") == "beyonce"
