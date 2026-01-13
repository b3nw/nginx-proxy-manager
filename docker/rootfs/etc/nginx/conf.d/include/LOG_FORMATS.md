# Enhanced Nginx Log Formats

This document describes the enhanced log formats available in Nginx Proxy Manager.

## Overview

NPM provides four log formats with full SSL/TLS visibility:

| Format | Type | Use Case |
|--------|------|----------|
| `proxy` | Text | Proxy hosts (default) - detailed with upstream info |
| `standard` | Text | Redirections, dead hosts - simplified |
| `proxy_json` | JSON | Proxy hosts - for log aggregators |
| `standard_json` | JSON | Redirections, dead hosts - for log aggregators |

## Text Formats

### `proxy` Format

Used by default for proxy hosts. Includes upstream performance data.

```
[$time_local] $upstream_cache_status $upstream_status $status - $request_method $scheme $host "$request_uri" [Client $remote_addr] [Length $body_bytes_sent] [Gzip $gzip_ratio] [Sent-to $server] [SSL $ssl_protocol/$ssl_cipher] "$http_user_agent" "$http_referer"
```

**Example output:**
```
[10/Jan/2026:10:30:45 +0000] - 200 200 - GET https example.com "/" [Client 192.168.1.100] [Length 15234] [Gzip 2.50] [Sent-to 10.0.0.5] [SSL TLSv1.3/TLS_AES_256_GCM_SHA384] "Mozilla/5.0..." "-"
```

### `standard` Format

Used by redirections and dead hosts. Simpler format without upstream details.

```
[$time_local] $status - $request_method $scheme $host "$request_uri" [Client $remote_addr] [Length $body_bytes_sent] [Gzip $gzip_ratio] [SSL $ssl_protocol/$ssl_cipher] "$http_user_agent" "$http_referer"
```

## JSON Formats

JSON formats are ideal for log aggregation systems like:
- Elasticsearch / ELK Stack
- Grafana Loki
- Splunk
- Datadog
- AWS CloudWatch

### `proxy_json` Format

Full JSON format with all proxy-related fields:

```json
{
  "time": "2026-01-10T10:30:45+00:00",
  "remote_addr": "192.168.1.100",
  "remote_user": "-",
  "request_method": "GET",
  "request_uri": "/api/users",
  "status": 200,
  "body_bytes_sent": 1523,
  "request_time": 0.045,
  "upstream_response_time": "0.043",
  "upstream_status": "200",
  "upstream_cache_status": "MISS",
  "http_referer": "-",
  "http_user_agent": "Mozilla/5.0...",
  "http_host": "example.com",
  "server_name": "example.com",
  "scheme": "https",
  "ssl_protocol": "TLSv1.3",
  "ssl_cipher": "TLS_AES_256_GCM_SHA384",
  "ssl_session_id": "abc123...",
  "gzip_ratio": "2.50",
  "server": "10.0.0.5"
}
```

> **Note:** The `upstream_response_time` and `upstream_status` fields are strings because they may contain multiple comma-separated values if a request is passed to more than one upstream server.

### `standard_json` Format

Simplified JSON format for redirections and dead hosts:

```json
{
  "time": "2026-01-10T10:30:45+00:00",
  "remote_addr": "192.168.1.100",
  "request_method": "GET",
  "request_uri": "/old-path",
  "status": 301,
  "body_bytes_sent": 0,
  "request_time": 0.001,
  "http_referer": "-",
  "http_user_agent": "Mozilla/5.0...",
  "http_host": "example.com",
  "server_name": "example.com",
  "scheme": "https",
  "ssl_protocol": "TLSv1.3",
  "ssl_cipher": "TLS_AES_256_GCM_SHA384",
  "gzip_ratio": "-"
}
```

## SSL/TLS Variables

All formats now include SSL/TLS information:

| Variable | Description | Example |
|----------|-------------|---------|
| `$ssl_protocol` | TLS version | `TLSv1.3` |
| `$ssl_cipher` | Cipher suite | `TLS_AES_256_GCM_SHA384` |
| `$ssl_session_id` | Session ID (proxy_json only) | `abc123...` |

**Note:** These variables output `-` for non-HTTPS connections.

## Using JSON Formats

To use JSON formats, modify the access_log directive in your host's Advanced Config:

```nginx
access_log /data/logs/proxy-host-1_access.log proxy_json;
```

Or create a custom include file at `/data/nginx/custom/http.conf`:

```nginx
# Override default log format for all hosts
access_log /data/logs/combined_access.log proxy_json;
```

## Parsing JSON Logs

### With jq

```bash
# Pretty print
cat access.log | jq .

# Filter by status code
cat access.log | jq 'select(.status >= 400)'

# Extract specific fields
cat access.log | jq '{time, status, request_uri, ssl_protocol}'
```

### With Loki/Promtail

```yaml
scrape_configs:
  - job_name: npm
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx-proxy-manager
          __path__: /data/logs/*_access.log
    pipeline_stages:
      - json:
          expressions:
            status: status
            method: request_method
            uri: request_uri
            ssl: ssl_protocol
```

### With Filebeat (ELK)

```yaml
filebeat.inputs:
  - type: log
    paths:
      - /data/logs/*_access.log
    json.keys_under_root: true
    json.add_error_key: true
```

## Backwards Compatibility

- Existing `proxy` and `standard` formats continue to work
- Only change: SSL info appended (`[SSL protocol/cipher]`)
- JSON formats are additive - opt-in only
