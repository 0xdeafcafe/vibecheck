.PHONY: api web test vet build-web dev-web

api:
	go run ./cmd/api

test:
	go test ./...

vet:
	go vet ./...

dev-web:
	cd web && npm run dev

build-web:
	cd web && npm run build
