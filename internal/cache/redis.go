package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache wraps a Redis client with typed JSON helpers.
type Cache struct {
	client *redis.Client
}

// New creates a new Cache backed by Redis.
func New(addr string) (*Cache, error) {
	client := redis.NewClient(&redis.Options{
		Addr: addr,
	})
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Cache{client: client}, nil
}

// GetJSON retrieves a cached value and unmarshals it into dest.
// Returns false if the key does not exist.
func GetJSON[T any](ctx context.Context, c *Cache, key string) (T, bool, error) {
	var zero T
	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return zero, false, nil
	}
	if err != nil {
		return zero, false, err
	}
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return zero, false, err
	}
	return result, true, nil
}

// SetJSON marshals value as JSON and stores it with the given TTL.
func SetJSON(ctx context.Context, c *Cache, key string, value any, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, data, ttl).Err()
}

// Close closes the underlying Redis client.
func (c *Cache) Close() error {
	return c.client.Close()
}
