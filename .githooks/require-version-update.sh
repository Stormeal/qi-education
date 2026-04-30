#!/bin/sh

version_files="package.json app/package.json app/src/app/app.ts"
mode="${1:-staged}"

if [ "$mode" = "staged" ]; then
  version_diff="$(git diff --cached -- $version_files)"
else
  version_diff=""
  while read local_ref local_sha remote_ref remote_sha
  do
    [ -z "$local_sha" ] && continue
    case "$local_sha" in
      0000000000000000000000000000000000000000) continue ;;
    esac

    case "$remote_sha" in
      0000000000000000000000000000000000000000)
        version_diff="$version_diff
$(git show --format= "$local_sha" -- $version_files)"
        ;;
      *)
        version_diff="$version_diff
$(git diff "$remote_sha..$local_sha" -- $version_files)"
        ;;
    esac
  done

  if [ -z "$version_diff" ]; then
    if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
      version_diff="$(git diff '@{u}..HEAD' -- $version_files)"
    else
      version_diff="$(git show --format= HEAD -- $version_files)"
    fi
  fi
fi

if printf "%s\n" "$version_diff" | grep -Eq "^\+.*(\"version\"[[:space:]]*:[[:space:]]*\"[0-9]+\.[0-9]+\.[0-9]+\"|appVersion[[:space:]]*=[[:space:]]*'[0-9]+\.[0-9]+\.[0-9]+')"; then
  exit 0
fi

cat >&2 <<'EOF'
Commit blocked: update the version before committing or pushing.

Update at least one semver value in the staged changes:
- package.json "version"
- app/package.json "version"
- app/src/app/app.ts appVersion

Use a major, minor, or patch bump such as 0.1.1, 0.2.0, or 1.0.0.
EOF
exit 1
