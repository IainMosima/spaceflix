# make run / make stop / make logs, on Mac, Linux or Windows (with make installed).
ifeq ($(OS),Windows_NT)
  SF := powershell -NoProfile -ExecutionPolicy Bypass -File spaceflix.ps1
else
  SF := sh ./spaceflix.sh
endif
.PHONY: run stop logs
run: ; @$(SF) start
stop: ; @$(SF) stop
logs: ; @$(SF) logs
