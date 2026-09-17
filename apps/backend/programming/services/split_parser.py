"""Parse ProgramTemplate.split day labels into normalized muscle lists."""

from __future__ import annotations

import re

CANONICAL_MUSCLES: tuple[str, ...] = (
    "سینه",
    "زیربغل",
    "پا",
    "سرشانه",
    "پشت بازو",
    "جلو بازو",
    "شکم",
    "ساق",
)

MUSCLE_ALIASES: dict[str, str] = {
    "chest": "سینه",
    "upper_chest": "سینه",
    "upper chest": "سینه",
    "بالاسینه": "سینه",
    "بالا سینه": "سینه",
    "back": "زیربغل",
    "lats": "زیربغل",
    "lat": "زیربغل",
    "legs": "پا",
    "leg": "پا",
    "quads": "پا",
    "hamstrings": "پا",
    "shoulders": "سرشانه",
    "shoulder": "سرشانه",
    "delts": "سرشانه",
    "delt": "سرشانه",
    "triceps": "پشت بازو",
    "tricep": "پشت بازو",
    "پشت‌بازو": "پشت بازو",
    "پشتبازو": "پشت بازو",
    "biceps": "جلو بازو",
    "bicep": "جلو بازو",
    "جلوبازو": "جلو بازو",
    "abs": "شکم",
    "core": "شکم",
    "abdominals": "شکم",
    "calves": "ساق",
    "calf": "ساق",
}

# Longer Persian phrases first so "پشت بازو" wins over bare "پشت".
_PERSIAN_PHRASES: tuple[tuple[str, str], ...] = (
    ("پشت بازو", "پشت بازو"),
    ("پشت‌بازو", "پشت بازو"),
    ("جلو بازو", "جلو بازو"),
    ("جلوبازو", "جلو بازو"),
    ("زیربغل", "زیربغل"),
    ("زیر بغل", "زیربغل"),
    ("سرشانه", "سرشانه"),
    ("سینه", "سینه"),
    ("شکم", "شکم"),
    ("اصلاحی", "شکم"),
    ("ساق", "ساق"),
    ("پا", "پا"),
)

_SPLITTERS = re.compile(r"[+،,/|&]+|\s+و\s+|\s+-\s+")


def normalize_muscle(name: str) -> str:
    text = (name or "").strip()
    if not text:
        return text
    lower = text.lower()
    if lower in MUSCLE_ALIASES:
        return MUSCLE_ALIASES[lower]
    for phrase, canonical in _PERSIAN_PHRASES:
        if text == phrase:
            return canonical
    return text


def parse_split_day(label: str) -> list[str]:
    """Parse one split day label into ordered unique canonical muscles.

    Examples:
      ``سینه و پشت بازو`` → ``["سینه", "پشت بازو"]``
      ``پا`` → ``["پا"]``
      ``فول بادی A`` → ``[]`` (caller applies full-body fallback)
    """
    text = (label or "").strip()
    if not text:
        return []

    # Collect phrase hits with leftmost index so order follows the label.
    hits: list[tuple[int, str]] = []
    for phrase, canonical in _PERSIAN_PHRASES:
        start = 0
        while True:
            idx = text.find(phrase, start)
            if idx < 0:
                break
            hits.append((idx, canonical))
            start = idx + len(phrase)

    if hits:
        hits.sort(key=lambda item: item[0])
        ordered: list[str] = []
        for _idx, canonical in hits:
            if canonical not in ordered:
                ordered.append(canonical)
        return ordered

    parts = [p.strip() for p in _SPLITTERS.split(text) if p and p.strip()]
    if not parts:
        parts = [text]
    muscles: list[str] = []
    for part in parts:
        muscle = normalize_muscle(part)
        if muscle in CANONICAL_MUSCLES and muscle not in muscles:
            muscles.append(muscle)
        elif part.lower() in MUSCLE_ALIASES:
            canonical = MUSCLE_ALIASES[part.lower()]
            if canonical not in muscles:
                muscles.append(canonical)
    return muscles


def parse_template_split(split: list | None, *, days_per_week: int) -> list[tuple[str, list[str]]]:
    """Return ``[(title, muscles), ...]`` of length ``days_per_week``.

    Raises ``ValueError`` when split length does not match days_per_week.
    """
    raw = list(split or [])
    if len(raw) != days_per_week:
        raise ValueError(f"split length {len(raw)} does not match days_per_week {days_per_week}")

    days: list[tuple[str, list[str]]] = []
    for index, title in enumerate(raw):
        label = str(title or "").strip() or f"روز {index + 1}"
        days.append((label, parse_split_day(label)))
    return days
