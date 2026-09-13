#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
read -r -p 'E-mail konta do odzyskania: ' desk_email
read -r -s -p 'Nowe hasło tymczasowe (minimum 12 znaków): ' desk_password
printf '\n'
read -r -s -p 'Powtórz hasło: ' desk_repeat
printf '\n'
if [[ "$desk_password" != "$desk_repeat" ]]; then
  echo 'Hasła różnią się.'
  exit 1
fi
printf '%s\n%s\n' "$desk_email" "$desk_password" | docker compose exec -T desk node scripts/reset-password.mjs
unset desk_password desk_repeat
