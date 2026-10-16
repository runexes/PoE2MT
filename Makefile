NPM  := npm

.PHONY: install start dev build serve lint format format-check test pack dist-win dist-mac

install:
	$(NPM) install

start:
	$(NPM) run start

dev:
	$(NPM) run build:watch

build:
	$(NPM) run build

serve:
	$(NPM) run serve

lint:
	$(NPM) run lint

format:
	$(NPM) run format

format-check:
	$(NPM) run format:check

test:
	$(NPM) test

pack:
	$(NPM) run pack

dist-win:
	$(NPM) run dist:win

dist-mac:
	$(NPM) run dist:mac
