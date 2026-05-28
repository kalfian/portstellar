package ping

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"time"
)

// ProbeHTTP sends an HTTP GET and returns success if status < 500.
func ProbeHTTP(ctx context.Context, url string, timeoutMs int) (ok bool, errMsg string, latencyMs int) {
	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		// Don't follow redirects — just check the initial response
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	t0 := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, fmt.Sprintf("bad url: %v", err), 0
	}
	req.Header.Set("User-Agent", "portstellar/1.0")

	resp, err := client.Do(req)
	latencyMs = int(time.Since(t0).Milliseconds())
	if err != nil {
		return false, fmt.Sprintf("http: %v", err), latencyMs
	}
	resp.Body.Close()

	if resp.StatusCode >= 500 {
		return false, fmt.Sprintf("http: status %d", resp.StatusCode), latencyMs
	}
	return true, "", latencyMs
}
