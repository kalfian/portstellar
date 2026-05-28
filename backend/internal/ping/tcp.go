package ping

import (
	"context"
	"fmt"
	"net"
	"time"
)

// ProbeTCP dials a TCP connection and returns success if it connects.
func ProbeTCP(ctx context.Context, host string, port int, timeoutMs int) (ok bool, errMsg string, latencyMs int) {
	addr := fmt.Sprintf("%s:%d", host, port)
	dialer := net.Dialer{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
	}

	t0 := time.Now()
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	latencyMs = int(time.Since(t0).Milliseconds())
	if err != nil {
		return false, fmt.Sprintf("tcp: %v", err), latencyMs
	}
	conn.Close()
	return true, "", latencyMs
}
