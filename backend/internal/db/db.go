package db

import (
	"context"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect opens the pool. pgx's default is max(4, CPUs) connections, which makes the pages that fire
// several requests at once (Orders, Dashboard, Shipping Workbench) queue behind each other, so the
// size is set here: DB_MAX_CONNS (default 20), DB_MIN_CONNS (default 2).
func Connect(databaseURL string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = int32(envInt("DB_MAX_CONNS", 20))
	cfg.MinConns = int32(envInt("DB_MIN_CONNS", 2))
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 15 * time.Minute
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}

	return pool, nil
}

func envInt(key string, def int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil && n > 0 {
		return n
	}
	return def
}
