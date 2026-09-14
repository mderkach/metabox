package httpapi

import (
	"net"
	"testing"
)

func TestAddrs(t *testing.T) {
	tests := []struct {
		name string
		spec string
		want []string
	}{
		{"один адрес", "192.168.1.1:8088", []string{"192.168.1.1:8088"}},
		{"несколько адресов", "192.168.1.1:8088,192.168.2.1:8088", []string{"192.168.1.1:8088", "192.168.2.1:8088"}},
		{"пробелы вокруг запятой", "192.168.1.1:8088, 10.0.0.1:8088", []string{"192.168.1.1:8088", "10.0.0.1:8088"}},
		{"хвостовая запятая", "192.168.1.1:8088,", []string{"192.168.1.1:8088"}},
		{"пусто", "", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Addrs(tt.spec)

			if len(got) != len(tt.want) {
				t.Fatalf("получили %v, ожидали %v", got, tt.want)
			}

			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("адрес %d: получили %q, ожидали %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// Панель обязана подняться на тех интерфейсах, что уже есть: у роутера сети
// поднимаются вразнобой, и адрес гостевой сети может появиться позже демона.
func TestListenSurvivesUnavailableAddress(t *testing.T) {
	free := freePort(t)

	listeners, failures, err := Listen([]string{"127.0.0.1:" + free, "203.0.113.1:" + free})
	if err != nil {
		t.Fatalf("демон не поднялся из-за одного недоступного адреса: %v", err)
	}

	t.Cleanup(func() {
		for _, listener := range listeners {
			if err := listener.Close(); err != nil {
				t.Error(err)
			}
		}
	})

	if len(listeners) != 1 {
		t.Errorf("открыто слушателей %d, ожидали 1", len(listeners))
	}
	if len(failures) != 1 {
		t.Errorf("недоступный адрес не попал в отказы: %v", failures)
	}
}

func TestListenFailsWhenNothingOpened(t *testing.T) {
	if _, _, err := Listen([]string{"203.0.113.1:8088"}); err == nil {
		t.Error("демон поднялся, не открыв ни одного адреса")
	}
}

func TestListenRejectsEmptyList(t *testing.T) {
	if _, _, err := Listen(nil); err == nil {
		t.Error("пустой список адресов принят")
	}
}

func freePort(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}

	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}

	return port
}
