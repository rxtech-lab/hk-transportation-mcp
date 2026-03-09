.PHONY: build test run sync clean docker

build:
	go build -o bin/server ./cmd/server
	go build -o bin/sync ./cmd/sync

sync:
	go run ./cmd/sync

test:
	go test ./...

run:
	go run ./cmd/server

docker:
	docker build -t hk-transportation-mcp:latest .
	docker build -f Dockerfile.sync -t hk-transportation-mcp-sync:latest .

deploy:
	kubectl apply -k k8s/

clean:
	rm -rf bin/
