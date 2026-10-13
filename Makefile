NPM  := npm

.PHONY: start pack dist-win dist-mac

start:
	$(NPM) run start

pack:
	$(NPM) run pack

dist-win:
	$(NPM) run dist:win

dist-mac:
	$(NPM) run dist:mac
