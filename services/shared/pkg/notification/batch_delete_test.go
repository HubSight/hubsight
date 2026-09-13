package notification

import (
	"reflect"
	"testing"
)

func TestNormalizeNotificationIDs(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{
			name: "empty input",
			raw:  "",
			want: []string{},
		},
		{
			name: "whitespace and empty values",
			raw:  " first, ,second ,, ",
			want: []string{"first", "second"},
		},
		{
			name: "duplicate values preserve first occurrence order",
			raw:  "first,second,first,second,third",
			want: []string{"first", "second", "third"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeNotificationIDs(tt.raw)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("normalizeNotificationIDs(%q) = %#v, want %#v", tt.raw, got, tt.want)
			}
		})
	}
}
