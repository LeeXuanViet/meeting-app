# ===============================
# Stage 1: Build React app
# ===============================
FROM node:18-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install

# Copy source và build production
COPY . .
RUN npm run build

# ===============================
# Stage 2: Dùng Nginx để serve frontend
# ===============================
FROM nginx:stable-alpine

# Copy build từ stage 1 vào thư mục của nginx
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80 (nginx default)
EXPOSE 80

# Chạy nginx
CMD ["nginx", "-g", "daemon off;"]
