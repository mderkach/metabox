//go:build integration

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/contract"
)

func TestInterceptionScopeOnEphemeralBench(t *testing.T) {
	requireEphemeralBench(t)
	config := benchRequest(t, http.MethodGet, "/api/config", nil, http.StatusOK)
	base, stale := benchScope(t)
	if !base.Enabled || base.AccessMode != contract.AccessListed || !slices.Equal(base.SourceIP, []string{"192.168.210.40/32"}) ||
		!slices.Equal(base.SourceMAC, []string{"02:00:00:00:d2:2a"}) {
		t.Fatal("unexpected interception fixture")
	}
	original := benchExec(t, nil, "cat", "/etc/config/metabox")
	defer func() {
		benchExec(t, nil, "/etc/init.d/metaboxd", "stop")
		benchExec(t, nil, "rm", "-f", "/etc/metabox/dataplane.json")
		benchExec(t, original, "sh", "-ec", "cat > /etc/config/metabox; /etc/init.d/metabox-singbox reload; /etc/init.d/metaboxd start")
		waitBenchReady(t)
	}()

	benchExec(t, nil, "uci", "add_list", "metabox.dataplane.owner_list=only entry")
	benchExec(t, nil, "uci", "commit", "metabox")
	base, tag := benchScope(t)
	selected := base
	selected.SourceMAC = append(slices.Clone(base.SourceMAC), "02:00:00:00:d2:29")

	putBenchScope(t, selected, stale, http.StatusPreconditionFailed)
	tx := putBenchScope(t, selected, tag, http.StatusAccepted)
	waitScopePhase(t, tx.ID, apply.PhaseAwaitingConfirm)
	putBenchScope(t, base, tag, http.StatusConflict)
	benchRequest(t, http.MethodPost, "/api/dataplane/apply/"+tx.ID+"/confirm", nil, http.StatusOK)
	waitScopePhase(t, tx.ID, apply.PhaseConfirmed)
	confirmedTag := assertBenchScope(t, selected, config)
	confirmedUCI := benchExec(t, nil, "uci", "export", "metabox")
	t.Logf("confirmed: listed IPs %v, MACs %v; nft source set and selection chain verified; UCI SHA256 %x; sing-box config SHA256 %x",
		selected.SourceIP, selected.SourceMAC, sha256.Sum256(confirmedUCI), sha256.Sum256(config))

	all := selected
	all.AccessMode = contract.AccessAll
	tx = putBenchScope(t, all, confirmedTag, http.StatusAccepted)
	waitScopePhase(t, tx.ID, apply.PhaseAwaitingConfirm)
	assertBenchScope(t, all, config)
	t.Log("awaiting_confirm: all devices; checked the applied model and unconditional nft chain")
	waitScopePhase(t, tx.ID, apply.PhaseRolledBack)
	if got := assertBenchScope(t, selected, config); got != confirmedTag {
		t.Fatalf("restored ETag %q, want %q", got, confirmedTag)
	}
	restoredUCI := benchExec(t, nil, "uci", "export", "metabox")
	if !bytes.Equal(confirmedUCI, restoredUCI) {
		t.Fatal("UCI export differs after rollback")
	}
	t.Logf("rolled_back after timeout: listed IPs %v, MACs %v; nft source set and selection chain verified; UCI SHA256 %x; sing-box config SHA256 %x",
		selected.SourceIP, selected.SourceMAC, sha256.Sum256(restoredUCI), sha256.Sum256(config))
}

func benchScope(t *testing.T) (contract.Model, string) {
	t.Helper()
	body, tag, status := benchHTTP(t, http.MethodGet, "/api/dataplane", nil, "")
	if status != http.StatusOK || tag == "" {
		t.Fatalf("GET dataplane: status %d, ETag %q", status, tag)
	}
	var plane contract.Dataplane
	decodeBench(t, body, &plane)
	if !plane.Applied {
		t.Fatalf("dataplane is not installed (%s)", plane.AppliedReason)
	}
	return plane.Model, tag
}

func putBenchScope(t *testing.T, model contract.Model, tag string, want int) apply.Transaction {
	t.Helper()
	data, err := json.Marshal(contract.DataplaneChange{Model: model})
	if err != nil {
		t.Fatal(err)
	}
	body, _, status := benchHTTP(t, http.MethodPut, "/api/dataplane", data, tag)
	if status != want {
		t.Fatalf("PUT dataplane: status %d, want %d", status, want)
	}
	var tx apply.Transaction
	if status == http.StatusAccepted {
		decodeBench(t, body, &tx)
		if tx.ID == "" {
			t.Fatal("missing dataplane transaction ID")
		}
	}
	return tx
}

func waitScopePhase(t *testing.T, id string, phase apply.Phase) {
	t.Helper()
	waitBench(t, 90*time.Second, "dataplane "+string(phase), func() bool {
		var tx apply.Transaction
		decodeBench(t, benchRequest(t, http.MethodGet, "/api/dataplane/apply/"+id, nil, http.StatusOK), &tx)
		if tx.Phase == apply.PhaseFailed || tx.Phase == apply.PhaseRolledBack && phase != apply.PhaseRolledBack {
			t.Fatalf("unexpected dataplane phase %s: %s", tx.Phase, tx.Reason)
		}
		return tx.Phase == phase
	})
}

func assertBenchScope(t *testing.T, want contract.Model, config []byte) string {
	t.Helper()
	got, tag := benchScope(t)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("applied dataplane %+v, want %+v", got, want)
	}
	chain := string(benchExec(t, nil, "nft", "list", "chain", "inet", "fw4", "metabox_redirect_lanac"))
	listed := strings.Contains(chain, "ether saddr @metabox_src_mac ")
	if !strings.Contains(chain, "goto metabox_redirect") || listed != (want.AccessMode == contract.AccessListed) {
		t.Fatalf("unexpected redirect chain for %s: %s", want.AccessMode, chain)
	}
	set := string(benchExec(t, nil, "nft", "list", "set", "inet", "fw4", "metabox_src_mac"))
	for _, mac := range want.SourceMAC {
		if !strings.Contains(set, mac) {
			t.Fatalf("nft source set missing %s", mac)
		}
	}
	export := benchExec(t, nil, "uci", "export", "metabox")
	if !bytes.Contains(export, []byte("list owner_list 'only entry'")) {
		t.Fatal("foreign singleton UCI list was changed")
	}
	assertBenchConfig(t, config)
	return tag
}
