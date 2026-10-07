#!/usr/bin/env python3
"""Secret-safe Contentstack CMA client (stdlib only).

Usage: cs_api.py METHOD /path [--params k=v ...] [--data JSON|@file] [--env-file PATH]

Reads CONTENTSTACK_API_KEY, CONTENTSTACK_MANAGEMENT_TOKEN, CONTENTSTACK_REGION from the environment or a `.env.local`
found in the working directory or a parent. Values are never printed; they are redacted from all output.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HOSTS = {"us": "api.contentstack.io", "eu": "eu-api.contentstack.com", "au": "au-api.contentstack.com",
         "azure-na": "azure-na-api.contentstack.com", "azure-eu": "azure-eu-api.contentstack.com",
         "gcp-na": "gcp-na-api.contentstack.com"}


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
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
            if m:
                env.setdefault(m.group(1), m.group(2).strip('"\''))
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
    key, token = env.get("CONTENTSTACK_API_KEY"), env.get("CONTENTSTACK_MANAGEMENT_TOKEN")
    if not key or not token:
        sys.exit("Missing CONTENTSTACK_API_KEY / CONTENTSTACK_MANAGEMENT_TOKEN (set in the environment or .env.local).")
    region = env.get("CONTENTSTACK_REGION", "us")
    url = f"https://{HOSTS[region]}/v3{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, method=method, data=data.encode() if data else None,
                                 headers={"api_key": key, "authorization": token, "Content-Type": "application/json"})
    redact = lambda t: t.replace(key, "***").replace(token, "***")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {redact(e.read().decode())[:600]}")
    try:
        body = json.dumps(json.loads(body), indent=2)
    except ValueError:
        pass
    print(redact(body))


if __name__ == "__main__":
    main(sys.argv[1:])
