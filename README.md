# CCTV Viewer

A modern, responsive, and robust CCTV storage and viewing platform built with Go, React, and PostgreSQL. It allows you to connect multiple RTSP cameras, record their streams automatically into chunks, and view historical footage through a beautiful and intuitive web interface.

## 🌟 Key Features

*   **Multi-Camera Support:** Dynamically add, edit, or remove IP cameras (RTSP) directly from the Web API without restarting the backend.
*   **Automated Recording Service:** A background Golang worker spawns independent `FFmpeg` processes for each active camera, saving 5-minute `.ts` chunks smoothly without memory leaks.
*   **Modern Web UI (PWA):** A beautifully crafted React frontend utilizing a premium Flat Design, custom seeking controls, and a responsive "YouTube-like" player layout (Sticky on mobile, flexible on desktop).
*   **Interactive Timeline:** A bespoke timeline component for viewing 24-hour historical records, with intuitive seeking by clicking on recorded orange blocks.
*   **Smart Storage Quota:** Built-in PostgreSQL triggers and `pg_cron` jobs automatically prune old recordings when the disk quota or retention days are exceeded.
*   **Secure:** JWT-based authentication to protect your streams and recordings.

## 🛠️ Technology Stack

*   **Backend:** Go (1.23+), Gin (Web Framework), GORM, FFmpeg (Subprocess execution).
*   **Frontend:** React (Vite), TypeScript, Tailwind CSS, `lucide-react`, PWA configuration.
*   **Database:** PostgreSQL.
*   **Deployment:** Docker & Docker Compose ready.

## 🚀 Getting Started

### Prerequisites

*   Go 1.23+
*   Node.js & npm (for Frontend)
*   PostgreSQL Database
*   FFmpeg installed on your machine or container.

### 1. Database Setup

Ensure your PostgreSQL instance is running. You need to enable the `pg_cron` extension for automated storage management:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 2. Backend Configuration

Navigate to the `backend` directory and copy the example environment file:

```bash
cd backend
cp .env.example .env
```

Edit the `.env` file to match your database credentials and secret keys:

```env
DB_URL="postgres://user:password@localhost:5432/cctv?sslmode=disable"
JWT_SECRET="your-super-secret-key"
API_PORT="8080"
STORAGE_ROOT="./recordings"
```

Start the Go backend:
```bash
go run cmd/server/main.go
```

Start the FFMPEG Recording background service:
```bash
go run cmd/recorder/main.go
```

### 3. Frontend Configuration

Navigate to the `frontend` directory and copy the example environment file:

```bash
cd frontend
cp .env.example .env
```

Set the API URL in `.env`:
```env
VITE_API_URL=http://localhost:8080/api
```

Install dependencies and run:
```bash
npm install
npm run dev
```

## 📱 User Interface Highlights

*   **Login & Authentication:** Simple and secure access.
*   **Camera Management:** Add RTSP stream URLs in a visually clean layout.
*   **Archive Viewer:** 
    *   **Desktop:** Sidebar with calendar, and a large flexible video player on the left with bottom timeline controls.
    *   **Mobile:** Video player sticks to the top of the screen (`sticky`), allowing the user to scroll through the timeline and settings without losing sight of the footage.
*   **Flat Design:** Deeply optimized minimal UI without redundant borders or heavy gradients.

## 🐳 Docker Deployment

The project includes Dockerfiles for production deployment.

```bash
docker-compose up -d --build
```
This will spin up the `web` server, the `recorder` service, and the frontend (served statically or via nginx depending on your configuration).

## 📝 License

This project is open-source.
