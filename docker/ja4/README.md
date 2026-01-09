# JA3 Enabled Nginx Proxy Manager Image

This directory contains the Dockerfile for building an NPM image with TLS fingerprinting support using the [phuslu/nginx-ssl-fingerprint](https://github.com/phuslu/nginx-ssl-fingerprint) module.

> **Note**: This image currently provides JA3 fingerprinting. JA4 support may be added in future versions of the nginx-ssl-fingerprint module.

## Features

This custom image provides the following nginx variables for TLS fingerprinting:

| Variable | Description |
|----------|-------------|
| `$http_ssl_ja3` | Full JA3 fingerprint string |
| `$http_ssl_ja3_hash` | MD5 hash of JA3 fingerprint (32 hex chars) |
| `$http2_fingerprint` | HTTP/2 fingerprint |
| `$http_ssl_greased` | GREASE detection (1 if GREASE values present, 0 otherwise) |
| `$stream_ssl_ja3` | JA3 fingerprint for stream module |
| `$stream_ssl_ja3_hash` | JA3 hash for stream module |

## Building

```bash
cd docker/ja4
docker build -t npm-ja3:latest .
```

The build process:
1. Patches OpenSSL 3.3 with JA3 extensions
2. Patches nginx 1.27 with SSL fingerprint hooks
3. Compiles nginx with the `nginx-ssl-fingerprint` module
4. Copies the patched binary into the standard NPM base image

## Usage

### Option 1: Add JA3 to Log Format

Create or edit `/data/nginx/custom/http_top.conf`:

```nginx
# JA3-enhanced log format
log_format proxy_ja3 '[$time_local] $upstream_cache_status $upstream_status $status - '
    '$request_method $scheme $host "$request_uri" '
    '[Client $remote_addr] [JA3 $http_ssl_ja3_hash] '
    '[SSL $ssl_protocol/$ssl_cipher] "$http_user_agent"';
```

Then reference it in your proxy host's Advanced Config:

```nginx
access_log /data/logs/proxy-host-1_access.log proxy_ja3;
```

### Option 2: Forward JA3 to Upstream

In your proxy host's Advanced Config field:

```nginx
# Send JA3 hash to backend application
proxy_set_header X-JA3-Hash $http_ssl_ja3_hash;
proxy_set_header X-JA3-Fingerprint $http_ssl_ja3;
proxy_set_header X-TLS-Greased $http_ssl_greased;
```

Your backend application can then use these headers for:
- Bot detection
- Client fingerprinting
- Security analytics
- Fraud prevention

### Option 3: Block Known Bad Fingerprints

Create `/data/nginx/custom/http_top.conf`:

```nginx
# Map known malicious JA3 hashes to block
map $http_ssl_ja3_hash $block_ja3 {
    default 0;
    "e7d705a3286e19ea42f587b344ee6865" 1;  # Known malware
    "6734f37431670b3ab4292b8f60f29984" 1;  # Known bot
}
```

Then in proxy host Advanced Config:

```nginx
if ($block_ja3) {
    return 403;
}
```

## What is JA3?

JA3 is a method for creating TLS client fingerprints. It was developed by Salesforce and creates a hash based on:

- TLS Version
- Cipher Suites
- Extensions
- Elliptic Curves
- Elliptic Curve Point Formats

This fingerprint can identify specific TLS clients regardless of IP address, helping detect:
- Malware command & control traffic
- Automated bots and scrapers
- TLS proxy/interception tools
- Known attack tools

## Important Notes

- **Experimental**: This is a community-contributed image variant
- **Image Size**: Larger than standard NPM due to custom OpenSSL
- **Updates Required**: May need rebuilding when nginx/OpenSSL versions change
- **Non-HTTPS Traffic**: JA3 variables will be empty for non-TLS connections
- **Performance**: Minimal overhead - fingerprint extraction happens during TLS handshake

## Troubleshooting

### JA3 hash is empty

- Ensure traffic is coming over HTTPS (TLS)
- Check that the nginx binary was properly replaced: `nginx -V 2>&1`
- Verify the OpenSSL library is loaded: `ldd /usr/sbin/nginx | grep openssl`

### Nginx fails to start

Check for library loading issues:
```bash
docker exec <container> ldd /usr/sbin/nginx
docker exec <container> nginx -t
```

### Building fails

Ensure you have enough disk space (~2GB for build) and memory (~2GB RAM).

## Resources

- [JA3 - A Method for Profiling SSL/TLS Clients](https://github.com/salesforce/ja3)
- [nginx-ssl-fingerprint module](https://github.com/phuslu/nginx-ssl-fingerprint)
- [JA3er.com - JA3 Fingerprint Database](https://ja3er.com/)
