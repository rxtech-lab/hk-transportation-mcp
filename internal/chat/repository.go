package chat

import (
	"context"
	"database/sql"
	"fmt"
)

// Message represents a chat message stored in the database.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Repository handles chat message persistence with a sliding window.
type Repository struct {
	db          *sql.DB
	maxMessages int
}

// NewRepository creates a new chat Repository.
func NewRepository(db *sql.DB, maxMessages int) *Repository {
	return &Repository{db: db, maxMessages: maxMessages}
}

// GetHistory returns the most recent messages for a JID, ordered oldest first.
func (r *Repository) GetHistory(ctx context.Context, jid string) ([]Message, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT role, content FROM (
			SELECT role, content, created_at
			FROM chat_messages
			WHERE jid = $1
			ORDER BY created_at DESC
			LIMIT $2
		) sub ORDER BY created_at ASC
	`, jid, r.maxMessages)
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.Role, &m.Content); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// MaxMessages returns the configured message threshold.
func (r *Repository) MaxMessages() int {
	return r.maxMessages
}

// CountMessages returns the number of messages stored for a JID.
func (r *Repository) CountMessages(ctx context.Context, jid string) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM chat_messages WHERE jid = $1`, jid).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count messages: %w", err)
	}
	return count, nil
}

// CompressMessages replaces all messages for a JID with a single summary message.
func (r *Repository) CompressMessages(ctx context.Context, jid, summary string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM chat_messages WHERE jid = $1`, jid); err != nil {
		return fmt.Errorf("delete messages: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO chat_messages (jid, role, content) VALUES ($1, $2, $3)
	`, jid, "system", summary); err != nil {
		return fmt.Errorf("insert summary: %w", err)
	}

	return tx.Commit()
}

// SaveMessage inserts a message and trims old messages beyond the window.
func (r *Repository) SaveMessage(ctx context.Context, jid, role, content string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO chat_messages (jid, role, content) VALUES ($1, $2, $3)
	`, jid, role, content); err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	// Trim: keep only the most recent maxMessages
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM chat_messages
		WHERE jid = $1 AND id NOT IN (
			SELECT id FROM chat_messages
			WHERE jid = $1
			ORDER BY created_at DESC
			LIMIT $2
		)
	`, jid, r.maxMessages); err != nil {
		return fmt.Errorf("trim messages: %w", err)
	}

	return tx.Commit()
}
