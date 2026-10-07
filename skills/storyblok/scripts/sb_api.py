#!/usr/bin/env python3
"""Secret-safe Storyblok Management API client (stdlib only).

Usage: sb_api.py METHOD /path [--params k=v ...] [--data JSON|@file] [--env-file PATH]

Reads STORYBLOK_SPACE_ID, STORYBLOK_REGION, STORYBLOK_OAUTH_TOKEN from the environment or a `.env.local` found in the working
directory or a parent. Paths are relative to /v1/spaces/<id> (use "" for the space itself). Values are never printed.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HOSTS = {"eu": "mapi.storyblok.com", "us": "api-us.storyblok.com", "ca": "api-ca.storyblok.com", "ap": "api-ap.storyblok.com"}


def load_env(path=None):
    env = dict(os.environ)
    if not path:
        d = os.getcwd()
        while True:
            if os.path.exists(os.path.join(d, ".env.local")):
                path = os.path.join(d, ".env.local")
                break
            if os.path.dirname(d) == d:
                break
            d = os.path.dirname(d)
    if path and os.path.exists(path):
        for line in open(path):
            m = re.match(r"^([A-Z0-9_]+)=([^#\s]*)", line.strip())
            if m:
                env.setdefault(m.group(1), m.group(2).strip("\"'"))
    return env


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    method, path = argv[0].upper(), argv[1]
    params, data, env_file = {}, None, None
    i = 2
    while i < len(argv):
        if argv[i] == "--params":
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                k, _, v = argv[i].partition("=")
                params[k] = v
                i += 1
        elif argv[i] == "--data":
            raw = argv[i + 1]
            data = open(raw[1:]).read() if raw.startswith("@") else raw
            i += 2
        elif argv[i] == "--env-file":
            env_file = argv[i + 1]
            i += 2
        else:
            sys.exit(f"unknown argument {argv[i]}")
    env = load_env(env_file)
    space, token = env.get("STORYBLOK_SPACE_ID"), env.get("STORYBLOK_OAUTH_TOKEN")
    if not space or not token:
        sys.exit("Missing STORYBLOK_SPACE_ID / STORYBLOK_OAUTH_TOKEN (set in the environment or .env.local).")
    host = HOSTS[env.get("STORYBLOK_REGION", "eu").lower()]
    url = f"https://{host}/v1/spaces/{space}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    headers = {"Authorization": token}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=data.encode() if data else None, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode().replace(token, '***')[:600]}")
    try:
        body = json.dumps(json.loads(body), indent=2)
    except ValueError:
        pass
    print(body.replace(token, "***"))


if __name__ == "__main__":
    main(sys.argv[1:])
