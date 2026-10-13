"""
Server-authoritative scoring engine.

Scoring depends on:
1. Correctness (0 points if incorrect)
2. Time taken (faster guesses receive higher time bonus)
3. Round number (later rounds carry a round multiplier/escalation bonus)
4. Guess order (first player to guess in a round receives a first-solver bonus)
"""

BASE_CORRECT_POINTS = 100
MAX_TIME_BONUS = 100
FIRST_GUESS_BONUS = 30
ROUND_BONUS_PER_ROUND = 20
DRAWER_BASE_BONUS = 25
DRAWER_ROUND_BONUS = 10


def calculate_guess_score(
    *,
    is_correct: bool,
    time_taken_seconds: float,
    round_duration_seconds: int,
    round_number: int,
    guess_order: int = 1,
) -> int:
    """
    Calculate the points earned by a guessing player.

    Parameters
    ----------
    is_correct : bool
        Whether the guess matched the secret word.
    time_taken_seconds : float
        Seconds elapsed since the round started when the guess was submitted.
    round_duration_seconds : int
        Total duration configured for the round (in seconds).
    round_number : int
        1-indexed round number.
    guess_order : int
        1-indexed order among correct guessers in the current round.

    Returns
    -------
    int
        Non-negative integer score awarded.
    """
    if not is_correct:
        return 0

    safe_duration = max(1, int(round_duration_seconds))
    clamped_time = max(0.0, min(float(time_taken_seconds), float(safe_duration)))
    safe_round = max(1, int(round_number))

    # 1. Base correctness score
    base_score = BASE_CORRECT_POINTS

    # 2. Time bonus: linear scale from MAX_TIME_BONUS (at t=0) to 0 (at t=duration)
    remaining_ratio = (safe_duration - clamped_time) / safe_duration
    time_bonus = round(MAX_TIME_BONUS * remaining_ratio)

    # 3. Round number escalation bonus: later rounds award more points
    round_bonus = (safe_round - 1) * ROUND_BONUS_PER_ROUND

    # 4. First solver bonus
    order_bonus = FIRST_GUESS_BONUS if guess_order == 1 else 0

    total = base_score + time_bonus + round_bonus + order_bonus
    return int(max(base_score, total))


def calculate_drawer_bonus(
    *,
    round_number: int,
    time_taken_seconds: float,
    round_duration_seconds: int,
) -> int:
    """
    Calculate points awarded to the drawer when a player guesses their word.
    Encourages drawers to draw clearly and quickly.
    """
    safe_duration = max(1, int(round_duration_seconds))
    clamped_time = max(0.0, min(float(time_taken_seconds), float(safe_duration)))
    safe_round = max(1, int(round_number))

    remaining_ratio = (safe_duration - clamped_time) / safe_duration
    speed_bonus = round(25 * remaining_ratio)
    round_bonus = (safe_round - 1) * DRAWER_ROUND_BONUS

    return int(DRAWER_BASE_BONUS + speed_bonus + round_bonus)
