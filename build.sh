#!/bin/sh
# Copies only the files Pose Studio needs from a local clone of AHEKOT/ComfyUI_VNCCS_Utils (MIT) into ./extensions/
set -e
SRC="${1:-/workspace/ComfyUI_VNCCS_Utils}/web"
DST="$(dirname "$0")/extensions/ComfyUI_VNCCS_Utils"
rm -rf "$DST"; mkdir -p "$DST/vendor" "$DST/shared" "$DST/camera_control"
cp "$SRC/vnccs_pose_studio.js" "$DST/"
cp -r "$SRC/pose_studio" "$DST/pose_studio"
cp -r "$SRC/vendor/three" "$DST/vendor/three"
cp "$SRC/shared/custom_select.mjs" "$DST/shared/"
cp "$SRC/camera_control/utils.mjs" "$DST/camera_control/"
cp "$(dirname "$SRC")/LICENSE" "$(dirname "$0")/LICENSE.VNCCS-MIT"
# list of files for the offline cache (service worker)
cd "$(dirname "$0")"
( echo '['; find index.html icon.svg manifest.webmanifest scripts extensions -type f | sort | sed 's/.*/  "&",/' ; echo '  "./"'; echo ']' ) > files.json
