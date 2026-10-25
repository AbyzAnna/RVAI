import argparse, json
from . import find_candidate_projects
parser = argparse.ArgumentParser(description='Search the RVAI source-backed catalog')
parser.add_argument('--category', required=True)
parser.add_argument('--platform', choices=['windows','macos','linux','android','ios','web'])
parser.add_argument('--features', nargs='*', default=[])
a = parser.parse_args()
print(json.dumps(find_candidate_projects({'category': a.category, 'platform': a.platform,
                                         'required_features': a.features}), indent=2))
