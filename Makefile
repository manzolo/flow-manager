# Flow Manager: comandi rapidi.  make help
.PHONY: help up down logs demo test run-local health

PORT ?= 8000

help: ## Questo aiuto
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'

demo: ## Copia gli esempi in flows/ (non sovrascrive)
	@mkdir -p flows && for f in examples/*.yaml; do [ -e flows/$$(basename $$f) ] || cp $$f flows/; done; ls flows

up: ## Build e avvio con docker compose (http://localhost:$(PORT))
	@[ -f .env ] || { cp .env.example .env; echo "creato .env da .env.example: imposta ADMIN_PASSWORD"; }
	docker compose up -d --build
	@echo "-> http://localhost:$(PORT)"

down: ## Ferma e rimuove il container
	docker compose down

logs: ## Log del container
	docker compose logs -f

health: ## Prova /health
	@curl -fs http://localhost:$(PORT)/health && echo

run-local: ## Senza Docker, in un venv (http://localhost:5000)
	python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python app.py

test: ## Test (pytest)
	python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python -m pytest -q tests
