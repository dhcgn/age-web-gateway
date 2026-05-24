package lookup

import (
	"testing"
)

func TestParseRecord(t *testing.T) {
	tests := []struct {
		name    string
		line    string
		want    Record
		wantErr bool
	}{
		{
			name: "full entry",
			line: "domain.de;catchall@domain.de;age1abc123",
			want: Record{Match: "domain.de", Delivery: "catchall@domain.de", AgeKey: "age1abc123"},
		},
		{
			name: "user with empty delivery",
			line: "user@domain.de;;age1abc123",
			want: Record{Match: "user@domain.de", Delivery: "", AgeKey: "age1abc123"},
		},
		{
			name: "whitespace trimmed",
			line: "  domain.de ; catchall@domain.de ; age1abc123  ",
			want: Record{Match: "domain.de", Delivery: "catchall@domain.de", AgeKey: "age1abc123"},
		},
		{
			name:    "comment line",
			line:    "# this is a comment",
			wantErr: true,
		},
		{
			name:    "empty line",
			line:    "",
			wantErr: true,
		},
		{
			name:    "missing fields",
			line:    "domain.de;age1abc123",
			wantErr: true,
		},
		{
			name:    "invalid key prefix",
			line:    "domain.de;x@y.de;notanagekey",
			wantErr: true,
		},
		{
			name:    "empty match",
			line:    ";delivery@x.de;age1abc",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseRecord(tt.line)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseRecord(%q) err=%v, wantErr=%v", tt.line, err, tt.wantErr)
			}
			if err == nil && got != tt.want {
				t.Errorf("ParseRecord(%q) = %+v, want %+v", tt.line, got, tt.want)
			}
		})
	}
}

func TestParseRecords(t *testing.T) {
	body := `# domain default
domain.de;catchall@domain.de;age1key1
# user
user@domain.de;;age1key2
# another user
user1@domain.de;relay@domain.de;age1key3

# blank lines above are skipped
`
	records := ParseRecords(body)
	if len(records) != 3 {
		t.Fatalf("got %d records, want 3", len(records))
	}
	if records[0].Match != "domain.de" {
		t.Errorf("records[0].Match = %q, want domain.de", records[0].Match)
	}
	if records[1].Match != "user@domain.de" {
		t.Errorf("records[1].Match = %q, want user@domain.de", records[1].Match)
	}
	if records[2].Delivery != "relay@domain.de" {
		t.Errorf("records[2].Delivery = %q, want relay@domain.de", records[2].Delivery)
	}
}

func TestDomainOf(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"user@domain.de", "domain.de"},
		{"domain.de", "domain.de"},
		{"a@b@c.de", "c.de"},
	}
	for _, tt := range tests {
		if got := DomainOf(tt.input); got != tt.want {
			t.Errorf("DomainOf(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestIsFullAddress(t *testing.T) {
	if !IsFullAddress("user@domain.de") {
		t.Error("expected true for user@domain.de")
	}
	if IsFullAddress("domain.de") {
		t.Error("expected false for domain.de")
	}
}
