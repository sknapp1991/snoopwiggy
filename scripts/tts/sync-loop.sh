#!/usr/bin/env bash
# While the audio batch runs, publish new chapters every 45 minutes (list + upload), then once more at the end.
cd "$(dirname "$0")/../.."
running() { powershell -NoProfile -Command "@(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -like '*tts*batch.py*' -or \$_.CommandLine -like '*align-librivox*' }).Count" | tr -d '\r'; }
while [ "$(running)" != "0" ]; do
  sleep 2700
  npx tsx scripts/tts/catalog.ts > /dev/null && npx tsx scripts/tts/upload.ts < /dev/null | tail -1
  echo "synced $(date '+%H:%M')"
done
npx tsx scripts/tts/catalog.ts > /dev/null && npx tsx scripts/tts/upload.ts < /dev/null | tail -1
echo "final sync $(date '+%H:%M')"
