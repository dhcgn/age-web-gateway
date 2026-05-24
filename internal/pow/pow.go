package pow

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidFormat = errors.New("pow: invalid token format, expected ts.nonce")
	ErrExpired       = errors.New("pow: token timestamp outside validity window")
	ErrDifficulty    = errors.New("pow: insufficient leading zero bits")
	ErrReplayed      = errors.New("pow: token already used")
)

// ReplayCache tracks recently seen PoW tokens to prevent reuse.
type ReplayCache struct {
	mu      sync.Mutex
	seen    map[string]time.Time
	ttl     time.Duration
	closeCh chan struct{}
}

// NewReplayCache creates a cache that evicts entries after ttl.
func NewReplayCache(ttl time.Duration) *ReplayCache {
	rc := &ReplayCache{
		seen:    make(map[string]time.Time),
		ttl:     ttl,
		closeCh: make(chan struct{}),
	}
	go rc.sweep()
	return rc
}

func (rc *ReplayCache) sweep() {
	ticker := time.NewTicker(rc.ttl / 2)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			rc.mu.Lock()
			cutoff := time.Now().Add(-rc.ttl)
			for k, t := range rc.seen {
				if t.Before(cutoff) {
					delete(rc.seen, k)
				}
			}
			rc.mu.Unlock()
		case <-rc.closeCh:
			return
		}
	}
}

// Close stops the background sweep goroutine.
func (rc *ReplayCache) Close() {
	close(rc.closeCh)
}

// Add returns true if the token was new (not replayed), false if already seen.
func (rc *ReplayCache) Add(token string) bool {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	if _, exists := rc.seen[token]; exists {
		return false
	}
	rc.seen[token] = time.Now()
	return true
}

// Verify checks a PoW token of the form "ts.nonce".
func Verify(token string, difficulty int, validity time.Duration, cache *ReplayCache) error {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return ErrInvalidFormat
	}

	ts, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return ErrInvalidFormat
	}

	// Check freshness.
	delta := time.Since(time.Unix(ts, 0))
	if delta < 0 {
		delta = -delta
	}
	if delta > validity {
		return ErrExpired
	}

	// Check difficulty: SHA-256(ts || nonce) must have >= difficulty leading zero bits.
	preimage := fmt.Sprintf("%s%s", parts[0], parts[1])
	hash := sha256.Sum256([]byte(preimage))
	if countLeadingZeroBits(hash) < difficulty {
		return ErrDifficulty
	}

	// Replay check — consume the token.
	if !cache.Add(token) {
		return ErrReplayed
	}

	return nil
}

// countLeadingZeroBits counts leading zero bits in a byte slice.
func countLeadingZeroBits(hash [32]byte) int {
	count := 0
	for _, b := range hash {
		if b == 0 {
			count += 8
			continue
		}
		// Count leading zeros in this byte.
		for bit := 7; bit >= 0; bit-- {
			if b&(1<<uint(bit)) != 0 {
				return count
			}
			count++
		}
		break
	}
	if count > 256 {
		count = 256
	}
	return count
}

// Solve finds a nonce such that SHA-256(ts || nonce) has >= difficulty leading
// zero bits. This is primarily for testing; the real solver runs in the browser.
func Solve(difficulty int) string {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	for nonce := int64(0); nonce < math.MaxInt64; nonce++ {
		n := strconv.FormatInt(nonce, 10)
		preimage := ts + n
		hash := sha256.Sum256([]byte(preimage))
		if countLeadingZeroBits(hash) >= difficulty {
			return ts + "." + n
		}
	}
	return ""
}
