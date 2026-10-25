"""RVAI research & discovery: find legitimate alternatives to paid software, with evidence."""

from .api import research_alternatives
from .catalog import CatalogError, load_catalog
from .discovery import DiscoveryError, GitHubSearch
from .export import export_proposals

__all__ = ["research_alternatives", "export_proposals", "load_catalog", "CatalogError", "DiscoveryError", "GitHubSearch"]
