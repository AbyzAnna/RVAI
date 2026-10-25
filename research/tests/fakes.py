"""A stand-in for the network: each GitHub URL gets a queued answer, so tests never go online."""

import json

from research.discovery import GitHubSearch


def repo(full_name, description=None, spdx="MIT", homepage=None, topics=None, stars=100, **extra):
    return {
        "full_name": full_name,
        "name": full_name.split("/")[-1],
        "html_url": f"https://github.com/{full_name}",
        "description": description,
        "homepage": homepage,
        "license": {"spdx_id": spdx} if spdx else None,
        "topics": topics or [],
        "stargazers_count": stars,
        "archived": False,
        "fork": False,
        "pushed_at": "2026-10-01T00:00:00Z",
        **extra,
    }


def ok(payload, headers=None):
    return 200, headers or {}, json.dumps(payload).encode()


def search(*items, incomplete=False):
    return ok({"total_count": len(items), "incomplete_results": incomplete, "items": list(items)})


def license_file(full_name, spdx):
    return ok({"license": {"spdx_id": spdx}, "html_url": f"https://github.com/{full_name}/blob/main/LICENSE"})


NOT_FOUND = (404, {}, b'{"message": "Not Found"}')


class FakeFetch:
    """
    routes: list of (url substring, answer). An answer is a (status, headers, body) tuple, an
    exception to raise, or a list of those used in order. Unmatched URLs answer 404.
    """

    def __init__(self, routes):
        self.routes = [(k, list(v) if isinstance(v, list) else [v]) for k, v in routes]
        self.calls = []

    def __call__(self, url, headers):
        self.calls.append((url, headers))
        for key, answers in self.routes:
            if key in url:
                answer = answers.pop(0) if len(answers) > 1 else answers[0]
                if isinstance(answer, Exception):
                    raise answer
                return answer
        return NOT_FOUND

    def searches(self):
        return [u for u, _ in self.calls if "/search/" in u]


def provider(routes, **kwargs):
    fetch = FakeFetch(routes)
    return GitHubSearch(fetch=fetch, **kwargs), fetch
