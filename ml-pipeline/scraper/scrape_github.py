import argparse
import csv
import os
import sys
import time
from itertools import chain
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Set, Tuple
from urllib.parse import quote

from dotenv import load_dotenv
import requests

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

GITHUB_API_BASE = "https://api.github.com"
SEARCH_ENDPOINT = f"{GITHUB_API_BASE}/search/code"
TARGET_DOWNLOADS = 500
REQUEST_DELAY_SECONDS = 2.0
MIN_FILE_BYTES = 200
SEARCH_QUERIES = [
    "microservices architecture extension:excalidraw",
    "distributed system extension:excalidraw",
    "system design filename:.excalidraw",
    "cloud architecture extension:excalidraw",
    "microservices diagram extension:excalidraw",
    "kubernetes architecture extension:excalidraw",
    "api gateway service mesh extension:excalidraw",
    "event driven architecture extension:excalidraw",
]
PRIORITY_REPOS = [
    "karanpratapsingh/system-design",
    "swaymun/system-design-excalidraws",
    "enkr1/interview_preparation_system_design_excalidraw_examples",
    "aretecode/system-design-templates-excalidraw",
]

ROOT_DIR = Path(__file__).resolve().parents[1]


def resolve_output_paths() -> Tuple[Path, Path, Path]:
    output_dir = os.getenv("SCRAPER_OUTPUT_DIR", "./data/raw")
    os.makedirs(output_dir, exist_ok=True)

    raw_dir = Path(output_dir)
    if not raw_dir.is_absolute():
        raw_dir = (ROOT_DIR / raw_dir).resolve()

    data_dir = raw_dir.parent
    manifest_path = data_dir / "manifest.csv"
    return raw_dir, data_dir, manifest_path


RAW_DIR, DATA_DIR, MANIFEST_PATH = resolve_output_paths()


def sanitize_filename(value: str) -> str:
    cleaned = []
    for char in value:
        if char.isalnum() or char in {"-", "_", "."}:
            cleaned.append(char)
        else:
            cleaned.append("_")
    return "".join(cleaned)


class GitHubClient:
    def __init__(self, token: Optional[str]) -> None:
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/vnd.github+json",
                "User-Agent": "InfraZero-ARM-Scraper/1.0",
            }
        )
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"
        self._last_request_ts = 0.0

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        backoff = 2.0
        attempt = 0

        while True:
            elapsed = time.time() - self._last_request_ts
            if elapsed < REQUEST_DELAY_SECONDS:
                time.sleep(REQUEST_DELAY_SECONDS - elapsed)

            response = self.session.request(method, url, timeout=30, **kwargs)
            self._last_request_ts = time.time()

            if response.status_code == 429:
                attempt += 1
                if attempt > 5:
                    response.raise_for_status()
                retry_after = response.headers.get("Retry-After")
                sleep_for = float(retry_after) if retry_after else backoff
                time.sleep(sleep_for)
                backoff *= 2
                continue

            if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
                reset_at = response.headers.get("X-RateLimit-Reset")
                if reset_at:
                    sleep_for = max(1, int(reset_at) - int(time.time()))
                else:
                    sleep_for = backoff
                attempt += 1
                if attempt > 5:
                    response.raise_for_status()
                time.sleep(sleep_for)
                backoff *= 2
                continue

            response.raise_for_status()
            return response

    def get_json(self, url: str, **kwargs) -> Dict:
        return self.request("GET", url, **kwargs).json()

    def get_text(self, url: str, **kwargs) -> str:
        return self.request("GET", url, **kwargs).text


def ensure_directories() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def build_saved_name(repo_full_name: str, path_name: str, seen_names: Set[str]) -> str:
    repo_name = sanitize_filename(repo_full_name.replace("/", "_"))
    filename = sanitize_filename(Path(path_name).name)
    candidate = f"{repo_name}_{filename}"

    if candidate not in seen_names:
        seen_names.add(candidate)
        return candidate

    stem = Path(filename).stem
    suffix = Path(filename).suffix or ".excalidraw"
    unique_candidate = f"{repo_name}_{stem}_{abs(hash(path_name)) % 100000}{suffix}"
    seen_names.add(unique_candidate)
    return unique_candidate


def iter_priority_repo_files(client: GitHubClient) -> Iterator[Dict[str, str]]:
    for repo in PRIORITY_REPOS:
        try:
            repo_meta = client.get_json(f"{GITHUB_API_BASE}/repos/{repo}")
            default_branch = repo_meta.get("default_branch", "main")
            tree = client.get_json(
                f"{GITHUB_API_BASE}/repos/{repo}/git/trees/{quote(default_branch, safe='')}?recursive=1"
            )
        except requests.HTTPError as exc:
            print(f"Failed to inspect priority repo {repo}: {exc}", file=sys.stderr)
            continue

        for item in tree.get("tree", []):
            if item.get("type") != "blob":
                continue
            path_name = item.get("path", "")
            if not path_name.lower().endswith(".excalidraw"):
                continue
            yield {
                "source_repo": repo,
                "file_name": Path(path_name).name,
                "path": path_name,
                "download_url": f"https://raw.githubusercontent.com/{repo}/{default_branch}/{path_name}",
            }


def iter_search_results(client: GitHubClient, max_repos: int) -> Iterator[Dict[str, str]]:
    seen_search_keys: Set[Tuple[str, str]] = set()

    for search_query in SEARCH_QUERIES:
        seen_repos_for_query: Set[str] = set()
        for page in range(1, 6):
            params = {
                "q": search_query,
                "per_page": 100,
                "page": page,
            }
            try:
                payload = client.get_json(SEARCH_ENDPOINT, params=params)
            except requests.HTTPError as exc:
                print(f"Search failed for query '{search_query}' page {page}: {exc}", file=sys.stderr)
                break

            items = payload.get("items", [])
            if not items:
                break

            for item in items:
                repo = item.get("repository", {}).get("full_name")
                path_name = item.get("path")
                if not repo or not path_name:
                    continue

                if repo not in seen_repos_for_query and len(seen_repos_for_query) >= max_repos:
                    continue
                seen_repos_for_query.add(repo)

                key = (repo, path_name)
                if key in seen_search_keys:
                    continue
                seen_search_keys.add(key)

                try:
                    file_meta = client.get_json(item["url"])
                except requests.HTTPError as exc:
                    print(f"Metadata fetch failed for {repo}/{path_name}: {exc}", file=sys.stderr)
                    continue

                download_url = file_meta.get("download_url")
                if not download_url:
                    continue

                yield {
                    "source_repo": repo,
                    "file_name": Path(path_name).name,
                    "path": path_name,
                    "download_url": download_url,
                }


def download_candidate_files(client: GitHubClient, max_repos: int) -> None:
    ensure_directories()
    downloaded = 0
    skipped_small = 0
    skipped_duplicate = 0
    total_candidates_seen = 0
    saved_names: Set[str] = set()
    seen_repo_paths: Set[Tuple[str, str]] = set()

    with MANIFEST_PATH.open("w", newline="", encoding="utf-8") as manifest_handle:
        writer = csv.DictWriter(
            manifest_handle, fieldnames=["source_repo", "file_name", "download_url"]
        )
        writer.writeheader()

        for candidate in chain(iter_priority_repo_files(client), iter_search_results(client, max_repos)):
            total_candidates_seen += 1
            if downloaded >= TARGET_DOWNLOADS:
                break

            repo = candidate["source_repo"]
            path_name = candidate["path"]
            key = (repo, path_name)
            if key in seen_repo_paths:
                skipped_duplicate += 1
                continue
            seen_repo_paths.add(key)

            try:
                content = client.get_text(candidate["download_url"])
            except requests.HTTPError as exc:
                print(f"Download failed for {repo}/{path_name}: {exc}", file=sys.stderr)
                continue

            if len(content.encode("utf-8")) < MIN_FILE_BYTES:
                skipped_small += 1
                print(f"Downloaded {downloaded}/{TARGET_DOWNLOADS} | Skipped: {skipped_small} (too small)")
                continue

            saved_name = build_saved_name(repo, path_name, saved_names)
            output_path = RAW_DIR / saved_name
            output_path.write_text(content, encoding="utf-8")

            writer.writerow(
                {
                    "source_repo": repo,
                    "file_name": saved_name,
                    "download_url": candidate["download_url"],
                }
            )
            manifest_handle.flush()

            downloaded += 1
            print(f"Downloaded {downloaded}/{TARGET_DOWNLOADS} | Skipped: {skipped_small} (too small)")

    if skipped_duplicate:
        print(f"Duplicate matches skipped: {skipped_duplicate}")

    if downloaded >= TARGET_DOWNLOADS:
        stop_reason = "target reached"
    else:
        stop_reason = "no more candidates from current search scope"

    print("Scrape summary:")
    print(f"  Downloaded: {downloaded}/{TARGET_DOWNLOADS}")
    print(f"  Candidates seen: {total_candidates_seen}")
    print(f"  Skipped (too small): {skipped_small}")
    print(f"  Skipped (duplicates): {skipped_duplicate}")
    print(f"  Stop reason: {stop_reason}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Excalidraw architecture files from GitHub")
    parser.add_argument("--token", help="GitHub personal access token")
    args = parser.parse_args()

    token = args.token or os.getenv("GITHUB_TOKEN")
    if not token:
        print("ERROR: GitHub token not found.")
        print("Either pass --token YOUR_TOKEN or create ml-pipeline/.env with GITHUB_TOKEN=...")
        sys.exit(1)

    max_repos = int(os.getenv("SCRAPER_MAX_REPOS", "10"))
    global RAW_DIR, DATA_DIR, MANIFEST_PATH
    RAW_DIR, DATA_DIR, MANIFEST_PATH = resolve_output_paths()

    client = GitHubClient(token)
    download_candidate_files(client, max_repos)


if __name__ == "__main__":
    main()
