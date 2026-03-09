package config

import (
	"os"
)

// Config holds application configuration
type Config struct {
	DatabaseURL    string
	RedisURL       string
	Port           string
	OAuthServerURL string
	OAuthIssuer    string
	OAuthAudience  string
	CacheEnabled   bool
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	cacheEnabled := getEnv("CACHE_ENABLED", "true")

	cfg := &Config{
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://localhost:5432/hk_transport?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "localhost:6379"),
		Port:           getEnv("PORT", "8080"),
		OAuthServerURL: getEnv("OAUTH_SERVER_URL", ""),
		OAuthIssuer:    getEnv("OAUTH_ISSUER", ""),
		OAuthAudience:  getEnv("OAUTH_AUDIENCE", ""),
		CacheEnabled:   cacheEnabled == "true" || cacheEnabled == "1",
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
