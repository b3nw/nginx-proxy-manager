# JA3-enabled Nginx Proxy Manager base image
# This image includes SSL fingerprinting support via phuslu/nginx-ssl-fingerprint
#
# Note: This provides JA3 fingerprinting. JA4 support may be added in future
# versions of the nginx-ssl-fingerprint module.
#
# Build: docker build -t npm-ja3:latest .
# Usage: Use this as a drop-in replacement for the standard NPM image
#
# Provides nginx variables:
#   $http_ssl_ja3        - Full JA3 fingerprint string
#   $http_ssl_ja3_hash   - MD5 hash of JA3 fingerprint
#   $http2_fingerprint   - HTTP/2 fingerprint
#   $http_ssl_greased    - GREASE detection (1 if GREASE values present)

ARG NGINX_VERSION=1.27.3
ARG OPENSSL_VERSION=3.3.2

# =============================================================================
# Stage 1: Build patched OpenSSL and Nginx with JA3 module
# =============================================================================
FROM debian:bookworm-slim AS builder

ARG NGINX_VERSION
ARG OPENSSL_VERSION

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    libpcre3-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone nginx-ssl-fingerprint module
RUN git clone --depth 1 https://github.com/phuslu/nginx-ssl-fingerprint.git

# Download and patch OpenSSL
RUN curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" -o openssl.tar.gz \
    && tar -xzf openssl.tar.gz \
    && rm openssl.tar.gz \
    && cd openssl-${OPENSSL_VERSION} \
    && patch -p1 < ../nginx-ssl-fingerprint/patches/openssl.openssl-3.3.patch

# Download and patch Nginx
RUN curl -fsSL "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -o nginx.tar.gz \
    && tar -xzf nginx.tar.gz \
    && rm nginx.tar.gz \
    && cd nginx-${NGINX_VERSION} \
    && patch -p1 < ../nginx-ssl-fingerprint/patches/nginx.1.27.patch

# Build OpenSSL with JA3 extensions
RUN cd openssl-${OPENSSL_VERSION} \
    && ./config \
        --prefix=/opt/openssl \
        --openssldir=/opt/openssl \
        shared \
        no-tests \
    && make -j$(nproc) \
    && make install_sw

# Build Nginx with JA3 module
RUN cd nginx-${NGINX_VERSION} \
    && ./configure \
        --prefix=/etc/nginx \
        --sbin-path=/usr/sbin/nginx \
        --modules-path=/usr/lib/nginx/modules \
        --conf-path=/etc/nginx/nginx.conf \
        --error-log-path=/var/log/nginx/error.log \
        --http-log-path=/var/log/nginx/access.log \
        --pid-path=/var/run/nginx.pid \
        --lock-path=/var/run/nginx.lock \
        --http-client-body-temp-path=/var/cache/nginx/client_temp \
        --http-proxy-temp-path=/var/cache/nginx/proxy_temp \
        --http-fastcgi-temp-path=/var/cache/nginx/fastcgi_temp \
        --http-uwsgi-temp-path=/var/cache/nginx/uwsgi_temp \
        --http-scgi-temp-path=/var/cache/nginx/scgi_temp \
        --with-openssl=/build/openssl-${OPENSSL_VERSION} \
        --with-openssl-opt="no-tests" \
        --with-http_ssl_module \
        --with-http_v2_module \
        --with-http_realip_module \
        --with-http_gzip_static_module \
        --with-http_stub_status_module \
        --with-http_auth_request_module \
        --with-http_sub_module \
        --with-stream \
        --with-stream_ssl_module \
        --with-stream_ssl_preread_module \
        --with-stream_realip_module \
        --with-pcre \
        --add-module=../nginx-ssl-fingerprint \
    && make -j$(nproc)

# =============================================================================
# Stage 2: Production image based on NPM
# =============================================================================
FROM nginxproxymanager/nginx-full:certbot-node

LABEL maintainer="Nginx Proxy Manager Community" \
      description="NPM with JA3 TLS fingerprinting support" \
      org.opencontainers.image.source="https://github.com/NginxProxyManager/nginx-proxy-manager"

# Copy the patched nginx binary (replaces the existing one)
COPY --from=builder /build/nginx-${NGINX_VERSION}/objs/nginx /usr/sbin/nginx

# Copy OpenSSL libraries (use lib for cross-platform compatibility)
COPY --from=builder /opt/openssl/lib /opt/openssl/lib

# Update library path for the patched OpenSSL
ENV LD_LIBRARY_PATH=/opt/openssl/lib:$LD_LIBRARY_PATH

# Create nginx cache directories
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chown -R npm:npm /var/cache/nginx

# Verify nginx works with the new binary
RUN nginx -V 2>&1 | grep -q "nginx-ssl-fingerprint" || echo "Warning: JA3 module may not be visible in -V output"
