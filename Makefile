.PHONY: build clean test

DIST_DIR ?= dist

SERVICES = ./services/auth ./services/core ./services/gateway ./services/pool ./services/push ./services/recorder ./services/bgrd ./services/hawkeyes

build:
	@mkdir -p $(DIST_DIR)
	go build -o $(DIST_DIR)/ $(SERVICES)

clean:
	rm -rf $(DIST_DIR)

test:
	go test ./...
