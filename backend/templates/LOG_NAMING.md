# Domain-Based Log File Naming

This document describes the enhanced log file naming scheme that includes domain names for easier identification.

## Overview

Log files now include the primary domain name in the filename, making it much easier to identify which host a log belongs to without needing to cross-reference host IDs.

## Naming Convention

### New Format

```
{host-type}-{id}-{sanitized_domain}_{log_type}.log
```

**Examples:**
```
proxy-host-1-example_com_access.log
proxy-host-1-example_com_error.log
proxy-host-5-api_myapp_io_access.log
redirection-host-2-old_domain_com_access.log
dead-host-3-deprecated_site_org_access.log
```

### Previous Format

```
{host-type}-{id}_{log_type}.log
```

**Examples:**
```
proxy-host-1_access.log
proxy-host-1_error.log
```

## Domain Sanitization

Domain names are sanitized to be filesystem-safe:

| Original Domain | Sanitized Name |
|-----------------|----------------|
| `example.com` | `example_com` |
| `api.myapp.io` | `api_myapp_io` |
| `*.example.com` | `wildcard_example_com` |
| `my-site.co.uk` | `my-site_co_uk` |
| `UPPER.Case.COM` | `upper_case_com` |

### Sanitization Rules

1. Wildcard prefix (`*.`) → `wildcard_`
2. All special characters (except `-`) → `_`
3. Multiple underscores collapsed → single `_`
4. Leading/trailing underscores removed
5. Converted to lowercase
6. Limited to 63 characters (filesystem safety)

## Multiple Domains

When a host has multiple domain names, the **first domain** (alphabetically sorted) is used in the filename.

**Example:**
- Host domains: `zebra.com`, `alpha.com`, `beta.com`
- Log filename: `proxy-host-1-alpha_com_access.log`

This ensures consistent, predictable naming regardless of the order domains were added.

## Host Types

| Host Type | Log Prefix | Default Format |
|-----------|------------|----------------|
| Proxy Host | `proxy-host-` | `proxy` |
| Redirection Host | `redirection-host-` | `standard` |
| Dead Host | `dead-host-` | `standard` |

## Log Location

All logs remain in `/data/logs/`:

```
/data/logs/
├── proxy-host-1-example_com_access.log
├── proxy-host-1-example_com_error.log
├── proxy-host-2-api_mysite_com_access.log
├── proxy-host-2-api_mysite_com_error.log
├── redirection-host-1-old_domain_com_access.log
├── redirection-host-1-old_domain_com_error.log
├── dead-host-1-blocked_site_com_access.log
├── dead-host-1-blocked_site_com_error.log
├── default-host_access.log
├── default-host_error.log
└── fallback_access.log
```

## Logrotate Compatibility

The existing logrotate configuration continues to work without changes:

```
/data/logs/*_access.log {
    # ... rotation settings
}

/data/logs/*_error.log {
    # ... rotation settings
}
```

The glob patterns `*_access.log` and `*_error.log` match both old and new naming schemes.

## Migration

### Existing Logs

- **Old log files are not renamed** - they remain with their original names
- New requests generate logs with the new naming scheme
- Old logs will naturally rotate out over time (default: 4 weeks for access, 10 weeks for error)

### Finding Logs by Domain

```bash
# Find all logs for a specific domain
ls -la /data/logs/ | grep example_com

# Tail access logs for a domain
tail -f /data/logs/*example_com*_access.log

# Search across all logs for a domain
grep -l "pattern" /data/logs/*example_com*.log
```

### Finding Logs by Host ID

The host ID is still included in the filename:

```bash
# Find logs for host ID 5
ls -la /data/logs/ | grep "host-5-"
```

## Technical Implementation

### Liquid Filter

A new `sanitizeForFilename` filter is registered in the template engine:

```javascript
renderEngine.registerFilter("sanitizeForFilename", (domain) => {
    if (!domain || typeof domain !== "string") {
        return "unknown";
    }
    return domain
        .replace(/^\*\./, "wildcard_")
        .replace(/[^a-zA-Z0-9-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase()
        .substring(0, 63);
});
```

### Template Usage

```liquid
{% assign primary_domain = domain_names | first | sanitizeForFilename %}
access_log /data/logs/proxy-host-{{ id }}-{{ primary_domain }}_access.log proxy;
error_log /data/logs/proxy-host-{{ id }}-{{ primary_domain }}_error.log warn;
```

## Affected Files

| File | Change |
|------|--------|
| `backend/lib/utils.js` | Added `sanitizeForFilename` Liquid filter |
| `backend/templates/proxy_host.conf` | Updated log path template |
| `backend/templates/redirection_host.conf` | Updated log path template |
| `backend/templates/dead_host.conf` | Updated log path template |
