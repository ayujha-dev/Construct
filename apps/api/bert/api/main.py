"""Compatibility import for callers using the pre-cleanup module path."""

from bert.main import app, manager, startup

__all__ = ["app", "manager", "startup"]
