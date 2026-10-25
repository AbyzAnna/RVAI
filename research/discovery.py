"""
External discovery through GitHub's public REST API (https://docs.github.com/rest/search).
Using the API is permitted by GitHub's terms; nothing here scrapes search-engine pages.

Without a token the search API allows about 10 requests a minute; set GITHUB_TOKEN for 30.
Results are *leads*: repository metadata says what a project claims, not what it does.
"""

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
USER_AGENT = "RVAI-research (+https://github.com/AbyzAnna/RVAI)"


class DiscoveryError(Exception):
    """kind is one of: network, rate_limit, http, malformed."""

    def __init__(self, kind, message, retry_at=None):
        super().__init__(message)
        self.kind = kind
        self.retry_at = retry_at


def urllib_fetch(url, headers, timeout=10):
    """Default transport: returns (status, headers, body bytes). Tests pass their own."""
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers or {}), err.read() or b""
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise DiscoveryError("network", f"could not reach GitHub: {getattr(err, 'reason', err)}") from err


def _header(headers, name):
    for key, value in (headers or {}).items():
        if key.lower() == name.lower():
            return value
    return None


def _rate_limit_error(status, headers):
    remaining = _header(headers, "X-RateLimit-Remaining")
    if status == 429 or (status == 403 and (remaining == "0" or _header(headers, "Retry-After"))):
        retry_at = None
        if _header(headers, "Retry-After"):
            try:
                retry_at = int(time.time()) + int(_header(headers, "Retry-After"))
            except ValueError:
                pass
        elif _header(headers, "X-RateLimit-Reset"):
            try:
                retry_at = int(_header(headers, "X-RateLimit-Reset"))
            except ValueError:
                pass
        hint = "" if retry_at is None else f", retry after {time.strftime('%H:%M:%S', time.localtime(retry_at))}"
        return DiscoveryError("rate_limit", f"GitHub API rate limit reached{hint}; set GITHUB_TOKEN for a higher limit", retry_at)
    return None


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


class GitHubSearch:
    name = "github"

    def __init__(self, token=None, fetch=None, max_results=8):
        self.token = token
        self.fetch = fetch or urllib_fetch
        self.max_results = max_results

    def _get(self, path, params=None):
        url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
        headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        status, resp_headers, body = self.fetch(url, headers)
        limited = _rate_limit_error(status, resp_headers)
        if limited:
            raise limited
        if status == 404:
            return None
        if status != 200:
            raise DiscoveryError("http", f"GitHub API answered HTTP {status} for {path}")
        try:
            return json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
        except (ValueError, UnicodeDecodeError) as err:
            raise DiscoveryError("malformed", f"GitHub API returned invalid JSON for {path}") from err

    def queries(self, product_name):
        short = product_name.strip()
        return [
            f"topic:{_slug(short)}-alternative archived:false",
            f'"{short}" alternative in:name,description archived:false fork:false',
        ]

    def search(self, product_name):
        """
        Returns (leads, notes). Raises DiscoveryError when no query succeeded; if only some failed,
        the error is reported in notes and the leads found so far are kept.
        """
        leads, notes, failures, succeeded = [], [], [], 0
        for q in self.queries(product_name):
            try:
                data = self._get("/search/repositories", {"q": q, "sort": "stars", "order": "desc", "per_page": self.max_results})
            except DiscoveryError as err:
                failures.append(err)
                if err.kind == "rate_limit":
                    break  # further queries would fail the same way
                continue
            items = data.get("items") if isinstance(data, dict) else None
            if not isinstance(items, list):
                failures.append(DiscoveryError("malformed", "GitHub search response had no items list"))
                continue
            succeeded += 1
            if data.get("incomplete_results"):
                notes.append("GitHub marked a search as incomplete (it timed out); some repositories may be missing.")
            for item in items:
                lead = parse_repository(item)
                if lead:
                    leads.append(lead)
                else:
                    notes.append("Skipped a malformed repository record.")
        if failures and not succeeded:
            raise failures[0]
        notes.extend(f"query failed: {f}" for f in failures)
        return leads, notes

    def license_file(self, full_name):
        """
        Asks GitHub which license its detector finds in the repository's license file.
        Returns {spdx, url} (url is the license file itself), or None when there is no license file.
        """
        data = self._get(f"/repos/{full_name}/license")
        if not isinstance(data, dict):
            return None
        lic = data.get("license") if isinstance(data.get("license"), dict) else {}
        url = data.get("html_url") if isinstance(data.get("html_url"), str) else None
        return {"spdx": lic.get("spdx_id") if isinstance(lic.get("spdx_id"), str) else None, "url": url}


def parse_repository(item):
    """Keeps only well-formed fields of a search result; returns None if the record is unusable."""
    if not isinstance(item, dict):
        return None
    full_name, name, html_url = item.get("full_name"), item.get("name"), item.get("html_url")
    if not all(isinstance(v, str) and v for v in (full_name, name, html_url)):
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name):
        return None
    lic = item.get("license") if isinstance(item.get("license"), dict) else {}
    topics = item.get("topics") if isinstance(item.get("topics"), list) else []
    stars = item.get("stargazers_count")
    return {
        "fullName": full_name,
        "name": name,
        "description": item.get("description"),  # untrusted; cleaned later
        "repositoryUrl": html_url,
        "homepage": item.get("homepage") if isinstance(item.get("homepage"), str) else None,
        "licenseSpdx": lic.get("spdx_id") if isinstance(lic.get("spdx_id"), str) else None,
        "topics": [t for t in topics if isinstance(t, str)][:30],
        "stars": stars if isinstance(stars, int) and not isinstance(stars, bool) else None,
        "archived": item.get("archived") is True,
        "fork": item.get("fork") is True,
        "pushedAt": item.get("pushed_at") if isinstance(item.get("pushed_at"), str) else None,
    }
