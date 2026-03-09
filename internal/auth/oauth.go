package auth

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// OAuthConfig holds configuration for OAuth authentication.
type OAuthConfig struct {
	// JWKSEndpoint is the URL to fetch JWKS from (e.g., "https://auth.example.com/.well-known/jwks.json")
	JWKSEndpoint string
	// Issuer to validate (optional)
	Issuer string
	// Audience to validate (optional)
	Audience string
}

// OAuthAuthenticator handles JWT validation against a JWKS endpoint.
type OAuthAuthenticator struct {
	jwks   keyfunc.Keyfunc
	config OAuthConfig
}

// NewOAuthAuthenticator creates a new OAuth authenticator that fetches keys from the JWKS endpoint.
func NewOAuthAuthenticator(config OAuthConfig) (*OAuthAuthenticator, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	k, err := keyfunc.NewDefaultCtx(ctx, []string{config.JWKSEndpoint})
	if err != nil {
		return nil, fmt.Errorf("failed to create JWKS keyfunc: %w", err)
	}

	return &OAuthAuthenticator{
		jwks:   k,
		config: config,
	}, nil
}

// ValidateToken validates a JWT token string and returns the claims.
func (a *OAuthAuthenticator) ValidateToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, a.jwks.Keyfunc,
		jwt.WithValidMethods([]string{"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	if !token.Valid {
		return nil, fmt.Errorf("token is not valid")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	if a.config.Issuer != "" {
		iss, _ := claims.GetIssuer()
		if iss != a.config.Issuer {
			return nil, fmt.Errorf("invalid issuer: expected %s, got %s", a.config.Issuer, iss)
		}
	}

	if a.config.Audience != "" {
		aud, _ := claims.GetAudience()
		found := false
		for _, v := range aud {
			if v == a.config.Audience {
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("invalid audience")
		}
	}

	return claims, nil
}

// Middleware returns an HTTP middleware that validates JWT bearer tokens.
// Requests without an Authorization header are rejected with 401.
func (a *OAuthAuthenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"missing bearer token"}`, http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := a.ValidateToken(tokenString)
		if err != nil {
			log.Printf("OAuth token validation failed: %v", err)
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		// Store claims in request context
		ctx := context.WithValue(r.Context(), claimsContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Close is a no-op for cleanup compatibility. keyfunc v3 handles lifecycle automatically.
func (a *OAuthAuthenticator) Close() {}

type contextKey string

const claimsContextKey contextKey = "oauth_claims"

// ClaimsFromContext extracts JWT claims from the request context.
func ClaimsFromContext(ctx context.Context) (jwt.MapClaims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(jwt.MapClaims)
	return claims, ok
}
