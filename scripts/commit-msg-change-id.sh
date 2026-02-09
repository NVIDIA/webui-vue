#!/bin/sh
# Gerrit Change-Id hook — adds a unique Change-Id trailer to every
# commit message that doesn't already have one.
#
# This is the standard Gerrit commit-msg hook, checked into the repo
# so it runs automatically via simple-git-hooks (no manual scp needed).
#
# Original source: https://gerrit-review.googlesource.com/tools/hooks/commit-msg

# Avoid modifying merge commits
if test -d "$GIT_DIR/rebase-merge" || test -d "$GIT_DIR/rebase-apply"; then
  :
fi

# Do not produce a Change-Id for squash/fixup commits
if test "$(head -1 "$1" | grep -c '^squash!')" -gt 0; then
  exit 0
fi
if test "$(head -1 "$1" | grep -c '^fixup!')" -gt 0; then
  exit 0
fi

# Do not add Change-Id if one is already present
if grep -q '^Change-Id:' "$1"; then
  exit 0
fi

# Generate a unique Change-Id from the commit content
add_change_id() {
  clean_message=$(sed -e '
    /^diff --git/q
    /^Signed-off-by:/d
    /^#/d
  ' "$1")

  id=$(
    {
      printf "tree %s\n" "$(git write-tree 2>/dev/null)"
      if parent=$(git rev-parse "HEAD^{commit}" 2>/dev/null); then
        printf "parent %s\n" "$parent"
      fi
      printf "author %s\n" "$(git var GIT_AUTHOR_IDENT)"
      printf "committer %s\n" "$(git var GIT_COMMITTER_IDENT)"
      printf "\n%s" "$clean_message"
    } | git hash-object -t blob --stdin
  )

  # Insert Change-Id before any trailing Signed-off-by / Reviewed-by lines
  # but after the main message body.
  # Use awk to append it at the right place.
  awk -v id="$id" '
    BEGIN { found=0; body_done=0 }
    /^(Signed-off-by|Reviewed-by|Tested-by|Acked-by|Cc):/ {
      if (!found) {
        printf "Change-Id: I%s\n", id
        found=1
      }
    }
    { print }
    END {
      if (!found) {
        printf "\nChange-Id: I%s\n", id
      }
    }
  ' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

add_change_id "$1"
