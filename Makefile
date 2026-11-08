.PHONY: init up down logs test build migrate demo demo-reset
init:
	node scripts/local.mjs init
up:
	node scripts/local.mjs up
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
	@node scripts/local.mjs reset --demo $(CONFIRM)
