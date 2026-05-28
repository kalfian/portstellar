package ping

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kalfian/portstellar/internal/config"
	"github.com/kalfian/portstellar/internal/db"
)

const (
	defaultConcurrency = 16
	defaultTimeoutMs   = 4000
	globalTickInterval = 5 * time.Second
	retryGap           = 1 * time.Second
)

// serviceSchedule tracks when each service was last probed.
type serviceSchedule struct {
	mu       sync.Mutex
	lastProbe map[string]time.Time
}

func newServiceSchedule() *serviceSchedule {
	return &serviceSchedule{lastProbe: make(map[string]time.Time)}
}

func (ss *serviceSchedule) isDue(serviceID string, interval time.Duration) bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	last, ok := ss.lastProbe[serviceID]
	if !ok {
		return true
	}
	return time.Since(last) >= interval
}

func (ss *serviceSchedule) markProbed(serviceID string) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.lastProbe[serviceID] = time.Now()
}

// Dispatcher periodically probes all services and records results.
type Dispatcher struct {
	cfgMu sync.RWMutex
	cfg   *config.Config
	store *db.Store

	// onPingResult is an optional callback invoked after each successful probe
	// record. It is called with the service ID, ok flag, latency in ms, error
	// message (if any), and the Unix-millisecond timestamp. Use a function
	// (not an interface) to avoid circular import with the ws package.
	onPingResult func(serviceID string, ok bool, latencyMs int, errMsg string, ts int64)

	lastTick atomic.Int64 // unix millis of last completed tick
	bootTime time.Time
}

func NewDispatcher(cfg *config.Config, store *db.Store, onPingResult func(string, bool, int, string, int64)) *Dispatcher {
	return &Dispatcher{
		cfg:          cfg,
		store:        store,
		onPingResult: onPingResult,
		bootTime:     time.Now(),
	}
}

// LastTick returns the unix-millis timestamp of the last completed tick.
func (d *Dispatcher) LastTick() int64 {
	return d.lastTick.Load()
}

// BootTime returns when the dispatcher was created.
func (d *Dispatcher) BootTime() time.Time {
	return d.bootTime
}

func (d *Dispatcher) snapshotConfig() *config.Config {
	d.cfgMu.RLock()
	defer d.cfgMu.RUnlock()
	return d.cfg
}

func (d *Dispatcher) UpdateConfig(cfg *config.Config) {
	d.cfgMu.Lock()
	d.cfg = cfg
	d.cfgMu.Unlock()
	slog.Info("dispatcher config updated", "hosts", len(cfg.Hosts), "services", cfg.ServiceCount())
}

func (d *Dispatcher) Run(ctx context.Context) {
	cfg := d.snapshotConfig()
	services := cfg.FlatServices()

	slog.Info("dispatcher config", "services", len(services), "interval", globalTickInterval)

	schedule := newServiceSchedule()

	// Immediate first tick — probe all services right away
	d.tick(ctx, services, schedule)

	ticker := time.NewTicker(globalTickInterval)
	defer ticker.Stop()

	// Periodic prune: clean records older than 48h
	pruneTicker := time.NewTicker(1 * time.Hour)
	defer pruneTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("dispatcher stopping")
			return
		case <-ticker.C:
			cfg = d.snapshotConfig()
			services = cfg.FlatServices()
			d.tick(ctx, services, schedule)
		case <-pruneTicker.C:
			if n, err := d.store.PruneOlderThan(ctx, 48*time.Hour); err != nil {
				slog.Warn("prune error", "err", err)
			} else if n > 0 {
				slog.Info("pruned old ping records", "deleted", n)
			}
		}
	}
}

// settingsMap loads all service settings and returns a map keyed by service ID.
func (d *Dispatcher) settingsMap(ctx context.Context) map[string]db.ServiceSetting {
	settings, err := d.store.GetAllServiceSettings(ctx)
	m := make(map[string]db.ServiceSetting)
	if err != nil {
		slog.Warn("load service settings", "err", err)
		return m
	}
	for _, s := range settings {
		m[s.ServiceID] = s
	}
	return m
}

func (d *Dispatcher) tick(ctx context.Context, services []config.FlatService, schedule *serviceSchedule) {
	cfg := d.snapshotConfig()
	globalInterval := time.Duration(cfg.PingIntervalMs) * time.Millisecond

	settMap := d.settingsMap(ctx)

	slog.Debug("tick start", "services", len(services))
	sem := make(chan struct{}, defaultConcurrency)
	var wg sync.WaitGroup

	for _, svc := range services {
		// Determine per-service heartbeat interval
		interval := globalInterval
		if st, ok := settMap[svc.ID]; ok && st.HeartbeatMs >= 5000 {
			interval = time.Duration(st.HeartbeatMs) * time.Millisecond
		}

		if !schedule.isDue(svc.ID, interval) {
			continue
		}

		wg.Add(1)
		go func(s config.FlatService, maxRetries int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			schedule.markProbed(s.ID)

			ok, errMsg, latencyMs := d.probeWithRetry(ctx, s, maxRetries)

			now := time.Now().UnixMilli()
			result := db.PingResult{
				ServiceID: s.ID,
				OK:        ok,
				LatencyMs: latencyMs,
				ErrorMsg:  errMsg,
				Timestamp: now,
			}
			if err := d.store.RecordPing(ctx, result); err != nil {
				slog.Warn("record ping failed", "service", s.ID, "err", err)
			} else if d.onPingResult != nil {
				d.onPingResult(s.ID, ok, latencyMs, errMsg, now)
			}

			level := slog.LevelDebug
			if !ok {
				level = slog.LevelWarn
			}
			slog.Log(ctx, level, "probe", "service", s.ID, "ok", ok, "ms", latencyMs, "err", errMsg)
		}(svc, retries(settMap, svc.ID))
	}

	wg.Wait()
	d.lastTick.Store(time.Now().UnixMilli())
	slog.Debug("tick done")
}

func retries(m map[string]db.ServiceSetting, id string) int {
	if st, ok := m[id]; ok {
		return st.MaxRetries
	}
	return 1
}

// probeWithRetry runs the probe up to maxRetries+1 times before returning failure.
func (d *Dispatcher) probeWithRetry(ctx context.Context, s config.FlatService, maxRetries int) (ok bool, errMsg string, latencyMs int) {
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return false, "context cancelled", 0
			case <-time.After(retryGap):
			}
		}
		ok, errMsg, latencyMs = d.probe(ctx, s)
		if ok {
			return ok, errMsg, latencyMs
		}
	}
	return ok, errMsg, latencyMs
}

// probe decides which prober to use and calls it.
func (d *Dispatcher) probe(ctx context.Context, s config.FlatService) (ok bool, errMsg string, latencyMs int) {
	probeType := detectProbeType(s)

	switch probeType {
	case "http":
		url := s.URL
		if url == "" {
			url = fmt.Sprintf("http://%s:%d", s.HostIP, s.Port)
		}
		return ProbeHTTP(ctx, url, defaultTimeoutMs)
	case "icmp":
		return ProbeICMP(ctx, s.HostIP, defaultTimeoutMs)
	default: // "tcp"
		return ProbeTCP(ctx, s.HostIP, s.Port, defaultTimeoutMs)
	}
}

// detectProbeType determines probe type from service config.
// Priority: explicit probe.type > URL scheme > protocol > default tcp.
func detectProbeType(s config.FlatService) string {
	// 1. Explicit probe type
	if s.Probe != nil && s.Probe.Type != "" {
		return strings.ToLower(s.Probe.Type)
	}

	// 2. URL scheme implies HTTP
	if s.URL != "" {
		lower := strings.ToLower(s.URL)
		if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
			return "http"
		}
	}

	// 3. UDP protocol → ICMP (can't TCP-dial UDP)
	if strings.ToLower(s.Protocol) == "udp" {
		return "icmp"
	}

	// 4. Default
	return "tcp"
}
