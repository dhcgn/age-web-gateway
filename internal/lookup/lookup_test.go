package lookup

import (
	"testing"
)

func TestMatchRecords_ExactMatch(t *testing.T) {
	records := []Record{
		{Match: "domain.de", Delivery: "catchall@domain.de", AgeKey: "age1key1"},
		{Match: "user@domain.de", Delivery: "", AgeKey: "age1key2"},
	}

	matched := matchRecords(records, "user@domain.de", "domain.de")
	if len(matched) != 1 || matched[0].AgeKey != "age1key2" {
		t.Fatalf("expected exact match for user@domain.de, got %+v", matched)
	}
}

func TestMatchRecords_CatchAllFallback(t *testing.T) {
	records := []Record{
		{Match: "domain.de", Delivery: "catchall@domain.de", AgeKey: "age1key1"},
	}

	matched := matchRecords(records, "unknown@domain.de", "domain.de")
	if len(matched) != 1 || matched[0].AgeKey != "age1key1" {
		t.Fatalf("expected catch-all fallback, got %+v", matched)
	}
}

func TestMatchRecords_BareDomain(t *testing.T) {
	records := []Record{
		{Match: "domain.de", Delivery: "catchall@domain.de", AgeKey: "age1key1"},
		{Match: "user@domain.de", Delivery: "", AgeKey: "age1key2"},
	}

	matched := matchRecords(records, "domain.de", "domain.de")
	if len(matched) != 1 || matched[0].AgeKey != "age1key1" {
		t.Fatalf("expected bare domain match, got %+v", matched)
	}
}

func TestMatchRecords_MultipleKeys(t *testing.T) {
	records := []Record{
		{Match: "user@domain.de", Delivery: "", AgeKey: "age1classic"},
		{Match: "user@domain.de", Delivery: "", AgeKey: "age1pq1hybrid"},
	}

	matched := matchRecords(records, "user@domain.de", "domain.de")
	if len(matched) != 2 {
		t.Fatalf("expected 2 matched records, got %d", len(matched))
	}

	keys := collectKeys(matched)
	if len(keys) != 2 {
		t.Fatalf("expected 2 unique keys, got %d", len(keys))
	}
}

func TestMatchRecords_NoMatch(t *testing.T) {
	records := []Record{
		{Match: "other@domain.de", Delivery: "", AgeKey: "age1key"},
	}

	matched := matchRecords(records, "user@domain.de", "domain.de")
	if len(matched) != 0 {
		t.Fatalf("expected no match, got %+v", matched)
	}
}

func TestResolveDelivery(t *testing.T) {
	tests := []struct {
		name      string
		rec       Record
		recipient string
		want      string
	}{
		{
			name:      "explicit delivery",
			rec:       Record{Match: "domain.de", Delivery: "catchall@domain.de"},
			recipient: "user@domain.de",
			want:      "catchall@domain.de",
		},
		{
			name:      "empty delivery, full address match",
			rec:       Record{Match: "user@domain.de", Delivery: ""},
			recipient: "user@domain.de",
			want:      "user@domain.de",
		},
		{
			name:      "empty delivery, bare domain match, full recipient",
			rec:       Record{Match: "domain.de", Delivery: ""},
			recipient: "user@domain.de",
			want:      "user@domain.de",
		},
		{
			name:      "empty delivery, bare domain",
			rec:       Record{Match: "domain.de", Delivery: ""},
			recipient: "domain.de",
			want:      "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveDelivery(tt.rec, tt.recipient); got != tt.want {
				t.Errorf("resolveDelivery = %q, want %q", got, tt.want)
			}
		})
	}
}
