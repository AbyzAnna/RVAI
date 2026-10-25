import unittest
from copy import deepcopy
from catalog import load_catalog, find_candidate_projects

class CatalogTests(unittest.TestCase):
    def test_sources(self):
        self.assertGreaterEqual(len(load_catalog()), 6)
    def test_unknowns_stay_unknown(self):
        r=find_candidate_projects({'category':'voxel_game','required_features':['world_saving','crafting']})
        m=next(m for m in r['recommendations'] if m['project']['id']=='luanti')
        self.assertEqual(m['unknown_features'], ['crafting'])
        self.assertEqual(m['missing_features'], [])
        self.assertEqual(m['feature_coverage'], .5)
    def test_platform(self):
        r=find_candidate_projects({'category':'cad','platform':'ios'})
        self.assertEqual(r['status'], 'no_match')
        self.assertIn('platform_incompatible', r['excluded'][0]['reasons'])
    def test_unknown_license(self):
        c=[deepcopy(load_catalog()[0])]; c[0]['license']=None
        self.assertEqual(find_candidate_projects({'category':'voxel_game'}, c)['status'],'no_match')
    def test_trial_not_free(self):
        c=[deepcopy(load_catalog()[0])]; c[0]['pricing_type']='free_trial'
        self.assertEqual(find_candidate_projects({'category':'voxel_game'}, c)['status'],'no_match')
    def test_duplicate(self):
        c=load_catalog()
        self.assertEqual(len(find_candidate_projects({'category':'cad'}, c+c)['recommendations']),len([p for p in c if p['category']=='cad']))
    def test_invalid(self):
        for s in ({}, {'category':'cad','budget':-1}, {'category':'cad','required_features':'x'}):
            with self.assertRaises(ValueError): find_candidate_projects(s)
    def test_other_scenarios(self):
        for category in ('cad','video_editor'):
            self.assertEqual(find_candidate_projects({'category':category})['status'],'matches')
    def test_no_match(self):
        self.assertEqual(find_candidate_projects({'category':'unknown'})['status'],'no_match')

if __name__=='__main__': unittest.main()
