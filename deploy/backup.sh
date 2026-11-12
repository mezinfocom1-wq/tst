#!/usr/bin/env sh
# Sauvegarde quotidienne de la base et des fichiers envoyés. À planifier avec cron, par exemple :
#   0 3 * * * /chemin/deploy/backup.sh /var/backups/salonat
# Conserve 14 jours. Copier ensuite le dossier vers un stockage distant chiffré.
set -eu
DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
docker compose exec -T db pg_dump -U salon -d salon --format=custom > "$DEST/db-$STAMP.dump"
docker compose exec -T api tar -czf - -C /app uploads > "$DEST/uploads-$STAMP.tar.gz"
find "$DEST" -type f -mtime +14 -delete
echo "Sauvegarde terminée : $DEST/db-$STAMP.dump"
# Restauration : docker compose exec -T db pg_restore -U salon -d salon --clean --if-exists < db-AAAAMMJJ-HHMMSS.dump
