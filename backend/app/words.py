import random
from typing import Iterable, Optional

# Curated multi-category secret words for the drawing game
WORD_BANK: list[str] = [
    # Animals
    "elephant", "giraffe", "penguin", "octopus", "butterfly",
    "chameleon", "crocodile", "dolphin", "flamingo", "hedgehog",
    "jellyfish", "kangaroo", "peacock", "Platypus", "squirrel",
    # Objects & Everyday Items
    "telescope", "umbrella", "backpack", "headphones", "hourglass",
    "lightbulb", "microscope", "parachute", "skateboard", "sunglasses",
    "compass", "flashlight", "guitar", "keyboard", "lantern",
    # Food & Drink
    "pineapple", "croissant", "hamburger", "watermelon", "spaghetti",
    "pancake", "avocado", "cupcake", "popcorn", "pretzel",
    # Places & Nature
    "volcano", "waterfall", "lighthouse", "treehouse", "pyramid",
    "igloo", "castle", "rainbow", "tornado", "campfire",
    # Vehicles & Sci-Fi
    "helicopter", "submarine", "spaceship", "sailboat", "locomotive",
    "hot air balloon", "roller coaster", "astronaut", "robot", "time machine",
]

# Normalize word bank to lowercase
NORMALIZED_WORD_BANK: list[str] = [w.strip().lower() for w in WORD_BANK]


def select_secret_word(used_words: Optional[Iterable[str]] = None) -> str:
    """Select a random secret word avoiding previously used words in the room."""
    used_set = {w.strip().lower() for w in (used_words or [])}
    available = [w for w in NORMALIZED_WORD_BANK if w not in used_set]
    if not available:
        available = NORMALIZED_WORD_BANK
    return random.choice(available)


def mask_secret_word(word: str, revealed_indices: Optional[set[int]] = None) -> str:
    """
    Create a safe masked representation of a secret word for guessing players.
    Letters become '_' separated by spaces; spaces inside multi-word phrases become '   '.
    Never leaks the unrevealed characters of the secret word.
    """
    revealed = revealed_indices or set()
    tokens: list[str] = []
    for idx, ch in enumerate(word):
        if ch == " ":
            tokens.append(" ")
        elif idx in revealed:
            tokens.append(ch.upper())
        else:
            tokens.append("_")
    return " ".join(tokens)


def normalize_guess(text: str) -> str:
    """Normalize guess or word for case-insensitive comparison."""
    return " ".join(text.strip().lower().split())


def is_exact_match(guess: str, secret_word: str) -> bool:
    """Return True if the normalized guess matches the normalized secret word."""
    norm_guess = normalize_guess(guess)
    norm_word = normalize_guess(secret_word)
    if not norm_guess or not norm_word:
        return False
    return norm_guess == norm_word


def is_close_guess(guess: str, secret_word: str) -> bool:
    """
    Return True if the guess is 1 edit distance away from the secret word
    (and not an exact match), for words of length >= 4.
    """
    g = normalize_guess(guess)
    w = normalize_guess(secret_word)
    if not g or not w or g == w or len(w) < 4:
        return False
    if abs(len(g) - len(w)) > 1:
        return False

    # Levenshtein distance <= 1 check
    if len(g) == len(w):
        diffs = sum(1 for a, b in zip(g, w) if a != b)
        return diffs == 1

    # Length differs by 1
    shorter, longer = (g, w) if len(g) < len(w) else (w, g)
    i = j = diffs = 0
    while i < len(shorter) and j < len(longer):
        if shorter[i] != longer[j]:
            diffs += 1
            if diffs > 1:
                return False
            j += 1
        else:
            i += 1
            j += 1
    return True
