package middleware

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

// dbPoolCollector exposes pgxpool's own stats (acquired/idle/max conns,
// wait count/duration) as Prometheus gauges/counters on every scrape,
// rather than sampling them on a timer.
type dbPoolCollector struct {
	pool *pgxpool.Pool

	acquired      *prometheus.Desc
	idle          *prometheus.Desc
	maxConns      *prometheus.Desc
	totalConns    *prometheus.Desc
	newConns      *prometheus.Desc
	waitCount     *prometheus.Desc
	waitDuration  *prometheus.Desc
	acquireErrors *prometheus.Desc
}

func NewDBPoolCollector(pool *pgxpool.Pool) prometheus.Collector {
	return &dbPoolCollector{
		pool:          pool,
		acquired:      prometheus.NewDesc("db_pool_acquired_conns", "Connections currently acquired from the pool.", nil, nil),
		idle:          prometheus.NewDesc("db_pool_idle_conns", "Idle connections currently in the pool.", nil, nil),
		maxConns:      prometheus.NewDesc("db_pool_max_conns", "Maximum size the pool is allowed to reach.", nil, nil),
		totalConns:    prometheus.NewDesc("db_pool_total_conns", "Total connections currently in the pool.", nil, nil),
		newConns:      prometheus.NewDesc("db_pool_new_conns_total", "Cumulative count of new connections opened.", nil, nil),
		waitCount:     prometheus.NewDesc("db_pool_wait_count_total", "Cumulative count of successful acquires that waited for a connection.", nil, nil),
		waitDuration:  prometheus.NewDesc("db_pool_wait_duration_seconds_total", "Cumulative time spent waiting for a connection.", nil, nil),
		acquireErrors: prometheus.NewDesc("db_pool_acquire_errors_total", "Cumulative count of failed acquires.", nil, nil),
	}
}

func (c *dbPoolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.acquired
	ch <- c.idle
	ch <- c.maxConns
	ch <- c.totalConns
	ch <- c.newConns
	ch <- c.waitCount
	ch <- c.waitDuration
	ch <- c.acquireErrors
}

func (c *dbPoolCollector) Collect(ch chan<- prometheus.Metric) {
	s := c.pool.Stat()
	ch <- prometheus.MustNewConstMetric(c.acquired, prometheus.GaugeValue, float64(s.AcquiredConns()))
	ch <- prometheus.MustNewConstMetric(c.idle, prometheus.GaugeValue, float64(s.IdleConns()))
	ch <- prometheus.MustNewConstMetric(c.maxConns, prometheus.GaugeValue, float64(s.MaxConns()))
	ch <- prometheus.MustNewConstMetric(c.totalConns, prometheus.GaugeValue, float64(s.TotalConns()))
	ch <- prometheus.MustNewConstMetric(c.newConns, prometheus.CounterValue, float64(s.NewConnsCount()))
	ch <- prometheus.MustNewConstMetric(c.waitCount, prometheus.CounterValue, float64(s.EmptyAcquireCount()))
	ch <- prometheus.MustNewConstMetric(c.waitDuration, prometheus.CounterValue, s.AcquireDuration().Seconds())
	ch <- prometheus.MustNewConstMetric(c.acquireErrors, prometheus.CounterValue, float64(s.CanceledAcquireCount()))
}
