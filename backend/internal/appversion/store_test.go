package appversion

import "testing"

func TestInputValidate(t *testing.T) {
	ok := []Input{
		{},
		{LatestBuild: 26, MinBuild: 24, UpdateURL: " https://play.google.com/store/apps/details?id=x "},
		{LatestBuild: 26, MinBuild: 26},
	}
	for _, in := range ok {
		if err := in.Validate(); err != nil {
			t.Errorf("%+v: unexpected %v", in, err)
		}
	}
	bad := []Input{
		{LatestBuild: 24, MinBuild: 25},
		{LatestBuild: -1},
		{LatestBuild: 26, UpdateURL: "http://example.com"},
	}
	for _, in := range bad {
		if err := in.Validate(); err == nil {
			t.Errorf("%+v: accepted", in)
		}
	}
}
