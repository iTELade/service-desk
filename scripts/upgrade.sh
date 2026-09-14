#!/usr/bin/env bash
# Run from the extracted NEW full package, not from the live installation.
set -Eeuo pipefail
umask 077
desk_source=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
desk_live=$(realpath -- "${1:-/opt/itelade-desk}")
[ "$desk_source" != "$desk_live" ] || { echo 'Rozpakuj pełną nową paczkę w osobnym katalogu i uruchom jej scripts/upgrade.sh.'; exit 1; }
[ "$(id -u)" = 0 ] || { echo 'Uruchom jako root (kopie zachowują właściciela plików).'; exit 1; }
[ -f "$desk_live/.env" ] && [ -f "$desk_live/compose.yaml" ] || { echo 'Nie znaleziono istniejącej instalacji z .env i compose.yaml.'; exit 1; }
for desk_cmd in docker tar sha256sum flock; do command -v "$desk_cmd" >/dev/null; done
exec 9>"$desk_live/.upgrade.lock"
flock -n 9 || { echo 'Inna aktualizacja już trwa.'; exit 1; }
(cd "$desk_source" && sha256sum -c MANIFEST.sha256 >/dev/null)
cd -- "$desk_live"
desk_id=$(docker compose ps -a -q desk)
[ -n "$desk_id" ] || { echo 'Brak kontenera desk. Ten skrypt służy do aktualizacji istniejącej instalacji.'; exit 1; }
desk_name=$(docker inspect --format '{{.Name}}' "$desk_id"); desk_name=${desk_name#/}
desk_image=$(docker inspect --format '{{.Image}}' "$desk_id")
desk_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$desk_id")
[ -n "$desk_volume" ] || { echo 'Wymagany nazwany wolumen /app/data. Przy bind mount wykonaj migrację ręczną.'; exit 1; }
desk_stamp=$(date -u +%Y%m%dT%H%M%SZ)
desk_backup="$desk_live/backups/before-0.7.0-$desk_stamp"
mkdir -p "$desk_backup"
printf '%s\n' "$desk_image" > "$desk_backup/image-id.txt"
printf '%s\n' "$desk_volume" > "$desk_backup/volume.txt"
docker tag "$desk_image" "service-desk:rollback-$desk_stamp"
tar --exclude='./backups' --exclude='./node_modules' --exclude='./data' --exclude='./.git' --exclude='./.upgrade.lock' -czf "$desk_backup/code.tar.gz" .
# Build first; the existing container remains untouched if building fails.
echo 'Buduję 0.7.0 przy zachowaniu obecnego kontenera.'
docker build -t service-desk:0.7.0 "$desk_source"
docker run --rm --network none --entrypoint node service-desk:0.7.0 -e 'import("./lib/version.mjs").then(x=>{if(x.VERSION!=="0.7.0")process.exit(1)})'
desk_rollback=0
desk_data_ready=0
desk_updater_was_running=0
if docker inspect "$desk_name-updater" >/dev/null 2>&1; then
  if [ "$(docker inspect --format '{{.State.Running}}' "$desk_name-updater")" = true ]; then desk_updater_was_running=1; docker stop "$desk_name-updater" >/dev/null; fi
fi
if docker cp "$desk_id:/app/control/maintenance.json" "$desk_backup/active-maintenance.json" >/dev/null 2>&1; then
  echo 'Trwa aktualizacja lub odzyskiwanie z panelu. Dokończ je przed aktualizacją ręczną.'
  if [ "$desk_updater_was_running" = 1 ]; then docker start "$desk_name-updater" >/dev/null; fi
  exit 1
fi
rollback() {
  desk_rc=$?
  trap - ERR INT TERM
  if [ "$desk_rollback" = 1 ]; then
    set +e
    echo "Aktualizacja nie powiodła się. Przywracam obraz i dane z $desk_backup"
    docker stop "$desk_name" >/dev/null 2>&1
    if [ "$desk_data_ready" = 1 ]; then
      docker run --rm --user 0 --network none --entrypoint node -v "$desk_volume:/app/data" -v "$desk_backup/data:/backup:ro" "$desk_image" -e '
        const fs=require("fs"),p=require("path");
        for(const n of fs.readdirSync("/app/data"))fs.rmSync(p.join("/app/data",n),{recursive:true,force:true});
        function cp(a,b){const s=fs.statSync(a);if(s.isDirectory()){fs.mkdirSync(b,{recursive:true});for(const n of fs.readdirSync(a))cp(p.join(a,n),p.join(b,n));}else fs.copyFileSync(a,b);fs.chmodSync(b,s.mode&511);fs.chownSync(b,s.uid,s.gid);}for(const n of fs.readdirSync("/backup"))cp(p.join("/backup",n),p.join("/app/data",n));'
      if [ "$?" != 0 ]; then echo "PRZERWANO: nie udało się odtworzyć danych. Nie uruchamiaj kontenera; kopia: $desk_backup/data"; exit 1; fi
    fi
    tar -xzf "$desk_backup/code.tar.gz" -C "$desk_live"
    printf 'services:\n  desk:\n    image: "%s"\n' "$desk_image" > "$desk_backup/rollback.yaml"
    docker compose -f compose.yaml -f "$desk_backup/rollback.yaml" up -d --no-build --no-deps desk
    echo "Przywrócono konfigurację i zlecono uruchomienie poprzedniego obrazu. Sprawdź docker compose ps i logi. Kopia: $desk_backup"
  fi
  exit "${desk_rc:-1}"
}
trap rollback ERR INT TERM
desk_rollback=1
echo 'Zatrzymuję aplikację do końcowej kopii danych.'
if [ "$(docker inspect --format '{{.State.Running}}' "$desk_id")" = true ]; then docker stop -t 35 "$desk_id" >/dev/null; fi
mkdir -p "$desk_backup/data"
docker cp -a "$desk_id:/app/data/." "$desk_backup/data/"
# Integrity check uses a read-only copy; it does not start the new application or migrate data.
docker run --rm --network none --user 0 --entrypoint node -v "$desk_backup/data:/backup" service-desk:0.7.0 -e 'const {DatabaseSync}=require("node:sqlite"),fs=require("fs");const d=new DatabaseSync("/backup/desk.sqlite");if(d.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")throw Error("Kopia uszkodzona");const v=d.prepare("PRAGMA user_version").get().user_version;if(![4,5,6,7].includes(v))throw Error("Wymagany schemat 4, 5, 6 lub 7");d.close();if(fs.readFileSync("/backup/master.key").length!==32)throw Error("Nieprawidłowy master.key")'
desk_data_ready=1
# Overlay application files. .env, data and previous backups are not in the package.
(cd "$desk_source" && tar --exclude='./node_modules' --exclude='./.env' --exclude='./data' --exclude='./backups' --exclude='./.git' -cf - .) | tar -xf - -C "$desk_live"
# Preserve actual names even if compose.yaml previously described a different version.
for desk_setting in "DESK_CONTAINER_NAME=$desk_name" "DESK_DATA_VOLUME=$desk_volume"; do
  desk_key=${desk_setting%%=*}
  if ! grep -q "^${desk_key}=" .env; then printf '\n%s\n' "$desk_setting" >> .env; fi
done
docker tag service-desk:0.7.0 service-desk:current
docker compose config --quiet
docker compose up -d --no-build --no-deps desk
desk_ok=0
for ((desk_try=0;desk_try<60;desk_try++)); do
  if docker exec "$desk_name" node -e 'fetch("http://127.0.0.1:3000/healthz",{signal:AbortSignal.timeout(3000)}).then(async r=>{const x=await r.json();if(!r.ok||x.version!=="0.7.0"||x.schema!==7)process.exit(1)}).catch(()=>process.exit(1))' >/dev/null 2>&1; then desk_ok=1; break; fi
  sleep 2
done
[ "$desk_ok" = 1 ]
desk_rollback=0
trap - ERR INT TERM
printf '\nAktualizacja do 0.7.0 zakończona. Kopia: %s\n' "$desk_backup"
if [ "$desk_updater_was_running" = 1 ]; then echo 'Aktualizator pozostaje zatrzymany. Po weryfikacji uruchom: docker compose --profile updates up -d --build updater'; fi
docker compose ps
