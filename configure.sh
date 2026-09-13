#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [ -e .env ]; then echo 'Plik .env już istnieje; zachowaj go przy aktualizacji.'; exit 1; fi
umask 077
read -r -p 'Adres strony HTTPS (np. https://help.example.com): ' desk_url
if [[ ! "$desk_url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]]; then echo 'Podaj pełny adres HTTPS bez ścieżki.'; exit 1; fi
printf 'APP_URL=%s\nDESK_STACK_NAME=service-desk\nDESK_CONTAINER_NAME=service-desk\nDESK_DATA_VOLUME=service-desk-data\nDESK_CONTROL_VOLUME=service-desk-control\nDESK_BACKUP_VOLUME=service-desk-backups\nPROXY_NETWORK=nginx-proxy-manager_default\n' "${desk_url%/}" > .env
echo 'Zapisano .env. Uruchom Docker Compose, odczytaj kod z logów i dokończ instalację WWW.'
