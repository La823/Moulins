package dispatch

import "testing"

func TestNextInTurn(t *testing.T) {
	team := []Packer{{ID: "a"}, {ID: "c"}, {ID: "e"}}
	s := func(v string) *string { return &v }
	cases := []struct {
		name string
		last *string
		want string
	}{
		{"nobody assigned yet", nil, "a"},
		{"after the first", s("a"), "c"},
		{"after the middle", s("c"), "e"},
		{"wraps after the last", s("e"), "a"},
		// the last one assigned is absent today: the next one after them
		{"last is out today", s("b"), "c"},
		{"last was after everyone", s("z"), "a"},
	}
	for _, c := range cases {
		if got := nextInTurn(team, c.last).ID; got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}
