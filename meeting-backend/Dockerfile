# ===============================
# 1. Dùng Node.js image nhẹ cho backend
# ===============================
FROM node:18-alpine

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Copy file package và cài dependencies (npm ci = cài chính xác version)
COPY package*.json ./
RUN npm ci --production

# Copy toàn bộ code backend vào container
COPY . .

# Expose port của backend (trùng với PORT trong .env hoặc server.js)
EXPOSE 5000

# Lệnh chạy server
CMD ["node", "src/server.js"]
