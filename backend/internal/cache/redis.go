package cache

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

// New creates a Redis client from REDIS_URL env var.
// Returns a no-op client if REDIS_URL is not set.
func New() *Client {
	url := os.Getenv("REDIS_URL")
	if url == "" {
		log.Println("REDIS_URL not set, caching disabled")
		return &Client{}
	}

	opt, err := redis.ParseURL(url)
	if err != nil {
		log.Printf("WARNING: invalid REDIS_URL: %v — caching disabled", err)
		return &Client{}
	}

	rdb := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("WARNING: redis unreachable: %v — caching disabled", err)
		return &Client{}
	}

	log.Println("Redis connected")
	return &Client{rdb: rdb}
}

func (c *Client) enabled() bool { return c != nil && c.rdb != nil }

// GetJSON deserializes a cached value into dest. Returns false on miss or error.
func (c *Client) GetJSON(ctx context.Context, key string, dest any) bool {
	if !c.enabled() {
		return false
	}
	val, err := c.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(val, dest) == nil
}

// SetJSON serializes value and stores it with the given TTL.
func (c *Client) SetJSON(ctx context.Context, key string, value any, ttl time.Duration) {
	if !c.enabled() {
		return
	}
	b, err := json.Marshal(value)
	if err != nil {
		return
	}
	c.rdb.Set(ctx, key, b, ttl)
}

// Del removes one or more keys.
func (c *Client) Del(ctx context.Context, keys ...string) {
	if !c.enabled() {
		return
	}
	c.rdb.Del(ctx, keys...)
}

// DelPattern removes all keys matching a glob pattern (e.g. "products:*").
func (c *Client) DelPattern(ctx context.Context, pattern string) {
	if !c.enabled() {
		return
	}
	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return
		}
		if len(keys) > 0 {
			c.rdb.Del(ctx, keys...)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}
