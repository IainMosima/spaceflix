#!/bin/sh
# Spaceflix on a Mac or Linux:  ./spaceflix.sh [start|stop|logs]
# start (default): gets the latest version, starts it, opens the browser.
cd "$(dirname "$0")" || exit 1

case "$(uname -s)" in
  Darwin) IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); MOVIES="$HOME/Movies" ;;
  *) IP=$(hostname -I 2>/dev/null | awk '{print $1}'); MOVIES="$HOME/Videos" ;;
esac
[ -d "$MOVIES" ] || MOVIES="$HOME/Downloads"
DEF="$MOVIES/Spaceflix"
# The folder picked in Settings, else this system's movie folder. Override: DATA=/path ./spaceflix.sh
DATA=${DATA:-$(cat "$HOME/.spaceflix/data-dir" 2>/dev/null || echo "$DEF")}
export HOST_LAN_IP="$IP" MEDIA_ROOT="$DATA" HOST_DATA_DIR="$DATA" HOST_HOME="$HOME"
# Linux: files written into the movies folder belong to you, not root.
[ "$(uname -s)" = Linux ] && export SPACEFLIX_UID="$(id -u)" SPACEFLIX_GID="$(id -g)"
AWAKE_PID="$HOME/.spaceflix/caffeinate.pid"

docker_up() {
  command -v docker >/dev/null || { echo "Install Docker Desktop first: https://docs.docker.com/get-docker/"; exit 1; }
  docker info >/dev/null 2>&1 && return
  echo "Starting Docker…"
  open -a Docker 2>/dev/null || sudo systemctl start docker 2>/dev/null || true
  i=0
  until docker info >/dev/null 2>&1; do
    i=$((i + 1)); [ $i -gt 60 ] && { echo "Docker didn't start. Open Docker Desktop and try again."; exit 1; }
    sleep 2
  done
}

case "${1:-start}" in
  start)
    docker_up
    mkdir -p "$DATA" "$HOME/.spaceflix"
    echo "Getting the latest Spaceflix…"
    docker compose pull || echo "Couldn't check for updates (offline?). Using the version you have."
    docker compose up -d || exit 1
    docker image prune -f >/dev/null 2>&1 # drop the old version's leftovers
    # Mac: stay awake while it runs (plugged in, lid closed too), like `make run`.
    if command -v caffeinate >/dev/null && ! kill -0 "$(cat "$AWAKE_PID" 2>/dev/null)" 2>/dev/null; then
      nohup caffeinate -s >/dev/null 2>&1 & echo $! > "$AWAKE_PID"
    fi
    echo
    echo "Spaceflix is running:  http://localhost:8181"
    [ -n "$IP" ] && echo "Phone / TV:            http://$IP:8181"
    echo "Movies are kept in:    $DATA"
    (open http://localhost:8181 || xdg-open http://localhost:8181) >/dev/null 2>&1 &
    ;;
  stop)
    docker compose stop
    kill "$(cat "$AWAKE_PID" 2>/dev/null)" 2>/dev/null; rm -f "$AWAKE_PID"
    echo "Spaceflix stopped."
    ;;
  logs) docker compose logs -f --tail 50 ;;
  *) echo "Usage: $0 [start|stop|logs]"; exit 1 ;;
esac
