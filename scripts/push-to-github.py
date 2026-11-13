#!/usr/bin/env python3
"""Push this checkout to GitHub laughing-winner/main via the Lovable GitHub connector.
Railway auto-deploys from that branch. Usage: python3 scripts/push-to-github.py "message"
"""
import base64, hashlib, json, os, subprocess, sys, urllib.request

REPO = "umidjonalimardonov010-coder/laughing-winner"
BRANCH = "main"
GW = "https://connector-gateway.lovable.dev/github/"
SKIP_PREFIXES = (".lovable/",)
KEEP_REMOTE = {".env", "supabase/config.toml"}  # never touched by this script

def api(method, path, body=None):
    req = urllib.request.Request(GW + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={
        "Authorization": f"Bearer {os.environ['LOVABLE_API_KEY']}",
        "X-Connection-Api-Key": os.environ["GITHUB_API_KEY"],
        "Accept": "application/vnd.github+json", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> {e.code}: {e.read()[:500]}")

def git_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
msg = sys.argv[1] if len(sys.argv) > 1 else "Update from Lovable"
head = api("GET", f"repos/{REPO}/git/ref/heads/{BRANCH}")["object"]["sha"]
base_tree = api("GET", f"repos/{REPO}/git/commits/{head}")["tree"]["sha"]
remote = {e["path"]: e["sha"] for e in api("GET", f"repos/{REPO}/git/trees/{base_tree}?recursive=1")["tree"] if e["type"] == "blob"}
local = [f for f in subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard"], cwd=root, text=True).splitlines()
         if os.path.isfile(os.path.join(root, f)) and not f.startswith(SKIP_PREFIXES)]
entries = []
for f in local:
    data = open(os.path.join(root, f), "rb").read()
    if remote.get(f) == git_sha(data):
        continue
    blob = api("POST", f"repos/{REPO}/git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})
    entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print("~", f)
for f in set(remote) - set(local) - KEEP_REMOTE:
    if f.startswith(SKIP_PREFIXES):
        continue
    entries.append({"path": f, "mode": "100644", "type": "blob", "sha": None})
    print("-", f)
if not entries:
    print("Nothing to push"); sys.exit(0)
tree = api("POST", f"repos/{REPO}/git/trees", {"base_tree": base_tree, "tree": entries})["sha"]
commit = api("POST", f"repos/{REPO}/git/commits", {"message": msg, "tree": tree, "parents": [head]})["sha"]
api("PATCH", f"repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": commit})
print("pushed", commit)
