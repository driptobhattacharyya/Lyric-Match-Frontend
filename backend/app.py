"""WSGI entry point: ``gunicorn app:app``."""

from lyric_match import create_app

app = create_app()
