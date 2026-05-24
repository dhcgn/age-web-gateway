#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v age >/dev/null 2>&1; then
	echo "Error: age command not found in PATH" >&2
	exit 127
fi

echo "Decrypting message..."
if age --decrypt -i id message.age > message.plain.txt; then
	echo "Decrypted message:"
	cat message.plain.txt
	printf '\n'
else
	decrypt_exit_code=$?
	echo "Decryption failed with exit code $decrypt_exit_code" >&2
	exit "$decrypt_exit_code"
fi