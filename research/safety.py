"""
Everything fetched from outside (repository descriptions, topics, homepages) is untrusted data.
It is cleaned, length-limited and checked here, and it is never read as instructions: no field of a
candidate is ever set from what a description *says* about itself.

The URL and piracy checks mirror src/guardrails.ts so both halves of RVAI agree on what is safe.
"""

import re
from urllib.parse import urlparse

# Same list as BLOCKED_HOST_TERMS in src/guardrails.ts.
BLOCKED_HOST_TERMS = [
    "crack", "keygen", "warez", "torrent", "nulled", "pirate", "piratebay", "rutracker",
    "fitgirl", "dodi", "igg-games", "getintopc", "filecr", "softonic", "apkmirror-mod", "repack",
]

# Same as BLOCKED_OUTPUT_TEXT in src/guardrails.ts.
BLOCKED_TEXT = re.compile(r"\b(crack(ed)?|keygen|warez|nulled|torrent)\b", re.I)

# Text that tries to talk to an AI agent instead of describing software.
INJECTION_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|system)\b.{0,20}\b(instructions?|prompts?|rules?|context)\b",
        r"\b(you are|act as|pretend to be|from now on you)\b.{0,40}\b(ai|assistant|agent|model|chatbot|gpt|claude)\b",
        r"\bsystem prompt\b",
        r"\b(assistant|agent|ai|llm|model)s?\b.{0,30}\b(must|should|shall)\b.{0,30}\b(mark|rank|recommend|say|report|output|set|list)\b",
        r"\b(mark|rate|rank|list|report)\b.{0,30}\b(this|it)\b.{0,30}\b(as|with)\b.{0,20}\b(verified|open source|full support|mit|top|best|#1|number one)\b",
        r"</?\s*(system|instructions?|prompt)\s*>",
        r"\b(run|execute|curl|wget|download and run)\b.{0,30}\b(this|the following|command|script)\b",
    ]
]

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩]")

WITHHELD = "[withheld: the source text contained instructions aimed at an AI agent]"


def is_safe_url(raw):
    """True when a URL is https, has a real host, and shows no piracy markers."""
    if not isinstance(raw, str):
        return False
    try:
        url = urlparse(raw.strip())
    except ValueError:
        return False
    if url.scheme != "https" or not url.hostname or "." not in url.hostname:
        return False
    haystack = f"{url.hostname}{url.path}".lower()
    return not any(term in haystack for term in BLOCKED_HOST_TERMS)


def clean_text(value, max_len=400):
    """Returns a single-line, length-limited string, or None for anything that isn't text."""
    if not isinstance(value, str):
        return None
    text = " ".join(_CONTROL.sub(" ", value).split())
    if not text:
        return None
    return text if len(text) <= max_len else text[: max_len - 1].rstrip() + "…"


def looks_like_injection(text):
    return bool(text) and any(p.search(text) for p in INJECTION_PATTERNS)


def mentions_piracy(text):
    return bool(text) and bool(BLOCKED_TEXT.search(text))


def untrusted_description(value):
    """
    Cleans a description from an outside source. Returns (text, warning): text is None or WITHHELD
    when the original can't be shown, and warning explains why.
    """
    text = clean_text(value)
    if text and looks_like_injection(text):
        return WITHHELD, "Description contained instruction-like text; treated as untrusted data and withheld."
    return text, None
