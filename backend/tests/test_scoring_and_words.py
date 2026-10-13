from app.scoring import (
    BASE_CORRECT_POINTS,
    FIRST_GUESS_BONUS,
    ROUND_BONUS_PER_ROUND,
    calculate_drawer_bonus,
    calculate_guess_score,
)
from app.words import (
    is_close_guess,
    is_exact_match,
    mask_secret_word,
    select_secret_word,
)


def test_incorrect_guess_awards_zero_points():
    score = calculate_guess_score(
        is_correct=False,
        time_taken_seconds=5.0,
        round_duration_seconds=60,
        round_number=1,
        guess_order=1,
    )
    assert score == 0


def test_faster_guess_scores_higher_than_slower_guess():
    fast_score = calculate_guess_score(
        is_correct=True,
        time_taken_seconds=5.0,
        round_duration_seconds=60,
        round_number=1,
        guess_order=1,
    )
    slow_score = calculate_guess_score(
        is_correct=True,
        time_taken_seconds=50.0,
        round_duration_seconds=60,
        round_number=1,
        guess_order=1,
    )
    assert fast_score > slow_score
    assert slow_score >= BASE_CORRECT_POINTS


def test_later_rounds_award_higher_score_multiplier():
    round_1_score = calculate_guess_score(
        is_correct=True,
        time_taken_seconds=20.0,
        round_duration_seconds=60,
        round_number=1,
        guess_order=2,
    )
    round_3_score = calculate_guess_score(
        is_correct=True,
        time_taken_seconds=20.0,
        round_duration_seconds=60,
        round_number=3,
        guess_order=2,
    )
    assert round_3_score == round_1_score + 2 * ROUND_BONUS_PER_ROUND


def test_first_guess_order_bonus():
    first_solver = calculate_guess_score(
        is_correct=True,
        time_taken_seconds=15.0,
        round_duration_seconds=60,
        round_number=1,
        guess_order=1,
    )
    second_solver = calculate_guess_score(
        is_correct=True,
        time_taken_seconds=15.0,
        round_duration_seconds=60,
        round_number=1,
        guess_order=2,
    )
    assert first_solver - second_solver == FIRST_GUESS_BONUS


def test_drawer_bonus_scales_with_speed_and_round():
    b1 = calculate_drawer_bonus(round_number=1, time_taken_seconds=45.0, round_duration_seconds=60)
    b2 = calculate_drawer_bonus(round_number=3, time_taken_seconds=5.0, round_duration_seconds=60)
    assert b2 > b1 > 0


def test_word_masking_and_matching():
    masked = mask_secret_word("elephant")
    assert "e" not in masked.lower()
    assert masked == "_ _ _ _ _ _ _ _"

    phrase_masked = mask_secret_word("ice cream")
    assert phrase_masked == "_ _ _   _ _ _ _ _"

    assert is_exact_match("  ElEpHaNt ", "elephant") is True
    assert is_exact_match("giraffe", "elephant") is False

    # Close guess detection (1 edit away)
    assert is_close_guess("elephan", "elephant") is True
    assert is_close_guess("elephamt", "elephant") is True
    assert is_close_guess("elephant", "elephant") is False
    assert is_close_guess("hippo", "elephant") is False


def test_select_secret_word_avoids_used_words():
    word1 = select_secret_word(set())
    word2 = select_secret_word({word1})
    assert word2 != word1
