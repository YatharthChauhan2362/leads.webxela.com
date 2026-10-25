#!/bin/bash
# Zips ../extension into public/ so the app serves it at /yatri-leads-extension.zip.
set -e
cd "$(dirname "$0")/../.."
# On Vercel the extension folder is not uploaded; the committed zip is used as is.
if [ ! -d extension ]; then echo "No extension folder, keeping the committed zip"; exit 0; fi
rm -rf /tmp/yatri-leads-extension && cp -R extension /tmp/yatri-leads-extension
rm -f web/public/yatri-leads-extension.zip
(cd /tmp && zip -qr "$OLDPWD/web/public/yatri-leads-extension.zip" yatri-leads-extension -x "*.DS_Store")
rm -rf /tmp/yatri-leads-extension
echo "Packed web/public/yatri-leads-extension.zip"
