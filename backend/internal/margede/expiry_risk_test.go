package margede

import (
	"testing"
	"time"
)

func TestBatchRisks(t *testing.T) {
	today := time.Date(2026, 10, 22, 0, 0, 0, 0, time.UTC)
	day := func(n int) *time.Time { d := today.AddDate(0, 0, n); return &d }
	rate := 10.0
	perDay := 365.0 / 12 // a monthly average that sells exactly 1 unit a day

	got := batchRisks([]stockBatch{
		{id: 1, expiry: day(-3), stock: 4},                       // already expired
		{id: 2, expiry: day(10), stock: 5, purchaseRate: &rate},  // sells out on day 5
		{id: 3, expiry: day(20), stock: 30, purchaseRate: &rate}, // from day 5 to day 20: 15 sold, 15 left
		{id: 4, expiry: nil, stock: 10},                          // undated
	}, perDay, 0, today)

	want := []struct {
		status string
		risk   float64
	}{{"expired", 0}, {"ok", 0}, {"at_risk", 15}, {"no_expiry", 0}}
	for i, w := range want {
		if got[i].Status != w.status || got[i].RiskQty != w.risk {
			t.Errorf("batch %d: got %s risk %v, want %s risk %v", i, got[i].Status, got[i].RiskQty, w.status, w.risk)
		}
	}
	if got[2].RiskValue != 150 {
		t.Errorf("risk value = %v, want 150", got[2].RiskValue)
	}
	if got[1].SellsOutBy == nil || !got[1].SellsOutBy.Equal(*day(5)) {
		t.Errorf("batch 2 sells out by %v, want day 5", got[1].SellsOutBy)
	}

	// A shelf life moves every deadline earlier: with 8 days, batch 2 has
	// 2 days (2 sold, 3 left) and batch 3 has 12 − 2 = 10 days.
	got = batchRisks([]stockBatch{
		{id: 2, expiry: day(10), stock: 5},
		{id: 3, expiry: day(20), stock: 30},
	}, perDay, 8, today)
	if got[0].RiskQty != 3 || got[1].RiskQty != 20 {
		t.Errorf("with shelf life: risks %v and %v, want 3 and 20", got[0].RiskQty, got[1].RiskQty)
	}

	// Nothing sold lately: every dated unit is at risk.
	got = batchRisks([]stockBatch{{id: 5, expiry: day(400), stock: 7}}, 0, 90, today)
	if got[0].Status != "at_risk" || got[0].RiskQty != 7 {
		t.Errorf("no sales: got %s risk %v, want at_risk 7", got[0].Status, got[0].RiskQty)
	}
}
