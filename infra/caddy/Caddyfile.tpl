# Caddy reverse proxy for the FI web services (docs 06 §8).
# Sits behind HAProxy on 127.0.0.1:8443; Caddy terminates TLS for api/admin/sub.
# Render with scripts/generate-configs.

{
	# HAProxy forwards raw TLS; Caddy listens on 8443 and gets real SNI.
	auto_https disable_redirects
}

https://${ADMIN_DOMAIN}:8443 {
	# Admin SPA static build + API proxy.
	handle /admin/* {
		reverse_proxy api:8080
	}
	handle /api/* {
		reverse_proxy api:8080
	}
	handle /internal/* {
		reverse_proxy api:8080
	}
	handle /subscription/* {
		reverse_proxy api:8080
	}
	handle /health {
		reverse_proxy api:8080
	}
	handle {
		root * /var/www/admin
		try_files {path} /index.html
		file_server
	}
}

https://${SUB_DOMAIN}:8443 {
	handle /api/* {
		reverse_proxy api:8080
	}
	handle /internal/* {
		reverse_proxy api:8080
	}
	handle /subscription/* {
		reverse_proxy api:8080
	}
	handle /health {
		reverse_proxy api:8080
	}
	handle {
		reverse_proxy sub-page:8082
	}
}
