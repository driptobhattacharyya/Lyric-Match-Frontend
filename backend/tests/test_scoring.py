import pytest

from lyric_match.scoring import (
    game_score,
    hint_penalty,
    round_half_up,
    round_points,
    speed_bonus,
    streak_multiplier,
)


@pytest.mark.parametrize(
    ("elapsed", "limit", "expected"),
    [
        (0, 45, 50),
        (-3, 45, 50),
        (22.5, 45, 25),
        (45, 45, 0),
        (100, 45, 0),
        (10, 20, 25),
        (1, 20, 48),
    ],
)
def test_speed_bonus(elapsed, limit, expected):
    assert speed_bonus(elapsed, limit) == expected


def test_hint_penalty_and_floor():
    assert hint_penalty(0, False) == 0
    assert hint_penalty(3, True) == 65
    assert round_points(0, 45, 0, False) == 150
    assert round_points(0, 45, 2, True) == 100
    assert round_points(1000, 45, 3, True) == 35
    assert round_points(1000, 0, 3, True) == 35


def test_floor_of_ten(monkeypatch):
    import lyric_match.scoring as scoring

    monkeypatch.setattr(scoring, "LETTER_HINT_PENALTY", 100)
    assert scoring.round_points(1000, 45, 3, False) == 10


def test_round_half_up_matches_js():
    assert [round_half_up(x) for x in (0.5, 1.5, 2.5, 2.4999, -0.5)] == [1, 2, 3, 2, 0]


def test_streak_multiplier():
    assert [streak_multiplier(n) for n in range(1, 8)] == pytest.approx(
        [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.5]
    )


def test_game_score():
    assert game_score([]) == 0
    assert game_score([(True, 100)]) == 100
    assert game_score([(True, 100), (True, 100), (True, 100)]) == 100 + 110 + 120
    # A miss resets the streak.
    assert game_score([(True, 100), (False, 0), (True, 100), (True, 125)]) == 100 + 100 + 138
    eight = [(True, 150)] * 8
    assert game_score(eight) == 150 + 165 + 180 + 195 + 210 + 225 + 225 + 225
