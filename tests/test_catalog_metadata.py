"""Data-quality checks for the catalog handoff; no backend implementation."""
import json
import unittest
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
class MetadataTests(unittest.TestCase):
    def test_provenance_and_vocabulary(self):
        taxonomy=json.loads((ROOT/'data/taxonomy.json').read_text())
        vocab={c['id']:{f['id'] for f in c['features']} for c in taxonomy['categories']}
        entries=json.loads((ROOT/'data/alternatives.json').read_text())
        for p in entries:
            with self.subTest(project=p['id']):
                self.assertIn(p['category'],vocab)
                self.assertTrue(set(p['features'])<=vocab[p['category']])
                self.assertTrue(set(p['features'])<=set(p['feature_evidence']))
                date.fromisoformat(p['last_verified'])
                self.assertIn(p['verification_status'],['source_reviewed_not_runtime_tested'])
                self.assertIsInstance(p['unknowns'],list)
                for key in ('official_url','license_source_url','pricing_source_url','platform_source_url'):
                    self.assertEqual(urlparse(p[key]).scheme,'https')
                    self.assertTrue(urlparse(p[key]).netloc)
                for url in p['feature_evidence'].values():
                    self.assertEqual(urlparse(url).scheme,'https')
