package singbox

import (
	"strconv"
	"strings"
	"testing"
)

const crashLog = `Mon Sep 14 20:08:30 2026 daemon.notice procd: /etc/rc.d/S99sing-box: starting
Mon Sep 14 20:08:31 2026 daemon.err dnsmasq[912]: failed to bind socket
Mon Sep 14 20:08:32 2026 daemon.err sing-box[3093]: ` + "\x1b[31mFATAL\x1b[0m" + `[0000] start service: default outbound not found: no-such-outbound
Mon Sep 14 20:08:37 2026 daemon.err sing-box[3136]: ` + "\x1b[31mFATAL\x1b[0m" + `[0000] start service: default outbound not found: no-such-outbound
Mon Sep 14 20:08:42 2026 daemon.info procd: Instance sing-box::sing-box s in a crash loop 6 crashes`

func TestLastFailureTakesTheProcessMessage(t *testing.T) {
	got := lastFailure(crashLog, "sing-box")

	if got != "FATAL[0000] start service: default outbound not found: no-such-outbound" {
		t.Errorf("получили %q", got)
	}
}

// Логгер роутера пишет вперемешку: чужая ошибка в причине падения sing-box
// отправила бы владельца чинить не то.
func TestLastFailureIgnoresOtherServices(t *testing.T) {
	if strings.Contains(lastFailure(crashLog, "sing-box"), "dnsmasq") {
		t.Error("в причину попала чужая служба")
	}
}

// Под procd упавший сервис перезапускается по кругу, и лог состоит из копий
// одной строки: показывать их десятками незачем.
func TestLastFailureCollapsesRepeats(t *testing.T) {
	if lines := strings.Count(lastFailure(crashLog, "sing-box"), "\n"); lines != 0 {
		t.Errorf("строк в причине %d, ожидали одну", lines+1)
	}
}

func TestLastFailureKeepsSeveralDistinctMessages(t *testing.T) {
	log := `Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: ERROR первая беда
Mon Sep 14 20:08:33 2026 daemon.err sing-box[1]: FATAL вторая беда`

	if got := lastFailure(log, "sing-box"); got != "ERROR первая беда\nFATAL вторая беда" {
		t.Errorf("получили %q", got)
	}
}

// В логе остаются и обычные сообщения запуска: причиной падения они не
// являются и в панель идти не должны.
func TestLastFailureSkipsHealthyLines(t *testing.T) {
	log := `Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: NOTICE inbound/mixed[mixed-in]: tcp server started
Mon Sep 14 20:08:33 2026 daemon.err sing-box[1]: INFO sing-box started`

	if got := lastFailure(log, "sing-box"); got != "" {
		t.Errorf("в причину попало штатное сообщение: %q", got)
	}
}

func TestLastFailureKeepsOnlyLastMessages(t *testing.T) {
	var log strings.Builder

	for i := range 10 {
		log.WriteString("Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: FATAL беда ")
		log.WriteString(strconv.Itoa(i))
		log.WriteString("\n")
	}

	got := lastFailure(log.String(), "sing-box")

	if lines := strings.Count(got, "\n") + 1; lines != failureLines {
		t.Errorf("строк %d, ожидали %d", lines, failureLines)
	}
	if !strings.HasSuffix(got, "беда 9") {
		t.Errorf("последнее сообщение потеряно: %q", got)
	}
}

func TestLastFailureClampsLongOutput(t *testing.T) {
	log := "Mon Sep 14 20:08:32 2026 daemon.err sing-box[1]: FATAL " + strings.Repeat("я", failureLimit*2)

	if got := lastFailure(log, "sing-box"); len([]byte(got)) > failureLimit+len("…") {
		t.Errorf("длина причины %d, потолок %d", len(got), failureLimit)
	}
}

func TestLastFailureOnEmptyLog(t *testing.T) {
	if got := lastFailure("", "sing-box"); got != "" {
		t.Errorf("получили %q", got)
	}
}
