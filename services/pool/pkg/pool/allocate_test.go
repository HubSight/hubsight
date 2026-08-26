package pool

import "testing"

func TestPickReusableLiveConnPacksOntoFullestSlot(t *testing.T) {
	p := &CameraPool{
		LivePool: map[string]*StreamConnection{
			"a": {StreamName: "a", ActiveUsers: 1, MaxUsers: LiveMaxClientsPerConn},
			"b": {StreamName: "b", ActiveUsers: 4, MaxUsers: LiveMaxClientsPerConn},
			"c": {StreamName: "c", ActiveUsers: 5, MaxUsers: LiveMaxClientsPerConn},
		},
	}
	got := pickReusableLiveConn(p)
	if got == nil || got.StreamName != "b" {
		t.Fatalf("want fullest non-full conn b (4/5), got %#v", got)
	}
}

func TestPickReusableLiveConnNilWhenAllFull(t *testing.T) {
	p := &CameraPool{
		LivePool: map[string]*StreamConnection{
			"a": {StreamName: "a", ActiveUsers: 5, MaxUsers: LiveMaxClientsPerConn},
			"b": {StreamName: "b", ActiveUsers: 5, MaxUsers: LiveMaxClientsPerConn},
		},
	}
	if got := pickReusableLiveConn(p); got != nil {
		t.Fatalf("expected no reusable conn when all full, got %s", got.StreamName)
	}
}

func TestPickReusableLiveConnEmptyPool(t *testing.T) {
	p := &CameraPool{LivePool: map[string]*StreamConnection{}}
	if got := pickReusableLiveConn(p); got != nil {
		t.Fatalf("empty live pool should spawn new, got %s", got.StreamName)
	}
}
