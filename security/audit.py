"""Verify published asset digests and check inventoried packages in OSV."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OSV = "https://api.osv.dev/v1/querybatch"


def read_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def verify_assets(assets):
    for asset in assets:
        url = asset["url"]
        with urlopen(url, timeout=90) as response:
            if response.geturl() != url:
                raise RuntimeError(f"Unexpected redirect: {url}")
            digest = hashlib.sha384()
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
        actual = "sha384-" + base64.b64encode(digest.digest()).decode()
        if actual != asset["integrity"]:
            raise RuntimeError(f"SHA-384 mismatch: {url}")
        print(f"Verified {url}")


def advisory_scan(packages, core):
    queries = [
        (f"{item['name']} {item['version']}", {
            "version": item["version"],
            "package": {"name": item["name"], "ecosystem": item["ecosystem"]},
        }) for item in packages
    ]
    queries.extend([
        (f"{core['npm']} {core['version']}", {
            "version": core["version"],
            "package": {"name": core["npm"], "ecosystem": "npm"},
        }),
        (f"FFmpeg {core['ffmpeg']} git commit", {"commit": core["ffmpegCommit"]}),
    ])
    failures = False
    while queries:
        payload = json.dumps({"queries": [query for _, query in queries]}).encode()
        request = Request(OSV, data=payload, headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=60) as response:
            results = json.load(response)["results"]
        if len(results) != len(queries):
            raise RuntimeError("OSV returned an incomplete response")
        next_page = []
        for (name, query), result in zip(queries, results):
            ids = [entry["id"] for entry in result.get("vulns", [])]
            if ids:
                failures = True
                print(f"{name}: {', '.join(ids)}")
            else:
                print(f"{name}: no matching OSV advisories in this response")
            if token := result.get("next_page_token"):
                next_page.append((name, {**query, "page_token": token}))
        queries = next_page
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hashes-only", action="store_true")
    arguments = parser.parse_args()
    inventory = read_json("security/dependencies.json")
    core = read_json("file-tools/core-manifest.json")
    verify_assets([*core["assets"].values(), *inventory["cdn"]])
    if not arguments.hashes_only and advisory_scan(inventory["packages"], core):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
