.PHONY: tsc
tsc:
	tsc

.PHONY: install
install:
	sudo cp ./built/cgi-node.js /usr/lib/cgi-bin/
	sudo chown root:root /usr/lib/cgi-bin/*.js
	sudo chmod 0755 /usr/lib/cgi-bin/*.js
	sudo mkdir -p /var/www/cgi-node/sessions
	sudo chown -R www-data:www-data /var/www/cgi-node/sessions

.PHONY: clean
clean:
	sudo rm -rf /var/www/cgi-node/sessions
