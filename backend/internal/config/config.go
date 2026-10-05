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

	// Optional: when ResendAPIKey is set, invite/reset-password/OTP emails send via Resend's
	// HTTPS API instead of SMTP - preferred when it's set, since outbound SMTP ports are
	// frequently blocked by VPS network/firewalls (confirmed on this project's own VPS) while
	// HTTPS essentially never is. Falls back to SMTPHost (plain net/smtp) when unset, then to
	// logging the email to stdout when neither is configured - fine for local dev.
	ResendAPIKey string
	ResendFrom   string

	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	// Base URL used to build links embedded in emails (invite / reset password).
	AppBaseURL string

	// ECPay Logistics (CVS store list lookup, used to validate a typed 7-Eleven/FamilyMart
	// store code). ECPayLogisticsEnv is the single switch between the two: "staging" (default)
	// runs against ECPay's own published B2C logistics *test* merchant/keys and stage endpoint,
	// which works out of the box with no configuration; "production" switches the base URL to
	// the real ECPay logistics host and drops the test-credential defaults entirely, since a
	// real merchant's MerchantID/HashKey/HashIV are secrets that must never have a checked-in
	// fallback - they're required via env once this flag is flipped, and CvsStoreHandler's
	// configured() check (all four non-empty) naturally soft-disables the feature until they are.
	ECPayLogisticsEnv        string
	ECPayLogisticsMerchantID string
	ECPayLogisticsHashKey    string
	ECPayLogisticsHashIV     string
	ECPayLogisticsBaseURL    string
}

func Load() Config {
	ecpayEnv := getEnv("ECPAY_LOGISTICS_ENV", "staging")

	// Staging defaults to ECPay's own publicly-documented test merchant/keys (safe to check in -
	// they're published by ECPay for exactly this purpose). Production has no credential
	// defaults at all: those are the client's real secrets and must come from env, never a
	// fallback in source control.
	defaultMerchantID, defaultHashKey, defaultHashIV, defaultBaseURL := "2000132", "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS", "https://logistics-stage.ecpay.com.tw"
	if ecpayEnv == "production" {
		defaultMerchantID, defaultHashKey, defaultHashIV = "", "", ""
		defaultBaseURL = "https://logistics.ecpay.com.tw"
	}

	return Config{
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/ordermgmt?sslmode=disable"),
		JWTSecret:           getEnv("JWT_SECRET", "dev-secret-change-me"),
		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
		ResendAPIKey:        getEnv("RESEND_API_KEY", ""),
		ResendFrom:          getEnv("RESEND_FROM", "onboarding@resend.dev"),
		SMTPHost:            getEnv("SMTP_HOST", ""),
		SMTPPort:            getEnv("SMTP_PORT", "587"),
		SMTPUser:            getEnv("SMTP_USER", ""),
		SMTPPass:            getEnv("SMTP_PASS", ""),
		SMTPFrom:            getEnv("SMTP_FROM", "no-reply@ohlala-shop.local"),
		AppBaseURL:          getEnv("APP_BASE_URL", "http://localhost:5173"),

		ECPayLogisticsEnv:        ecpayEnv,
		ECPayLogisticsMerchantID: getEnv("ECPAY_LOGISTICS_MERCHANT_ID", defaultMerchantID),
		ECPayLogisticsHashKey:    getEnv("ECPAY_LOGISTICS_HASH_KEY", defaultHashKey),
		ECPayLogisticsHashIV:     getEnv("ECPAY_LOGISTICS_HASH_IV", defaultHashIV),
		ECPayLogisticsBaseURL:    getEnv("ECPAY_LOGISTICS_BASE_URL", defaultBaseURL),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
