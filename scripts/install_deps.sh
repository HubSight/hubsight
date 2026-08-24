#!/bin/bash
set -e

echo -e "\e[36mInstalling dependencies for HubSight CCTV...\e[0m"

echo -e "\n\e[33m[1/3] Downloading Go modules...\e[0m"
for dir in services/*/; do
    if [ -f "${dir}go.mod" ]; then
        echo "Downloading Go modules for ${dir}..."
        (cd "$dir" && go mod download)
    fi
done

echo -e "\n\e[33m[2/3] Installing Node.js dependencies (pnpm)...\e[0m"
for app in "webapp" "services/relay-service"; do
    if [ -d "$app" ]; then
        echo "Installing Node deps for ${app}..."
        (cd "$app" && pnpm install)
    fi
done

echo -e "\n\e[33m[3/3] Installing Python dependencies (vision-service)...\e[0m"
VISION_DIR="services/vision-service"
if [ -d "$VISION_DIR" ]; then
    (
        cd "$VISION_DIR"
        if [ ! -d ".venv" ]; then
            echo "Creating Python virtual environment..."
            python3 -m venv .venv || python -m venv .venv
        fi
        echo "Installing pip requirements..."
        if [ -f ".venv/bin/activate" ]; then
            source .venv/bin/activate
        elif [ -f ".venv/Scripts/activate" ]; then
            # fallback for windows bash environments
            source .venv/Scripts/activate
        fi
        pip install -r requirements.txt
    )
fi

echo -e "\n\e[32mAll dependencies installed successfully!\e[0m"

