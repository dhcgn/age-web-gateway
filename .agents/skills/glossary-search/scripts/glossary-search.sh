#!/usr/bin/env bash
# glossary-search — find generated-glossary key definitions and usages.
#
# Usage:
#   glossary-search.sh defs [--prefix PREFIX] [PATH] [-- <extra rg args>]
#   glossary-search.sh refs [--prefix PREFIX] [PATH] [-- <extra rg args>]
#   glossary-search.sh usages KEY [--prefix PREFIX] [PATH] [-- <extra rg args>]
#   glossary-search.sh keys [--prefix PREFIX] [PATH] [-- <extra rg args>]
#
# Deps: rg preferred, git grep fallback. Extra args after -- pass through
# to the search tool (e.g. -- -g '*.go' to narrow file types).
set -u

PREFIX="jl:"
EXTRA=()

usage() {
	cat >&2 <<'EOF'
usage:
  glossary-search.sh defs [--prefix PREFIX] [PATH] [-- <extra rg args>]
  glossary-search.sh refs [--prefix PREFIX] [PATH] [-- <extra rg args>]
  glossary-search.sh usages KEY [--prefix PREFIX] [PATH] [-- <extra rg args>]
  glossary-search.sh keys [--prefix PREFIX] [PATH] [-- <extra rg args>]
EOF
	exit 2
}

# Escape a literal string for ERE.
regex_escape() {
	printf '%s' "$1" | sed -e 's/[][\\.^$*+?{}()|]/\\&/g'
}

MODE="${1:-}"
[ -n "$MODE" ] || usage
shift || usage
case "$MODE" in
defs | refs | usages | keys) ;;
*) usage ;;
esac

KEY=""
if [ "$MODE" = "usages" ]; then
	KEY="${1:-}"
	[ -n "$KEY" ] || usage
	shift || usage
fi

ROOT="."
while [ $# -gt 0 ]; do
	case "$1" in
	--prefix)
		PREFIX="${2:-}"
		[ -n "$PREFIX" ] || usage
		shift 2 || usage
		;;
	--)
		shift
		EXTRA=("$@")
		break
		;;
	-*)
		echo "glossary-search: unknown flag $1" >&2
		usage
		;;
	*)
		ROOT="$1"
		shift
		;;
	esac
done

PESC="$(regex_escape "$PREFIX")"
SEG='[a-z0-9]+(-[a-z0-9]+)*'
KEYPAT="${PESC}${SEG}(\\.${SEG})+"
# TOKPAT lists key-like tokens (a dot is required, so bare "Key"/"Description"
# block markers and "..." ellipses never match).
TOKPAT="${PESC}[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+"

if command -v rg >/dev/null 2>&1; then
	EXCLUDES=(-g '!*_test.go' -g '!*.test.ts' -g '!*.spec.ts' -g '!GLOSSARY.md' -g '!node_modules/**' -g '!frontend/bindings/**')
	case "$MODE" in
	defs)
		exec rg -N --no-heading "${EXCLUDES[@]}" -e "${KEYPAT}[[:space:]]*=" -e "${PESC}Key:" "${EXTRA[@]}" -- "$ROOT"
		;;
	refs)
		exec rg -N --no-heading "${EXCLUDES[@]}" -e "ref:${PESC}[A-Za-z0-9.~-]+" "${EXTRA[@]}" -- "$ROOT"
		;;
	usages)
		exec rg -N --no-heading -e "$(regex_escape "$KEY")" "${EXTRA[@]}" -- "$ROOT"
		;;
	keys)
		exec rg -N --no-heading -o -e "$TOKPAT" "${EXTRA[@]}" -- "$ROOT" | sort -u
		;;
	esac
elif command -v git >/dev/null 2>&1; then
	echo "glossary-search: rg not found, falling back to git grep" >&2
	case "$MODE" in
	defs)
		exec git -C "$ROOT" grep -n -I -E -e "${KEYPAT}[[:space:]]*=" -e "${PESC}Key:" -- . ':!*_test.go' ':!GLOSSARY.md' "${EXTRA[@]}"
		;;
	refs)
		exec git -C "$ROOT" grep -n -I -E -e "ref:${PESC}[A-Za-z0-9.~-]+" -- . ':!*_test.go' ':!GLOSSARY.md' "${EXTRA[@]}"
		;;
	usages)
		exec git -C "$ROOT" grep -n -I -F -e "$KEY" -- . "${EXTRA[@]}"
		;;
	keys)
		exec git -C "$ROOT" grep -n -I -o -E -e "$TOKPAT" -- . "${EXTRA[@]}" | sed 's/^.*://' | sort -u
		;;
	esac
else
	echo "glossary-search: need rg or git on PATH" >&2
	exit 1
fi
