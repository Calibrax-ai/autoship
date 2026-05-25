SHELL := /bin/bash

PORT ?= 8787
RUN_ID ?=

.PHONY: help dev trigger proxy up up-all monitor watch stop stop-all restart restart-all status watch-status health tunnel-url logs logs-server logs-trigger logs-proxy clear-trigger inspect-run recent-runs check

help:
	@echo "autoship-runner dev helpers"
	@echo ""
	@echo "  make dev              Run webhook server in foreground"
	@echo "  make trigger          Run Trigger.dev worker in foreground"
	@echo "  make proxy            Run Cloudflare proxy in foreground"
	@echo "  make up               Start server + Trigger worker in background logs"
	@echo "  make up-all           Start server + Trigger worker + Cloudflare proxy"
	@echo "  make monitor          Stream live logs for already-running services"
	@echo "  make watch            Alias for restart-all"
	@echo "  make stop             Stop local server + Trigger worker"
	@echo "  make stop-all         Stop server + Trigger worker + Cloudflare proxy"
	@echo "  make restart          Stop, clear Trigger cache, start background services"
	@echo "  make restart-all      Start all services, print webhook URL, monitor; Ctrl-C stops all"
	@echo "  make status           Show server/worker/tunnel processes"
	@echo "  make watch-status     Refresh status every 3 seconds"
	@echo "  make health           Check local webhook server health"
	@echo "  make tunnel-url       Print current Cloudflare tunnel URL from logs"
	@echo "  make logs             Tail server + Trigger + proxy logs"
	@echo "  make clear-trigger    Clear local Trigger.dev cache"
	@echo "  make recent-runs      List recent Trigger runs"
	@echo "  make inspect-run RUN_ID=run_xxx"
	@echo "  make check            Typecheck + tests"

dev:
	npm run dev

trigger:
	npm run dev:trigger

proxy:
	cloudflared tunnel --protocol http2 --url http://localhost:$(PORT)

up:
	@mkdir -p runs .trigger/tmp/store
	@nohup npm run dev > runs/server.log 2>&1 & echo $$! > runs/server.pid
	@nohup npm run dev:trigger > runs/trigger.log 2>&1 & echo $$! > runs/trigger.pid
	@echo "server pid=$$(cat runs/server.pid)"
	@echo "trigger pid=$$(cat runs/trigger.pid)"
	@sleep 3
	@$(MAKE) --no-print-directory status

up-all: up
	@nohup cloudflared tunnel --protocol http2 --url http://localhost:$(PORT) > runs/proxy.log 2>&1 & echo $$! > runs/proxy.pid
	@echo "proxy pid=$$(cat runs/proxy.pid)"
	@echo "Linear webhook URL:"
	@$(MAKE) --no-print-directory tunnel-url || echo "Tunnel URL not ready yet; keep watching runs/proxy.log."

monitor:
	@echo ""
	@echo "autoship-runner is active. Watching server, Trigger worker, and proxy logs."
	@echo "Move a Linear issue to Ready for Autoship, then watch for:"
	@echo "  Linear webhook received"
	@echo "  Trigger.dev run accepted"
	@echo "  Autoship picked up <issue>"
	@echo ""
	@echo "Press Ctrl-C to stop monitoring and kill all local services."
	@echo ""
	@trap 'echo ""; pkill -f "tsx src/server.ts" 2>/dev/null || true; pkill -f "trigger dev" 2>/dev/null || true; pkill -f "cloudflared tunnel --protocol http2 --url http://localhost:$(PORT)" 2>/dev/null || true; rm -f runs/server.pid runs/trigger.pid runs/proxy.pid; echo "stopped all local services"' INT TERM EXIT; \
	tail -n 0 -F runs/server.log runs/trigger.log runs/proxy.log

watch: restart-all

stop:
	@pkill -f 'tsx src/server.ts' 2>/dev/null || true
	@pkill -f 'trigger dev' 2>/dev/null || true
	@rm -f runs/server.pid runs/trigger.pid
	@echo "stopped server + Trigger worker"

stop-all: stop
	@pkill -f 'cloudflared tunnel --protocol http2 --url http://localhost:$(PORT)' 2>/dev/null || true
	@rm -f runs/proxy.pid
	@echo "stopped Cloudflare proxy"

restart: stop clear-trigger up

restart-all: stop-all clear-trigger up-all monitor

status:
	@echo "processes:"
	@pgrep -fl 'tsx src/server.ts|trigger dev|cloudflared' || true
	@echo ""
	@echo "port $(PORT):"
	@lsof -nP -iTCP:$(PORT) -sTCP:LISTEN || true
	@echo ""
	@echo "active Trigger runs:"
	@cat .trigger/active-runs.json 2>/dev/null || true
	@echo ""

watch-status:
	@while true; do clear; date; echo ""; $(MAKE) --no-print-directory status; sleep 3; done

health:
	@curl -fsS "http://localhost:$(PORT)/healthz"
	@echo ""

tunnel-url:
	@url=""; \
	for attempt in $$(seq 1 20); do \
		url=$$(grep -Eo 'https://[^ ]+trycloudflare.com' runs/proxy.log 2>/dev/null | tail -1); \
		if [ -n "$$url" ]; then break; fi; \
		sleep 1; \
	done; \
	if [ -n "$$url" ]; then \
		echo "$$url/webhooks/linear"; \
	else \
		echo "No tunnel URL found yet. Check runs/proxy.log"; \
		exit 1; \
	fi

logs: logs-server logs-trigger logs-proxy

logs-server:
	@tail -120 runs/server.log 2>/dev/null || true

logs-trigger:
	@tail -180 runs/trigger.log 2>/dev/null || true

logs-proxy:
	@tail -120 runs/proxy.log 2>/dev/null || true

clear-trigger:
	@rm -rf .trigger/tmp .trigger/active-runs.json .trigger/dev.lock
	@mkdir -p .trigger/tmp/store
	@echo "cleared local Trigger cache"

recent-runs:
	@npx tsx --eval "import 'dotenv/config'; import { runs } from '@trigger.dev/sdk'; void (async () => { const page = await runs.list({ limit: 10 }); const rows = []; for await (const run of page) rows.push({ id: run.id, status: run.status, version: run.version, createdAt: run.createdAt, updatedAt: run.updatedAt, tags: run.tags }); console.log(JSON.stringify(rows, null, 2)); })().catch((error) => { console.error(error); process.exit(1); });"

inspect-run:
	@if [ -z "$(RUN_ID)" ]; then echo "usage: make inspect-run RUN_ID=run_xxx"; exit 1; fi
	@npx tsx --eval "import 'dotenv/config'; import { runs } from '@trigger.dev/sdk'; void (async () => { const run = await runs.retrieve('$(RUN_ID)'); console.log(JSON.stringify({ id: run.id, status: run.status, version: run.version, taskIdentifier: run.taskIdentifier, createdAt: run.createdAt, updatedAt: run.updatedAt, startedAt: run.startedAt, attemptCount: run.attemptCount, tags: run.tags, idempotencyKey: run.idempotencyKey, payload: run.payload, output: run.output, error: run.error }, null, 2)); })().catch((error) => { console.error(error); process.exit(1); });"

check:
	npm run typecheck
	npm test
