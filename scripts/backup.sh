#!/bin/sh
set -e

BACKUP_DIR="/data/backups"
mkdir -p $BACKUP_DIR
FILE="$BACKUP_DIR/cctv_db_$(date +%Y%m%d_%H%M%S).sql"

echo "Backing up to $FILE"
# pg_dump $DATABASE_URL > $FILE
echo "Backup script placeholder"
