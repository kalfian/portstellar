package db

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

// Store wraps an SQLite database.
type Store struct {
	db *sql.DB
}

// AdminAuth is the single admin auth row.
type AdminAuth struct {
	PasswordHash    string
	PasswordVersion int
	UpdatedAt       int64
}

// PingResult represents a single probe result for recording.
type PingResult struct {
	ServiceID string
	OK        bool
	LatencyMs int
	ErrorMsg  string
	Timestamp int64 // unix millis
}

// ServiceState represents the latest state of a service.
type ServiceState struct {
	ServiceID string `json:"serviceId"`
	OK        bool   `json:"ok"`
	LatencyMs int    `json:"latencyMs"`
	ErrorMsg  string `json:"errorMsg,omitempty"`
	Timestamp int64  `json:"ts"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type MeshPositions struct {
	MeshID   string              `json:"meshId"`
	Hosts    map[string]Position `json:"hosts"`
	Services map[string]Position `json:"services"`
}

// HistoryPoint represents a single point in ping history.
type HistoryPoint struct {
	OK        bool   `json:"ok"`
	LatencyMs int    `json:"latencyMs"`
	ErrorMsg  string `json:"errorMsg,omitempty"`
	Timestamp int64  `json:"ts"`
}

func Open(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", path)
	d, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	d.SetMaxOpenConns(1)
	d.SetMaxIdleConns(1)
	d.SetConnMaxLifetime(0)

	s := &Store{db: d}
	if err := s.migrate(); err != nil {
		d.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(schemaSQL)
	if err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	if err := s.ensureDefaultAdminAuth(context.Background()); err != nil {
		return fmt.Errorf("ensure default admin: %w", err)
	}
	slog.Info("db migration complete")
	return nil
}

func (s *Store) ensureDefaultAdminAuth(ctx context.Context) error {
	defaultPass := os.Getenv("ADMIN_PASSWORD")
	if defaultPass == "" {
		defaultPass = "123456"
	}

	// If ADMIN_PASSWORD is set, always enforce it (useful for dev resets).
	if envPass := os.Getenv("ADMIN_PASSWORD"); envPass != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(envPass), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		_, err = s.db.ExecContext(ctx,
			`INSERT INTO admin_auth (id, password_hash, password_version, updated_at) VALUES (1, ?, 1, ?)
			 ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
			string(hash), time.Now().UnixMilli(),
		)
		if err != nil {
			return err
		}
		slog.Info("admin password set from ADMIN_PASSWORD env")
		return nil
	}

	// No env var: insert default only if no row exists yet.
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM admin_auth WHERE id = 1`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(defaultPass), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO admin_auth (id, password_hash, password_version, updated_at) VALUES (1, ?, 1, ?)`,
		string(hash), time.Now().UnixMilli(),
	)
	return err
}

func (s *Store) GetAdminAuth(ctx context.Context) (AdminAuth, error) {
	var out AdminAuth
	err := s.db.QueryRowContext(ctx,
		`SELECT password_hash, password_version, updated_at FROM admin_auth WHERE id = 1`,
	).Scan(&out.PasswordHash, &out.PasswordVersion, &out.UpdatedAt)
	return out, err
}

func (s *Store) SetAdminPassword(ctx context.Context, newHash string, newVersion int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE admin_auth SET password_hash = ?, password_version = ?, updated_at = ? WHERE id = 1`,
		newHash, newVersion, time.Now().UnixMilli(),
	)
	return err
}

// RecordPing inserts a ping result and upserts the service state.
func (s *Store) RecordPing(ctx context.Context, r PingResult) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	okInt := boolToInt(r.OK)

	_, err = tx.ExecContext(ctx,
		`INSERT INTO ping_results (service_id, ok, latency_ms, error_msg, ts) VALUES (?, ?, ?, ?, ?)`,
		r.ServiceID, okInt, r.LatencyMs, r.ErrorMsg, r.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("insert ping_results: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO service_state (service_id, ok, latency_ms, error_msg, ts)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(service_id) DO UPDATE SET
		   ok = excluded.ok,
		   latency_ms = excluded.latency_ms,
		   error_msg = excluded.error_msg,
		   ts = excluded.ts`,
		r.ServiceID, okInt, r.LatencyMs, r.ErrorMsg, r.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("upsert service_state: %w", err)
	}

	return tx.Commit()
}

// LatestStates returns the current state for all services.
func (s *Store) LatestStates(ctx context.Context) ([]ServiceState, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT service_id, ok, latency_ms, error_msg, ts FROM service_state ORDER BY service_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ServiceState
	for rows.Next() {
		var st ServiceState
		var okInt int
		if err := rows.Scan(&st.ServiceID, &okInt, &st.LatencyMs, &st.ErrorMsg, &st.Timestamp); err != nil {
			return nil, err
		}
		st.OK = okInt == 1
		out = append(out, st)
	}
	return out, rows.Err()
}

// History returns ping results for a service since the given timestamp.
func (s *Store) History(ctx context.Context, serviceID string, sinceMs int64) ([]HistoryPoint, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT ok, latency_ms, error_msg, ts FROM ping_results
		 WHERE service_id = ? AND ts >= ?
		 ORDER BY ts ASC
		 LIMIT 1000`,
		serviceID, sinceMs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []HistoryPoint
	for rows.Next() {
		var pt HistoryPoint
		var okInt int
		if err := rows.Scan(&okInt, &pt.LatencyMs, &pt.ErrorMsg, &pt.Timestamp); err != nil {
			return nil, err
		}
		pt.OK = okInt == 1
		out = append(out, pt)
	}
	return out, rows.Err()
}

// PruneOlderThan deletes ping_results older than the given duration.
func (s *Store) PruneOlderThan(ctx context.Context, age time.Duration) (int64, error) {
	cutoff := time.Now().Add(-age).UnixMilli()
	res, err := s.db.ExecContext(ctx, `DELETE FROM ping_results WHERE ts < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) PruneOlderThanBatched(ctx context.Context, age time.Duration, batchSize int) (int64, error) {
	if batchSize <= 0 {
		batchSize = 5000
	}
	cutoff := time.Now().Add(-age).UnixMilli()

	var total int64
	for {
		res, err := s.db.ExecContext(ctx,
			`DELETE FROM ping_results WHERE id IN (
				SELECT id FROM ping_results WHERE ts < ? LIMIT ?
			)`,
			cutoff, batchSize,
		)
		if err != nil {
			return total, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return total, err
		}
		total += n
		if n < int64(batchSize) {
			break
		}
		if err := ctx.Err(); err != nil {
			return total, err
		}
	}

	return total, nil
}

func (s *Store) CheckpointPassive(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(PASSIVE)`)
	return err
}

func (s *Store) CheckpointTruncate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`)
	return err
}

func (s *Store) Optimize(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `PRAGMA optimize`)
	return err
}

func (s *Store) ReconcileServices(ctx context.Context, activeIDs []string) (int64, error) {
	if len(activeIDs) == 0 {
		slog.Warn("skipping service reconciliation because active service set is empty")
		return 0, nil
	}

	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(activeIDs)), ",")
	args := make([]any, len(activeIDs))
	for i, id := range activeIDs {
		args[i] = id
	}

	qState := fmt.Sprintf(`DELETE FROM service_state WHERE service_id NOT IN (%s)`, placeholders)
	qSettings := fmt.Sprintf(`DELETE FROM service_settings WHERE service_id NOT IN (%s)`, placeholders)
	qHistory := fmt.Sprintf(`DELETE FROM ping_results WHERE service_id NOT IN (%s)`, placeholders)

	res1, err := s.db.ExecContext(ctx, qState, args...)
	if err != nil {
		return 0, err
	}
	res2, err := s.db.ExecContext(ctx, qSettings, args...)
	if err != nil {
		return 0, err
	}
	res3, err := s.db.ExecContext(ctx, qHistory, args...)
	if err != nil {
		return 0, err
	}

	n1, _ := res1.RowsAffected()
	n2, _ := res2.RowsAffected()
	n3, _ := res3.RowsAffected()
	return n1 + n2 + n3, nil
}

// ServiceSetting holds heartbeat and retry config for a service.
type ServiceSetting struct {
	ServiceID   string `json:"serviceId"`
	HeartbeatMs int    `json:"heartbeatMs"`
	MaxRetries  int    `json:"maxRetries"`
}

// GetServiceSetting returns settings for a service, or defaults if not set.
func (s *Store) GetServiceSetting(ctx context.Context, serviceID string) (ServiceSetting, error) {
	var out ServiceSetting
	err := s.db.QueryRowContext(ctx,
		`SELECT service_id, heartbeat_ms, max_retries FROM service_settings WHERE service_id = ?`,
		serviceID,
	).Scan(&out.ServiceID, &out.HeartbeatMs, &out.MaxRetries)
	if err == sql.ErrNoRows {
		return ServiceSetting{ServiceID: serviceID, HeartbeatMs: 30000, MaxRetries: 1}, nil
	}
	return out, err
}

// UpsertServiceSetting saves heartbeatMs + maxRetries for a service.
func (s *Store) UpsertServiceSetting(ctx context.Context, setting ServiceSetting) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO service_settings (service_id, heartbeat_ms, max_retries, updated_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(service_id) DO UPDATE SET
		   heartbeat_ms = excluded.heartbeat_ms,
		   max_retries  = excluded.max_retries,
		   updated_at   = excluded.updated_at`,
		setting.ServiceID, setting.HeartbeatMs, setting.MaxRetries, time.Now().UnixMilli(),
	)
	return err
}

// GetAllServiceSettings returns all stored settings (used by dispatcher).
func (s *Store) GetAllServiceSettings(ctx context.Context) ([]ServiceSetting, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT service_id, heartbeat_ms, max_retries FROM service_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ServiceSetting
	for rows.Next() {
		var st ServiceSetting
		if err := rows.Scan(&st.ServiceID, &st.HeartbeatMs, &st.MaxRetries); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *Store) GetMeshPositions(ctx context.Context, meshID string) (MeshPositions, error) {
	out := MeshPositions{
		MeshID:   meshID,
		Hosts:    map[string]Position{},
		Services: map[string]Position{},
	}

	hostRows, err := s.db.QueryContext(ctx,
		`SELECT host_id, x, y FROM mesh_host_positions WHERE mesh_id = ?`,
		meshID,
	)
	if err != nil {
		return out, err
	}
	defer hostRows.Close()
	for hostRows.Next() {
		var hostID string
		var p Position
		if err := hostRows.Scan(&hostID, &p.X, &p.Y); err != nil {
			return out, err
		}
		out.Hosts[hostID] = p
	}
	if err := hostRows.Err(); err != nil {
		return out, err
	}

	svcRows, err := s.db.QueryContext(ctx,
		`SELECT service_id, x, y FROM mesh_service_positions WHERE mesh_id = ?`,
		meshID,
	)
	if err != nil {
		return out, err
	}
	defer svcRows.Close()
	for svcRows.Next() {
		var serviceID string
		var p Position
		if err := svcRows.Scan(&serviceID, &p.X, &p.Y); err != nil {
			return out, err
		}
		out.Services[serviceID] = p
	}
	if err := svcRows.Err(); err != nil {
		return out, err
	}

	return out, nil
}

func (s *Store) ReplaceMeshPositions(ctx context.Context, meshID string, hosts map[string]Position, services map[string]Position) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now().UnixMilli()

	if _, err := tx.ExecContext(ctx, `DELETE FROM mesh_host_positions WHERE mesh_id = ?`, meshID); err != nil {
		return err
	}
	for hostID, p := range hosts {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO mesh_host_positions (mesh_id, host_id, x, y, updated_at) VALUES (?, ?, ?, ?, ?)`,
			meshID, hostID, p.X, p.Y, now,
		); err != nil {
			return err
		}
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM mesh_service_positions WHERE mesh_id = ?`, meshID); err != nil {
		return err
	}
	for serviceID, p := range services {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO mesh_service_positions (mesh_id, service_id, x, y, updated_at) VALUES (?, ?, ?, ?, ?)`,
			meshID, serviceID, p.X, p.Y, now,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Beat represents a single heartbeat result.
type Beat struct {
	OK        bool   `json:"ok"`
	LatencyMs int    `json:"latencyMs"`
	ErrorMsg  string `json:"errorMsg,omitempty"`
	Ts        int64  `json:"ts"`
}

// ServiceStats holds computed uptime stats and recent beats.
type ServiceStats struct {
	Uptime24h     *float64 `json:"uptime24h"`
	Uptime30d     *float64 `json:"uptime30d"`
	AvgLatency24h *int     `json:"avgLatency24h"`
	RecentBeats   []Beat   `json:"recentBeats"`
}

// GetServiceStats computes uptime % and returns last 50 beats.
func (s *Store) GetServiceStats(ctx context.Context, serviceID string) (ServiceStats, error) {
	var stats ServiceStats

	// Last 50 beats
	rows, err := s.db.QueryContext(ctx,
		`SELECT ok, latency_ms, error_msg, ts FROM ping_results
		 WHERE service_id = ?
		 ORDER BY ts DESC
		 LIMIT 50`,
		serviceID,
	)
	if err != nil {
		return stats, err
	}
	defer rows.Close()

	var beats []Beat
	for rows.Next() {
		var b Beat
		var okInt int
		if err := rows.Scan(&okInt, &b.LatencyMs, &b.ErrorMsg, &b.Ts); err != nil {
			return stats, err
		}
		b.OK = okInt == 1
		beats = append(beats, b)
	}
	if err := rows.Err(); err != nil {
		return stats, err
	}
	// Reverse so oldest-first
	for i, j := 0, len(beats)-1; i < j; i, j = i+1, j-1 {
		beats[i], beats[j] = beats[j], beats[i]
	}
	if beats == nil {
		beats = []Beat{}
	}
	stats.RecentBeats = beats

	// Uptime 24h
	since24h := time.Now().Add(-24 * time.Hour).UnixMilli()
	var total24, ok24 int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), SUM(ok) FROM ping_results WHERE service_id = ? AND ts >= ?`,
		serviceID, since24h,
	).Scan(&total24, &ok24); err == nil && total24 > 0 {
		v := (float64(ok24) / float64(total24)) * 100
		v = float64(int(v*10)) / 10 // one decimal
		stats.Uptime24h = &v
	}

	// Uptime 30d
	since30d := time.Now().Add(-30 * 24 * time.Hour).UnixMilli()
	var total30, ok30 int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), SUM(ok) FROM ping_results WHERE service_id = ? AND ts >= ?`,
		serviceID, since30d,
	).Scan(&total30, &ok30); err == nil && total30 > 0 {
		v := (float64(ok30) / float64(total30)) * 100
		v = float64(int(v*10)) / 10
		stats.Uptime30d = &v
	}

	// Avg latency 24h (ok only)
	var avgLat float64
	var avgCount int
	if err := s.db.QueryRowContext(ctx,
		`SELECT AVG(latency_ms), COUNT(*) FROM ping_results WHERE service_id = ? AND ts >= ? AND ok = 1`,
		serviceID, since24h,
	).Scan(&avgLat, &avgCount); err == nil && avgCount > 0 {
		v := int(avgLat)
		stats.AvgLatency24h = &v
	}

	return stats, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
