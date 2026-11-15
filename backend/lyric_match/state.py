"""Per-app services, stored on ``app.extensions["lyric_match"]``."""

from __future__ import annotations

from dataclasses import dataclass

from .snippets import SnippetService
from .songs import Catalogue
from .tokens import TokenCodec


@dataclass
class AppState:
    catalogue: Catalogue
    tokens: TokenCodec
    snippets: SnippetService
