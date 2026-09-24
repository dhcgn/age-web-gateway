#!/bin/sh
# Rasterize brand SVGs to PNG. Needs rsvg-convert or ImageMagick 7 (magick).
set -eu
cd "$(dirname "$0")"
mkdir -p png

render() { # src width height out
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$2" -h "$3" -o "$4" "$1"
  else
    magick -background none -density 384 "$1" -resize "$2x$3" "$4"
  fi
}

for s in 16 32 48 180 192 512 1024; do render icon.svg "$s" "$s" "png/icon-$s.png"; done
render banner.svg 1280 640 png/banner-1280x640.png
ls png
