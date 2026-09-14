package config

import (
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string

	// Optional: when all three are set, product image uploads go to Cloudinary instead of local
	// disk. Leave unset for local dev (docker-compose) - uploads then fall back to ./uploads.
	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string

	// Optional: when SMTPHost is unset, invite/reset-password emails are logged to stdout
	// instead of sent - fine for local dev, no real mailbox needed to test the flow.
	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	// Base URL used to build links embedded in emails (invite / reset password).
	AppBaseURL string
}

func Load() Config {
	return Config{
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/ordermgmt?sslmode=disable"),
		JWTSecret:           getEnv("JWT_SECRET", "dev-secret-change-me"),
		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
		SMTPHost:            getEnv("SMTP_HOST", ""),
		SMTPPort:            getEnv("SMTP_PORT", "587"),
		SMTPUser:            getEnv("SMTP_USER", ""),
		SMTPPass:            getEnv("SMTP_PASS", ""),
		SMTPFrom:            getEnv("SMTP_FROM", "no-reply@ks-shop.local"),
		AppBaseURL:          getEnv("APP_BASE_URL", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
