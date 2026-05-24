package pow

import (
	"strconv"
	"testing"
	"time"
)

func TestVerify_Valid(t *testing.T) {
	cache := NewReplayCache(120 * time.Second)
	defer cache.Close()

	token := Solve(4)
	if token == "" {
		t.Fatal("Solve returned empty token")
	}

	if err := Verify(token, 4, 60*time.Second, cache); err != nil {
		t.Fatalf("expected valid token, got: %v", err)
	}
}

func TestVerify_Replay(t *testing.T) {
	cache := NewReplayCache(120 * time.Second)
	defer cache.Close()

	token := Solve(4)
	if err := Verify(token, 4, 60*time.Second, cache); err != nil {
		t.Fatalf("first verify failed: %v", err)
	}

	if err := Verify(token, 4, 60*time.Second, cache); err != ErrReplayed {
		t.Fatalf("expected ErrReplayed, got: %v", err)
	}
}

func TestVerify_Expired(t *testing.T) {
	cache := NewReplayCache(120 * time.Second)
	defer cache.Close()

	// Use a timestamp far in the past.
	ts := strconv.FormatInt(time.Now().Add(-5*time.Minute).Unix(), 10)
	token := ts + ".0"
	if err := Verify(token, 0, 60*time.Second, cache); err != ErrExpired {
		t.Fatalf("expected ErrExpired, got: %v", err)
	}
}

func TestVerify_InsufficientDifficulty(t *testing.T) {
	cache := NewReplayCache(120 * time.Second)
	defer cache.Close()

	// Solve at difficulty 0 (trivial), then verify at difficulty 64 (extremely hard).
	token := Solve(0)
	if err := Verify(token, 64, 60*time.Second, cache); err != ErrDifficulty {
		t.Fatalf("expected ErrDifficulty, got: %v", err)
	}
}

func TestVerify_InvalidFormat(t *testing.T) {
	cache := NewReplayCache(120 * time.Second)
	defer cache.Close()

	cases := []string{"", "noperiod", ".nonce", "123.", "abc.def"}
	for _, tc := range cases {
		if err := Verify(tc, 0, 60*time.Second, cache); err != ErrInvalidFormat {
			t.Errorf("Verify(%q) = %v, want ErrInvalidFormat", tc, err)
		}
	}
}

func TestCountLeadingZeroBits(t *testing.T) {
	tests := []struct {
		input [32]byte
		want  int
	}{
		{[32]byte{0xFF}, 0},
		{[32]byte{0x00, 0xFF}, 8},
		{[32]byte{0x00, 0x00, 0x0F}, 20},
		{[32]byte{0x00, 0x00, 0x00, 0x01}, 31},
		{[32]byte{}, 256},
	}
	for _, tt := range tests {
		if got := countLeadingZeroBits(tt.input); got != tt.want {
			t.Errorf("countLeadingZeroBits(%x) = %d, want %d", tt.input[:4], got, tt.want)
		}
	}
}

func TestSolve_ZeroDifficulty(t *testing.T) {
	token := Solve(0)
	if token == "" {
		t.Fatal("Solve(0) should always succeed")
	}
}
