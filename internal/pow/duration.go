package pow

import "time"

// ValidityDuration converts seconds to time.Duration.
func ValidityDuration(seconds int) time.Duration {
	return time.Duration(seconds) * time.Second
}
