#!/usr/bin/env python3
"""Secret-safe Contentful Management API client (stdlib only). Tested against a real space (project 1).

Usage: cf_api.py METHOD /path [--params k=v ...] [--data JSON|@file] [--header 'Name: value'] [--env-file PATH]

Paths are relative to /spaces/<id>/environments/<env> (use "" for the environment itself, "/.." style is not supported; space-level paths start with @, e.g. @/environments).
Reads CONTENTFUL_SPACE_ID, CONTENTFUL_ENVIRONMENT (default master), CONTENTFUL_REGION (us|eu, default us), CONTENTFUL_MANAGEMENT_TOKEN from the environment or a `.env.local`
in the working directory or a parent. Values are never printed.
"""
import json, os, re, sys, urllib.error, urllib.parse, urllib.request

HOSTS = {"us": "api.contentful.com", "eu": "api.eu.contentful.com"}


def load_env(path=None):
    env = dict(os.environ)
    if not path:
        d = os.getcwd()
        while True:
            if os.path.exists(os.path.join(d, ".env.local")):
                path = os.path.join(d, ".env.local"); break
            if os.path.dirname(d) == d: break
            d = os.path.dirname(d)
    if path and os.path.exists(path):
        for line in open(path):
            m = re.match(r"^([A-Z0-9_]+)=([^#\s]*)", line.strip())
            if m: env.setdefault(m.group(1), m.group(2).strip("\"'"))
    return env


def main(argv):
    if len(argv) < 2: sys.exit(__doc__)
    method, path = argv[0].upper(), argv[1]
    params, data, extra, env_file, i = {}, None, {}, None, 2
    while i < len(argv):
        if argv[i] == "--params":
            i += 1
            while i < len(argv) and not argv[i].startswith("--"):
                k, _, v = argv[i].partition("="); params[k] = v; i += 1
        elif argv[i] == "--data":
            raw = argv[i + 1]; data = open(raw[1:]).read() if raw.startswith("@") else raw; i += 2
        elif argv[i] == "--header":
            k, _, v = argv[i + 1].partition(":"); extra[k.strip()] = v.strip(); i += 2
        elif argv[i] == "--env-file":
            env_file = argv[i + 1]; i += 2
        else: sys.exit(f"unknown argument {argv[i]}")
    env = load_env(env_file)
    space, token = env.get("CONTENTFUL_SPACE_ID"), env.get("CONTENTFUL_MANAGEMENT_TOKEN")
    if not space or not token: sys.exit("Missing CONTENTFUL_SPACE_ID / CONTENTFUL_MANAGEMENT_TOKEN (environment or .env.local).")
    region = env.get("CONTENTFUL_REGION", "us").lower()
    if region not in HOSTS: sys.exit(f"CONTENTFUL_REGION must be us or eu (got a different value); probe both hosts to find the right one.")
    host = HOSTS[region]
    envname = env.get("CONTENTFUL_ENVIRONMENT", "master")
    base = f"https://{host}/spaces/{space}" + ("" if path.startswith("@") else f"/environments/{envname}")
    url = base + (path[1:] if path.startswith("@") else path) + ("?" + urllib.parse.urlencode(params) if params else "")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/vnd.contentful.management.v1+json", **extra}
    req = urllib.request.Request(url, method=method, data=data.encode() if data else None, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: body = r.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode().replace(token, '***')[:700]}")
    try: body = json.dumps(json.loads(body), indent=2)
    except ValueError: pass
    print(body.replace(token, "***"))


if __name__ == "__main__":
    main(sys.argv[1:])
