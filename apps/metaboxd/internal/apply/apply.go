// Package apply runs a config through the apply protocol: candidate check
// by the binary, backup, write, service restart, healthcheck, confirmation
// window and automatic rollback if there was no confirmation.
//
// The package does not parse the config content: it is an orchestrator, and decisions about bytes
// are made by config and clashapi.
package apply

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/locale"
	"metabox/internal/procd"
)

// Phase is the transaction stage. The values go to the API and to disk, so
// renaming any of them breaks both the client and the replay after
// a reboot.
type Phase string

const (
	// PhaseApplying means the backup is taken and the state is written, the config is being
	// applied. An interruption at this stage means a rollback at the next start, and the
	// backup it restores is this transaction's: the state reaches the disk only after it.
	PhaseApplying Phase = "applying"
	// PhaseAwaitingConfirm means the service is up, the confirmation window is open.
	PhaseAwaitingConfirm Phase = "awaiting_confirm"
	// PhaseConfirmed means the user confirmed that the connection is alive.
	PhaseConfirmed Phase = "confirmed"
	// PhaseRolledBack means the previous config is restored.
	PhaseRolledBack Phase = "rolled_back"
	// PhaseFailed means the apply did not finish, the cause is in Reason.
	PhaseFailed Phase = "failed"
)

// ReasonCode is the step at which the cycle stopped. The set is closed: the panel
// picks the text in the user's language by the code, while Reason stays as a detail for
// the one who fixes it: it holds the original step error.
type ReasonCode string

const (
	// ReasonBackupFailed means the previous config was not saved, and there would be nothing
	// to roll back to; the cycle did not reach the write.
	ReasonBackupFailed ReasonCode = "backup_failed"
	// ReasonWriteFailed means the config was not written to the device.
	ReasonWriteFailed ReasonCode = "write_failed"
	// ReasonRestartFailed means the service did not restart with the new config.
	ReasonRestartFailed ReasonCode = "restart_failed"
	// ReasonHealthcheckFailed means the service came up but the runtime did not answer.
	ReasonHealthcheckFailed ReasonCode = "healthcheck_failed"
	// ReasonDNSProbeFailed means the Clash API answered but the dns-in of the new config did not
	// resolve the probe name: DNS of the network through sing-box does not work.
	ReasonDNSProbeFailed ReasonCode = "dns_probe_failed"
	// ReasonInterceptionMissing means interception was enabled and in place before the restart, and after
	// it there are no dataplane chains in nft: LAN traffic bypasses sing-box.
	ReasonInterceptionMissing ReasonCode = "interception_missing"
	// ReasonRollbackFailed means restoring the previous config failed. This is the worst
	// outcome of the cycle, and the device is left with a foreign config.
	ReasonRollbackFailed ReasonCode = "rollback_failed"
	// ReasonNoBackup means a rollback was needed but there is nothing to restore: the device had
	// neither a config nor list files before the apply. The service stays on what managed to
	// be written and is not restarted.
	ReasonNoBackup ReasonCode = "no_backup"
	// ReasonListsRestored means a rollback was needed, and the device had list files but no
	// config before the apply: the list files are returned, the written config stays, and the
	// service is not restarted.
	ReasonListsRestored ReasonCode = "lists_restored"
)

// StepError is a cycle step failure: the code goes to the panel, the original error goes to the log and
// to the details.
type StepError struct {
	Code ReasonCode
	Err  error
}

func (e *StepError) Error() string { return e.Err.Error() }

func (e *StepError) Unwrap() error { return e.Err }

// In returns the step error in the language l: it becomes Transaction.Reason.
func (e *StepError) In(l locale.Lang) string { return locale.Message(l, e.Err) }

// stepFailed wraps a step error into a code. A separate function so that steps
// read uniformly and the code is not lost on wrapping.
func stepFailed(code ReasonCode, err error) error {
	return &StepError{Code: code, Err: err}
}

// reasonOf extracts the step code. An error without a code is a failure the cycle did not expect:
// it stays with an empty code, and the panel shows the error text as is.
func reasonOf(err error) ReasonCode {
	if step, ok := errors.AsType[*StepError](err); ok {
		return step.Code
	}

	return ""
}

// Transaction is a snapshot of an apply. It is also the state file format: what the
// daemon gives to the client and what it replays itself from after a reboot.
type Transaction struct {
	ID    string `json:"id"`
	Phase Phase  `json:"phase"`
	// Window is how much is left for confirmation. Stored as a duration, not as
	// a timestamp: the router has no real-time clock, after power-on it
	// starts from the epoch and jumps on NTP synchronization.
	Window time.Duration `json:"window"`
	// Sum is the sha256 of the config written by the daemon. It catches an edit of the file
	// from outside.
	Sum string `json:"sha256,omitempty"`
	// Lists is the sha256 of the list files the transaction writes: name →
	// fingerprint of the new content. Only the files that really change: by
	// a fingerprint match the replay judges whether the write has started.
	Lists map[string]string `json:"lists,omitempty"`
	// RemovedLists are the list files the transaction removes; at the moment
	// of the start they existed.
	RemovedLists []string `json:"removed_lists,omitempty"`
	// ReasonCode is the step at which the cycle stopped. Empty if the apply succeeded or
	// the failure is not tied to a step.
	ReasonCode ReasonCode `json:"reason_code,omitempty"`
	// Reason is filled when the apply did not finish: the original error
	// of the step as the daemon recorded it. Showing it to the user is a fallback path,
	// the panel takes the failure text by ReasonCode.
	Reason string `json:"reason,omitempty"`
	// ClashAPIAdded marks that the daemon added the section itself.
	ClashAPIAdded bool `json:"clash_api_added,omitempty"`
}

// Active reports whether an apply is in progress right now.
func (t Transaction) Active() bool {
	return t.Phase == PhaseApplying || t.Phase == PhaseAwaitingConfirm
}

var (
	// ErrBusy means a second apply while a transaction is active. This is a contract
	// error, not a race for the file: the config has one owner.
	ErrBusy = locale.New("apply already in progress")

	// ErrUnknownTransaction means the identifier does not match the active transaction.
	ErrUnknownTransaction = locale.New("no transaction with this ID")

	// ErrNothingToConfirm means nothing to confirm, the window is already closed.
	ErrNothingToConfirm = locale.New("nothing to confirm")

	// ErrConfirmNotSaved means the disk refused both the removal of the state file and
	// its terminal record: the confirmation did not take, the window stays open and
	// the client may try again.
	ErrConfirmNotSaved = errors.New("confirmation not saved")

	// ErrConfigModified means the config was edited bypassing the daemon. Silently overwriting such an edit
	// is not allowed: the owner could have made it over SSH.
	ErrConfigModified = locale.New("config file changed outside metabox")

	// ErrListsModified means list files were edited bypassing the daemon; the failure class
	// is the same as for ErrConfigModified.
	ErrListsModified = locale.New("list files changed outside metabox")

	// ErrListName means the list file name does not fit the subdirectory: the path is built by
	// the panel, and anything else is an attempt to escape it or to collide with the config.
	ErrListName = locale.New("invalid list file name")
)

// WorkdirError means the service working directory does not match the config directory.
// The service resolves a relative path of a local node from the working directory, not from
// the config directory: it would not find the written list files, would crash after
// the restart, and the cycle would roll back on the healthcheck. The directories travel in the error because
// the hint on how to fix it is built from them.
type WorkdirError struct {
	Workdir   string
	ConfigDir string
}

func (e *WorkdirError) Error() string {
	return fmt.Sprintf("service working directory %s does not match the config directory %s", e.Workdir, e.ConfigDir)
}

// LaunchError means the service starts not on the config the daemon owns:
// a write would change nothing for it, and the check would verify not what
// will run. Configs and ConfigDirs are the -c and -C flags of the service command, Config is
// the daemon config path.
type LaunchError struct {
	Configs    []string
	ConfigDirs []string
	Config     string
}

func (e *LaunchError) Error() string {
	return fmt.Sprintf("the service starts with %q and %q, not with the config %s", e.Configs, e.ConfigDirs, e.Config)
}

// Lists are the list file changes that travel with an apply: put is written into the
// lists subdirectory, remove is deleted from it. Both are applied by the same transaction
// as the config: check, write, rollback and replay are shared.
type Lists struct {
	Put    map[string][]byte
	Remove []string
}

// empty reports whether there is anything in the changes at all.
func (l Lists) empty() bool {
	return len(l.Put) == 0 && len(l.Remove) == 0
}

// Store is the files owned by config.Store. The interface is declared here,
// at the consumer, and contains only what apply needs.
type Store interface {
	Sum(ctx context.Context) (string, error)
	Read(ctx context.Context) ([]byte, error)
	Write(ctx context.Context, data []byte) error
	Backup(ctx context.Context) error
	SaveVersion(ctx context.Context, data []byte) error
	Restore(ctx context.Context) error
	StageCandidate(ctx context.Context, dst string, data []byte, putLists map[string][]byte, removeLists []string) error
	ListSums(ctx context.Context) (map[string]string, error)
	WriteLists(ctx context.Context, put map[string][]byte, remove []string) error
	ReadState(ctx context.Context) ([]byte, error)
	WriteState(ctx context.Context, data []byte) error
	ClearState(ctx context.Context) error
}

// Service is the sing-box binary and its service.
type Service interface {
	// Check checks a candidate: config is the config file (-c), empty means the whole
	// dir directory (-C); workdir is the base of relative paths (-D).
	Check(ctx context.Context, dir, config, workdir string) error
	Restart(ctx context.Context) error
	// Launch is what procd starts the service with; empty fields mean nowhere to learn it from.
	Launch(ctx context.Context) (procd.Launch, error)
	// PID returns the pid of the service process that is up; zero means none is up.
	PID(ctx context.Context) (int, error)
}

// Health waits until the Clash API comes up after a restart.
type Health interface {
	Wait(ctx context.Context, settings clashapi.Settings) error
}

// Dataplane reads the dataplane model and the flag that it is applied.
type Dataplane interface {
	Model(ctx context.Context) (dataplane.Model, error)
	Applied(ctx context.Context) (bool, dataplane.AppliedReason, error)
}

// DNSProber sends a DNS query to the dns-in of the running sing-box.
type DNSProber interface {
	Probe(ctx context.Context, inbound clashapi.DNSInbound) error
}

// stateTimeout bounds the state file write that finishes a confirmation. It runs
// detached from the request, so the request deadline no longer limits it.
const stateTimeout = 10 * time.Second

// Clock returns the confirmation window firing. A separate dependency, not
// a direct time call: otherwise the automatic rollback check turns into a minute of sleep.
type Clock interface {
	After(d time.Duration) <-chan time.Time
}

// SystemClock is a clock on top of the time package.
type SystemClock struct{}

// After returns a channel that fires after d.
func (SystemClock) After(d time.Duration) <-chan time.Time {
	return time.After(d)
}

// Options are the apply settings that come into the daemon as flags.
type Options struct {
	// Window is the confirmation window, one minute by default.
	Window time.Duration
	// ClashPort is the port the daemon writes into external_controller if
	// there is no section.
	ClashPort int
	// CycleTimeout limits the steps from the backup to the healthcheck.
	CycleTimeout time.Duration
	// ConfigDir is the config directory: the working directory and the -C flag of the
	// service command are compared with it.
	ConfigDir string
	// ConfigName is the config file name in ConfigDir: the -c flag is compared with it.
	ConfigName string
	// ProcessInterval is the pause between procd polls while after a restart we wait for
	// the new service process.
	ProcessInterval time.Duration
	// Dataplane is where the healthcheck takes the dns-in port and the interception flag from.
	// nil means the DNS probe and the interception check are skipped.
	Dataplane Dataplane
	// DNS is the dns-in probe; nil means disabled.
	DNS DNSProber
	// Lang is the language of Transaction.Reason; the zero value is English.
	Lang locale.Lang
}

// Manager is the only owner of the apply cycle.
type Manager struct {
	store   Store
	service Service
	health  Health
	clock   Clock
	log     *slog.Logger
	opts    Options

	mu sync.Mutex
	// busy closes the apply from the moment of reservation: the transaction
	// appears later, and before it a second Start would slip past the check.
	busy bool
	// epoch numbers the busy ownerships. The background goroutine releases the apply
	// by the number of its ownership: by its exit busy may already be held by the next
	// Start, and an unconditional release would let two applies in at once.
	epoch uint64
	// rollingBack closes Confirm for the duration of the rollback: the phase stays
	// awaiting_confirm until the end of Restore and Restart, and without this flag
	// a confirmation would wedge into a rollback already in progress.
	rollingBack bool
	// confirming closes a second Confirm and holds the timer rollback while the
	// terminal state is being written: the outcome of that write decides whether
	// there is anything left to roll back. confirmDone closes when it is known.
	confirming  bool
	confirmDone chan struct{}
	current     Transaction
	// lastSum is the sha256 of what the daemon wrote itself. It survives a restart through
	// the state file.
	lastSum string
	// lastListsSum is the fingerprint of the list file set after the daemon write.
	// It lives in memory only: after a restart the check is taken over by the client
	// base, as with the config.
	lastListsSum string
	// windowEndsAt is when the confirmation window closes. Stored as a Go monotonic
	// stamp and in memory only: the disk gets the duration, because the
	// router has no real-time clock and between daemon lifetimes there is nothing to compare
	// the stamp with.
	windowEndsAt time.Time
	confirmed    chan struct{}
	cancel       context.CancelFunc

	wg sync.WaitGroup
}

// New assembles the apply. The clock may be omitted, then the system one is used.
func New(store Store, service Service, health Health, clock Clock, log *slog.Logger, opts Options) *Manager {
	if clock == nil {
		clock = SystemClock{}
	}

	return &Manager{store: store, service: service, health: health, clock: clock, log: log, opts: opts}
}

// Current returns a snapshot of the current transaction. An empty phase means that
// there were no applies in this daemon lifetime.
//
// Window in the snapshot is the remainder of the window, not its duration: the panel shows this
// number to the user, and after a page reload a full sixty seconds
// would be a promise the daemon does not make.
func (m *Manager) Current() Transaction {
	m.mu.Lock()
	defer m.mu.Unlock()

	tx := m.current
	if tx.Phase == PhaseAwaitingConfirm && !m.windowEndsAt.IsZero() {
		tx.Window = max(0, time.Until(m.windowEndsAt))
	}

	return tx
}

// Start starts an apply. The binary check runs synchronously: the user fixes the config by its output,
// and the response to the request must contain it. Everything
// after it lives in its own context: the apply outlives the request.
//
// base is the sha256 of the config the client edited from; listsBase has the same
// meaning for the list file set (config.ListsEtag). An empty string means the
// client did not name a base. A named base is compared with the disk instead of the internal
// check: the client saw exactly this version, and its apply on top of it does not overwrite
// an outside edit.
func (m *Manager) Start(ctx context.Context, cfg []byte, lists Lists, base, listsBase string) (Transaction, error) {
	if err := validateLists(lists); err != nil {
		return Transaction{}, err
	}

	target, err := m.resolveCheck(ctx, len(lists.Put) > 0)
	if err != nil {
		return Transaction{}, err
	}

	prepared, added, err := clashapi.Ensure(cfg, m.opts.ClashPort)
	if err != nil {
		return Transaction{}, fmt.Errorf("ensure clash_api: %w", err)
	}

	settings, err := clashapi.Read(prepared)
	if err != nil {
		return Transaction{}, err
	}

	token, err := m.reserve(ctx, base, listsBase)
	if err != nil {
		return Transaction{}, err
	}

	// Changes are reduced to the files that really change: an unchanged one is not written,
	// and its match with the disk must not be read by the replay as
	// evidence of a started write.
	changed, removed, err := m.narrowLists(ctx, lists)
	if err != nil {
		m.unreserve(token)

		return Transaction{}, err
	}

	// A check failure creates no transaction: nothing was applied, and the verdict
	// of the binary goes to the caller with this same error.
	if err := m.check(ctx, prepared, changed, removed, target); err != nil {
		m.unreserve(token)

		return Transaction{}, err
	}

	tx := Transaction{
		ID:            rand.Text(),
		Phase:         PhaseApplying,
		Window:        m.opts.Window,
		Sum:           sum(prepared),
		Lists:         listSums(changed),
		RemovedLists:  removed,
		ClashAPIAdded: added,
	}

	m.begin(tx)
	m.run(tx, prepared, changed, removed, settings, token)

	return tx, nil
}

func validateLists(lists Lists) error {
	for name := range lists.Put {
		if !config.ValidListName(name) {
			return locale.Errorf("%w: %q", ErrListName, name)
		}
	}

	for _, name := range lists.Remove {
		if !config.ValidListName(name) {
			return locale.Errorf("%w: %q", ErrListName, name)
		}

		if _, ok := lists.Put[name]; ok {
			return locale.Errorf("%w: %q is both written and removed", ErrListName, name)
		}
	}

	return nil
}

// SnapshotLists are the changes that bring the lists directory to a version snapshot:
// snapshot files are written, current files beyond the snapshot are deleted. current is the sums
// of the current files, only the names matter. Names the apply would not accept
// are skipped: the daemon neither writes nor deletes a foreign file in the subdirectory, and
// restoring a version must not be refused because of it.
func SnapshotLists(snapshot map[string][]byte, current map[string]string) Lists {
	var lists Lists

	for name, data := range snapshot {
		if !config.ValidListName(name) {
			continue
		}

		if lists.Put == nil {
			lists.Put = make(map[string][]byte, len(snapshot))
		}

		lists.Put[name] = data
	}

	for name := range current {
		if _, ok := snapshot[name]; ok || !config.ValidListName(name) {
			continue
		}

		lists.Remove = append(lists.Remove, name)
	}

	slices.Sort(lists.Remove)

	return lists
}

// checkTarget is how to check a candidate: in the mode and from the path base with
// which procd will start the service, otherwise the check and runtime verdicts diverge.
type checkTarget struct {
	// directory: the service merges the config directory (-C), not reads a single file.
	directory bool
	// workdir is the service working directory outside the config directory; empty means the path
	// base is the candidate itself.
	workdir string
}

// resolveCheck compares the service command with the daemon config before the write: a mismatch
// would otherwise be found only by the service crashing on the new config or by checking not
// what will run. An unknown command does not stop the apply:
// procd may be absent and the service may never have started, and a refusal would then
// be false; the check runs the way the fork package starts the service, with one file.
//
// A working directory outside the config directory does not break the check: the transaction does not
// change it, and check takes it as the path base. A refusal only with list files:
// the service resolves a relative path of a local node from the working directory and
// would not find the written files.
func (m *Manager) resolveCheck(ctx context.Context, withLists bool) (checkTarget, error) {
	launch, err := m.service.Launch(ctx)
	if err != nil {
		m.log.Warn("service command not read, the candidate is checked as for the fork package", "err", err)

		launch = procd.Launch{}
	}

	var target checkTarget

	configPath := filepath.Join(m.opts.ConfigDir, m.opts.ConfigName)

	switch {
	case len(launch.Configs) == 0 && len(launch.ConfigDirs) == 0:
	case len(launch.ConfigDirs) == 0 && len(launch.Configs) == 1 && samePath(launch.Configs[0], configPath):
	case len(launch.Configs) == 0 && len(launch.ConfigDirs) == 1 && samePath(launch.ConfigDirs[0], m.opts.ConfigDir):
		target.directory = true
	default:
		return checkTarget{}, &LaunchError{Configs: launch.Configs, ConfigDirs: launch.ConfigDirs, Config: configPath}
	}

	if launch.Workdir == "" || samePath(launch.Workdir, m.opts.ConfigDir) {
		return target, nil
	}

	if withLists {
		return checkTarget{}, &WorkdirError{Workdir: launch.Workdir, ConfigDir: m.opts.ConfigDir}
	}

	// A nonexistent -D directory is created by sing-box itself, and a check from it
	// would leave a trace on the device before the write. The service will create it on restart,
	// and there are no relative paths in it anyway.
	if info, err := os.Stat(launch.Workdir); err != nil || !info.IsDir() {
		return target, nil
	}

	target.workdir = launch.Workdir

	return target, nil
}

// samePath compares paths by notation and, on mismatch, by the file itself:
// /proc/<pid>/cwd gives a path with symlinks resolved, and one directory under two
// names must not count as a refusal.
func samePath(a, b string) bool {
	// A relative path from the service command has nothing to be counted from: the daemon cwd
	// need not match the directory where procd starts the service.
	if !filepath.IsAbs(a) || !filepath.IsAbs(b) {
		return false
	}

	if filepath.Clean(a) == filepath.Clean(b) {
		return true
	}

	left, err := os.Stat(a)
	if err != nil {
		return false
	}

	right, err := os.Stat(b)
	if err != nil {
		return false
	}

	return os.SameFile(left, right)
}

// narrowLists reduces the changes to the really changing ones: writing a file with the same
// content and deleting a nonexistent one are empty actions.
func (m *Manager) narrowLists(ctx context.Context, lists Lists) (map[string][]byte, []string, error) {
	if lists.empty() {
		return nil, nil, nil
	}

	current, err := m.store.ListSums(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("compare lists: %w", err)
	}

	changed := make(map[string][]byte, len(lists.Put))

	for name, data := range lists.Put {
		if current[name] != sum(data) {
			changed[name] = data
		}
	}

	var removed []string

	for _, name := range lists.Remove {
		if _, ok := current[name]; ok {
			removed = append(removed, name)
		}
	}

	return changed, removed, nil
}

func listSums(files map[string][]byte) map[string]string {
	if len(files) == 0 {
		return nil
	}

	sums := make(map[string]string, len(files))
	for name, data := range files {
		sums[name] = sum(data)
	}

	return sums
}

// Confirm closes the confirmation window: the connection is alive, no rollback is needed.
// The state on disk is made terminal before the call returns, under a context detached
// from the request: a client that drops the request must not leave awaiting_confirm on
// disk, which Replay would roll back after a restart. ErrConfirmNotSaved means the disk
// refused both the removal and the terminal record; the window stays open.
func (m *Manager) Confirm(ctx context.Context, id string) (Transaction, error) {
	m.mu.Lock()

	if m.current.ID != id {
		m.mu.Unlock()

		return Transaction{}, ErrUnknownTransaction
	}
	if m.current.Phase != PhaseAwaitingConfirm || m.rollingBack || m.confirming {
		m.mu.Unlock()

		return Transaction{}, ErrNothingToConfirm
	}

	m.confirming = true
	done := make(chan struct{})
	m.confirmDone = done
	tx := m.current
	tx.Phase = PhaseConfirmed
	tx.Window = 0
	m.mu.Unlock()

	// The state is removed before busy is released: busy released earlier lets in
	// the next Start, and ClearState would erase its state file. The response
	// goes after the cleanup, so "confirmed and immediately applied" does not
	// run into busy.
	kept, err := settleState(ctx, m.store.ClearState, func(ctx context.Context) error { return m.persist(ctx, tx) })

	m.mu.Lock()
	m.confirming = false

	if err != nil {
		m.mu.Unlock()
		close(done)

		return Transaction{}, err
	}

	m.current = tx
	confirmed := m.confirmed
	m.confirmed = nil
	m.busy = false
	m.mu.Unlock()
	close(done)

	if confirmed != nil {
		close(confirmed)
	}

	if kept != nil {
		m.log.Warn("state of the confirmed transaction not removed, the terminal phase is written",
			"err", kept, "transaction_id", id)
	}

	m.log.Info("apply confirmed", "transaction_id", id)

	return tx, nil
}

// settleState makes the state file of a confirmed transaction terminal: removed, or
// rewritten with the terminal phase when the removal fails, since Replay only removes a
// terminal phase while a leftover awaiting_confirm would roll back the confirmed config.
// kept is the removal failure when the terminal record stands in its place. The write
// runs detached from the request with its own ceiling: it must finish even when the
// client is gone.
func settleState(ctx context.Context, remove, persist func(context.Context) error) (kept, err error) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), stateTimeout)
	defer cancel()

	clearErr := remove(ctx)
	if clearErr == nil {
		return nil, nil
	}

	if err := persist(ctx); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrConfirmNotSaved, errors.Join(clearErr, err))
	}

	return clearErr, nil
}

// Close stops waiting for the confirmation and waits for the background goroutine.
// The state stays on disk: an unclosed window is replayed at the next start.
func (m *Manager) Close() {
	m.mu.Lock()
	cancel := m.cancel
	m.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	m.wg.Wait()
}

// reserve takes the apply for one transaction and at the same time catches an outside
// edit: the owner could have changed the config and the list files over SSH, and overwriting this
// silently is not allowed. Returns the ownership number for unreserve.
//
// The base named by the client outranks the internal check: lastSum lives in the process memory
// and is empty after a restart, while the base comes with every apply and
// unblocks Apply when the client has reread a file edited from outside.
func (m *Manager) reserve(ctx context.Context, base, listsBase string) (uint64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.busy || m.current.Active() {
		return 0, ErrBusy
	}

	if err := m.verifyConfigBase(ctx, base); err != nil {
		return 0, err
	}

	if err := m.verifyListsBase(ctx, listsBase); err != nil {
		return 0, err
	}

	return m.hold(), nil
}

// reserveExclusive takes the apply without checking the config: this way a dataplane model
// change does not run concurrently with a config apply: both restart the same
// service, and a rollback of one would return the service to the middle of the other.
func (m *Manager) reserveExclusive() (uint64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.busy || m.current.Active() {
		return 0, ErrBusy
	}

	return m.hold(), nil
}

// verifyConfigBase compares the config on disk with the client base, and without it with what
// the daemon wrote itself. Called under mu.
func (m *Manager) verifyConfigBase(ctx context.Context, base string) error {
	if base != "" {
		current, err := m.store.Sum(ctx)
		if errors.Is(err, fs.ErrNotExist) {
			// There is a base but no file: the client edited a config that
			// was taken away from under it.
			return ErrConfigModified
		}
		if err != nil {
			return fmt.Errorf("compare config: %w", err)
		}
		if current != base {
			return ErrConfigModified
		}

		return nil
	}

	if m.lastSum == "" {
		return nil
	}

	current, err := m.store.Sum(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		// The config was taken away from under the daemon: nothing to compare with, the apply is not
		// stopped by it.
		return nil
	}
	if err != nil {
		return fmt.Errorf("compare config: %w", err)
	}
	if current != m.lastSum {
		return ErrConfigModified
	}

	return nil
}

// verifyListsBase is the same check for the list file set. Called under mu.
func (m *Manager) verifyListsBase(ctx context.Context, listsBase string) error {
	expected := listsBase
	if expected == "" {
		expected = m.lastListsSum
	}

	if expected == "" {
		return nil
	}

	current, err := m.store.ListSums(ctx)
	if err != nil {
		return fmt.Errorf("compare lists: %w", err)
	}

	if config.ListsEtag(current) != expected {
		return ErrListsModified
	}

	return nil
}

// hold takes the apply and returns the ownership number. Called under mu.
func (m *Manager) hold() uint64 {
	m.busy = true
	m.epoch++

	return m.epoch
}

// unreserve releases the apply if the ownership still belongs to the one who
// took it: Confirm and the rollback release busy themselves, and by the exit of the background goroutine it
// may already belong to the next Start.
func (m *Manager) unreserve(token uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.epoch == token {
		m.busy = false
	}
}

func (m *Manager) begin(tx Transaction) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current = tx
	m.confirmed = make(chan struct{})
}

func (m *Manager) release(phase Phase, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.current.Phase = phase
	m.current.ReasonCode = reasonOf(err)
	m.current.Reason = locale.Message(m.opts.Lang, err)
	m.rollingBack = false
}

func (m *Manager) persist(ctx context.Context, tx Transaction) error {
	data, err := json.Marshal(tx)
	if err != nil {
		return fmt.Errorf("encode state: %w", err)
	}

	return m.store.WriteState(ctx, data)
}
