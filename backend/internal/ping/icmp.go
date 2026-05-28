package ping

import (
	"context"
	"fmt"
	"time"

	probing "github.com/prometheus-community/pro-bing"
)

// ProbeICMP sends a single ICMP ping and returns success.
// Tries unprivileged first, falls back to privileged.
func ProbeICMP(ctx context.Context, host string, timeoutMs int) (ok bool, errMsg string, latencyMs int) {
	timeout := time.Duration(timeoutMs) * time.Millisecond

	// Try unprivileged first
	ok, errMsg, latencyMs = doICMP(ctx, host, timeout, false)
	if ok || errMsg == "" {
		return
	}

	// Fallback to privileged
	return doICMP(ctx, host, timeout, true)
}

func doICMP(ctx context.Context, host string, timeout time.Duration, privileged bool) (ok bool, errMsg string, latencyMs int) {
	pinger, err := probing.NewPinger(host)
	if err != nil {
		return false, fmt.Sprintf("icmp: create pinger: %v", err), 0
	}
	pinger.SetPrivileged(privileged)
	pinger.Count = 1
	pinger.Timeout = timeout

	t0 := time.Now()
	err = pinger.RunWithContext(ctx)
	latencyMs = int(time.Since(t0).Milliseconds())
	if err != nil {
		return false, fmt.Sprintf("icmp: %v", err), latencyMs
	}

	stats := pinger.Statistics()
	if stats.PacketsRecv == 0 {
		return false, "icmp: no reply", latencyMs
	}

	latencyMs = int(stats.AvgRtt.Milliseconds())
	return true, "", latencyMs
}
