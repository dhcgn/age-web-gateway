#!/usr/bin/env bash
# Fetch clean Markdown from a public URL via markdown.new (https://markdown.new).
#
# Usage: get-markdown.sh [-m auto|ai|browser] [-i] [-o FILE] URL
#   -m METHOD   conversion method: auto (default), ai, browser (JS-heavy pages)
#   -i          retain image URLs (default: stripped)
#   -o FILE     write to file instead of stdout
set -euo pipefail

method="auto"
retain=""
out=""
while getopts "m:o:i" opt; do
    case "$opt" in
        m) method="$OPTARG" ;;
        o) out="$OPTARG" ;;
        i) retain="true" ;;
        *) echo "Usage: $0 [-m auto|ai|browser] [-i] [-o FILE] URL" >&2; exit 2 ;;
    esac
done
shift $((OPTIND - 1))

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 [-m auto|ai|browser] [-i] [-o FILE] URL" >&2
    exit 2
fi

url="$1"
# URL-encode the target (keep scheme slashes readable for markdown.new path style).
encoded="${url//%/%25}"
encoded="${encoded// /%20}"
encoded="${encoded//\"/%22}"

target="https://markdown.new/${encoded}?method=${method}"
[[ -n "$retain" ]] && target="${target}&retain_images=${retain}"

if [[ -n "$out" ]]; then
    curl -fsSL "$target" -o "$out"
    echo "Written to $out" >&2
else
    curl -fsSL "$target"
fi
