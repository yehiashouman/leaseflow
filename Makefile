.PHONY: init up down logs test build migrate demo demo-reset
init:
	cp .env.example .env
	cp api/.env.example api/.env
	@echo "Update secrets in .env and api/.env, then run: make up"
up:
	docker compose up --build -d
down:
	docker compose down
logs:
	docker compose logs -f --tail=200
test:
	npm ci && npm test
build:
	npm ci && npm run build
migrate:
	docker compose run --rm migrate
demo:
	@bash scripts/demo.sh up
demo-reset:
	@bash scripts/demo.sh reset
