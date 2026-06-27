# Caddy reverse proxy for the FI web services (docs 06 §8).
# Sits behind HAProxy on 127.0.0.1:8443; Caddy terminates TLS for api/admin/sub.
# Render with scripts/generate-configs.

{
	# HAProxy forwards raw TLS; Caddy listens on 8443 and gets real SNI.
	auto_https disable_redirects
}

${API_DOMAIN} {
	reverse_proxy 127.0.0.1:8080
}

${ADMIN_DOMAIN} {
	# Admin SPA static build + API proxy.
	handle /admin/* {
		reverse_proxy 127.0.0.1:8080
	}
	handle {
		root * /var/www/admin
		try_files {path} /index.html
		file_server
	}
}

${SUB_DOMAIN} {
	reverse_proxy 127.0.0.1:8082
}
