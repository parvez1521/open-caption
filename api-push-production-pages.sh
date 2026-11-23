#!/bin/bash
# Push the production-pages audit branch HEAD's content to main via the GitHub git-data API (git transport is proxy-blocked).
# Verifies the new tree is byte-identical to HEAD's tree before touching the ref.
# HEAD = production-pages audit implementation on top of main 7f350071.
# DO NOT RUN without the owner's explicit deploy word.
set -u
cd ~/workspace/oc-production-pages-2026-11-23 || exit 1
REPO="parvez1521/open-caption"
BASE="7f350071e2c82cab3d7c7386dafef36ee533d687"
FA=$(git rev-parse HEAD)
FA_TREE=$(git rev-parse "$FA^{tree}")
BASE_TREE=$(gh api "repos/$REPO/git/commits/$BASE" --jq '.tree.sha')
echo "base tree: $BASE_TREE"
echo "fa tree:   $FA_TREE"
echo "fa commit: $FA"

ENTRIES="$(pwd)/.api-push-tree-entries.jsonl"
: > "$ENTRIES"
while IFS= read -r f; do
  mode=$(git ls-tree "$FA" -- "$f" | awk '{print $1}')
  b64_file=$(mktemp)
  base64 -w0 "$f" | tr -d '\n' > "$b64_file"
  sha=$(jq -n --rawfile c "$b64_file" '{content:$c, encoding:"base64"}' | gh api "repos/$REPO/git/blobs" --input - --jq '.sha')
  rm -f "$b64_file"
  if ! printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "BLOB FAILED for $f: $sha"
    exit 3
  fi
  echo "blob $f $sha"
  jq -n --arg p "$f" --arg m "$mode" --arg s "$sha" '{path:$p, mode:$m, type:"blob", sha:$s}' >> "$ENTRIES"
done < <(git diff --name-only "$BASE" "$FA")

TREE_JSON=$(jq -n --arg base "$BASE_TREE" --slurpfile entries "$ENTRIES" '{base_tree:$base, tree:$entries}')
NEW_TREE=$(echo "$TREE_JSON" | gh api "repos/$REPO/git/trees" --input - --jq '.sha')
echo "new tree:  $NEW_TREE"
if [ "$NEW_TREE" != "$FA_TREE" ]; then
  echo "TREE MISMATCH — aborting, ref untouched"
  exit 2
fi
echo "TREE MATCHES HEAD — content identical, creating commit"
MSG=$(git log -1 --format=%B "$FA")
NEW_COMMIT=$(jq -n --arg msg "$MSG" --arg tree "$NEW_TREE" --arg base "$BASE" '{message:$msg, tree:$tree, parents:[$base]}' | gh api "repos/$REPO/git/commits" --input - --jq '.sha')
echo "new commit: $NEW_COMMIT"
jq -n --arg sha "$NEW_COMMIT" '{sha:$sha, force:false}' | gh api "repos/$REPO/git/refs/heads/main" -X PATCH --input - --jq '.object.sha'
echo "MAIN NOW:"
gh api "repos/$REPO/commits/main" --jq '.sha'
rm -f "$ENTRIES"
