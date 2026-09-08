#!/usr/bin/env bash
set -e

USERNAME="admin"
PASSWORD=""
FORCE_CHANGE="true"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -u|--username) USERNAME="$2"; shift ;;
        -p|--password) PASSWORD="$2"; shift ;;
        --no-force-change) FORCE_CHANGE="false" ;;
        -h|--help)
            echo "Usage: ./scripts/reset-admin-password.sh [-u <username>] [-p <password>] [--no-force-change]"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "================================================="
echo " HubSight CCTV - Disaster Recovery Password Reset"
echo "================================================="

CMD_ARGS=("reset-admin-password" "-u" "$USERNAME" "--force-change=$FORCE_CHANGE")
if [ -n "$PASSWORD" ]; then
    CMD_ARGS+=("-p" "$PASSWORD")
fi

if command -v docker >/dev/null 2>&1 && docker compose ps -q auth-service 2>/dev/null | grep -q .; then
    echo "Executing password reset inside active 'auth-service' container..."
    docker compose exec -it auth-service /app/auth "${CMD_ARGS[@]}"
else
    echo "Executing password reset via local Go runtime..."
    go run ./services/auth "${CMD_ARGS[@]}"
fi
