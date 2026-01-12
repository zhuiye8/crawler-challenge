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

# Initialize database
RUN npm run init-db

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
