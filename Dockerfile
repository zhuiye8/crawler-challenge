FROM node:20-alpine

# 切换到阿里云 Alpine 镜像源 + 配置 npm 淘宝镜像
RUN sed -i 's|https\?://dl-cdn.alpinelinux.org/alpine|https://mirrors.aliyun.com/alpine|g' /etc/apk/repositories \
    && apk update \
    && apk add --no-cache python3 make g++ \
    && rm -rf /var/cache/apk/* \
    && npm config set registry https://registry.npmmirror.com

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (用 npm install 而不是 npm ci)
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Copy and setup entrypoint script (convert CRLF to LF for Windows compatibility)
COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Use entrypoint to init db at runtime (not build time)
ENTRYPOINT ["docker-entrypoint.sh"]
