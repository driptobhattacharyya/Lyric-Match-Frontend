import pytest

from lyric_match.scoring import (
    apply_streak,
    game_score,
    hint_penalty,
    round_half_up,
    round_points,
    speed_bonus,
    streak_multiplier,
    streak_tenths,
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


@pytest.mark.parametrize(
    ("base", "streak", "expected"),
    [
        # Exact .5 cases round up; float maths gets several of these wrong
        # (105 * 1.3 == 136.49999999999997).
        (105, 4, 137),
        (115, 4, 150),  # 149.5
        (125, 2, 138),  # 137.5
        (135, 2, 149),  # 148.5
        (145, 2, 160),  # 159.5
        (15, 2, 17),  # 16.5
        (25, 4, 33),  # 32.5
        (35, 6, 53),  # 52.5
        (45, 8, 68),  # 67.5 (capped at x1.5)
        (11, 6, 17),  # 16.5
        # Not .5: plain rounding either way.
        (101, 2, 111),  # 111.1
        (109, 2, 120),  # 119.9
        (150, 1, 150),
        (0, 3, 0),
    ],
)
def test_apply_streak_half_cases(base, streak, expected):
    assert apply_streak(base, streak) == expected


def test_apply_streak_is_exact_integer_formula():
    # The frontend's applyStreak: (base * (10 + k) + 5) // 10 with k = min(5, streak - 1).
    for base in range(1, 201):
        for streak in range(1, 9):
            k = min(5, streak - 1)
            assert apply_streak(base, streak) == (base * (10 + k) + 5) // 10
            assert streak_tenths(streak) == 10 + k


def test_game_score_uses_exact_rounding():
    # Streak 4 on 105 base points: 136.5 -> 137 (float maths gave 136).
    rounds = [(True, 100), (True, 100), (True, 100), (True, 105)]
    assert game_score(rounds) == 100 + 110 + 120 + 137
