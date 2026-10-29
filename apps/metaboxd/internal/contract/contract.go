// Package contract declares the shapes the daemon returns outside.
//
// The package exists so the contract has an explicit boundary: the panel builds schemas
// from these types, and a private handler struct cannot be a contract,
// since its rename would silently reach the panel. Domain types
// that go into a response whole stay in their own packages: contract refers to
// them and does not copy them.
package contract

import (
	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/dataplane"
	"metabox/internal/devices"
	"metabox/internal/history"
	"metabox/internal/logs"
)

// Health is the response of `GET /healthz`.
type Health struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// Status is the response of `GET /api/status`.
type Status struct {
	// Version is the daemon version; the sing-box binary version is a separate field.
	Version string `json:"version"`
	// Instance is random for each daemon process. After a restart the panel tells by it that
	// a new process answers, not the old one that has not stopped yet.
	Instance       string `json:"instance"`
	SingboxVersion string `json:"singbox_version,omitempty"`
	// SingboxBuild is the binary build composition. No field means the binary was not read, and
	// the panel has nothing to judge which node types are missing in it by.
	SingboxBuild *SingboxBuild `json:"singbox_build,omitempty"`
	// ConfigPath is the file the daemon owns: the path is set by start flags,
	// and the panel side cannot compute it.
	ConfigPath string `json:"config_path,omitempty"`
	// ConfirmWindowSeconds is how long an apply waits for confirmation before the
	// rollback, from the `-confirm-window` start flag.
	ConfirmWindowSeconds int `json:"confirm_window_seconds"`
	// Runtime is where the daemon reads the runtime from. A silent swap of one source for
	// another is forbidden, so the composition is declared by the contract.
	Runtime     Runtime            `json:"runtime"`
	Transaction *apply.Transaction `json:"transaction,omitempty"`
	// TransactionHref is the address of the running apply. Without it a page reload
	// loses the transaction: its identifier lived only in the response to
	// POST.
	TransactionHref string `json:"transaction_href,omitempty"`
	// DataplaneTransaction is the last dataplane model change in this daemon
	// lifetime. It goes by the same protocol and with the same phases as a config
	// apply, and never runs at the same time as it.
	DataplaneTransaction *apply.Transaction `json:"dataplane_transaction,omitempty"`
	// DataplaneTransactionHref is the address of the dataplane change, by the same rule as
	// TransactionHref.
	DataplaneTransactionHref string `json:"dataplane_transaction_href,omitempty"`
}

// SingboxBuild is what the sing-box binary on the device is built with.
type SingboxBuild struct {
	// Tags are the build tags from `sing-box version`. An empty list means a build without
	// tags: node types gated by a tag will be refused by such a binary.
	Tags []string `json:"tags"`
}

// RuntimeSource is a runtime data source.
type RuntimeSource string

// SourceClashAPI is the sing-box Clash API: the base source and so far the only one.
// The gRPC branch waits for a measurement on the target hardware.
const SourceClashAPI RuntimeSource = "clash_api"

// Runtime is the runtime sources in `GET /api/status`.
//
// The fields answer what the daemon can read, not whether sing-box answers now:
// process liveness goes through `GET /api/service` and the `service` stream topic, and no second
// truth about it is introduced here.
type Runtime struct {
	// Sources are the sources the daemon assembled.
	Sources []RuntimeSource `json:"sources"`
	// Connections is the source the panel gets connections from. An empty
	// string means there is nothing to read them with: the screen degrades, and the panel
	// stays available.
	Connections RuntimeSource `json:"connections,omitempty"`
}

// Versions is the response of `GET /api/config/versions`.
type Versions struct {
	Versions []config.Version `json:"versions"`
	// CurrentSum is the sha256 of the applied config in the same notation as
	// `Version.Sum`: the panel marks the version matching the file on the
	// device by it. Computed by the daemon because the browser gives `crypto.subtle` only
	// in a secure context, and the panel is opened over http. No field means there is no config on the
	// device.
	CurrentSum string `json:"current_sum,omitempty"`
	// CurrentListsSum is the fingerprint of the current list file set in the same
	// notation as `Version.ListsSum`: a version matches the device only
	// when both the config and the lists match. The field is absent from a daemon that does not
	// store list snapshots.
	CurrentListsSum string `json:"current_lists_sum,omitempty"`
}

// Service is the response of `GET /api/service` and an event of the same form in the stream: the panel
// gets one format regardless of the source.
type Service struct {
	Status string `json:"status"`
	// Uptime is seconds since the start. Zero means the age could not be
	// learned: the panel shows such a value as a dash.
	Uptime int `json:"uptime"`
	// Binary is the binary version on the device. The panel knows its own schema and checks
	// the mismatch itself.
	Binary string `json:"binary"`
	// Managed means the process is owned by the service the daemon manages.
	// False with the status `running` reads as: sing-box on the device works,
	// but was started outside that service, and the service buttons do not apply to this
	// process.
	Managed   bool   `json:"managed"`
	LastError string `json:"lastError,omitempty"`
	// LastErrorCode is why LastError was written by the daemon and not by the service. Empty
	// when LastError holds the output of a failed service: the panel shows it verbatim.
	LastErrorCode ServiceErrorCode `json:"lastErrorCode,omitempty"`
}

// ServiceErrorCode is a failure because of which the service state is substituted and not
// read. The set is closed: the panel picks the text in the user's language by the code, and
// LastError stays as a detail.
type ServiceErrorCode string

// ServiceStateUnread means procd did not answer about the sing-box service. The `stopped` status in
// such a response is not observed but substituted.
const ServiceStateUnread ServiceErrorCode = "service_state_unread"

// History is the response of `GET /api/history`: traffic over the whole time the daemon accumulated.
//
// The point time is not transmitted: the router has no clock before NTP synchronization, and
// an absolute stamp would lie. The points go in sequence with the step StepSeconds, the last
// is the freshest, and the axis labels are computed by the panel from its own clock.
type History struct {
	StepSeconds int             `json:"step_seconds"`
	Points      []history.Point `json:"points"`
	// DeviceStepSeconds is the step of Device. The board ring coarsens on its own: the
	// readings go on while the traffic stream is down.
	DeviceStepSeconds int `json:"device_step_seconds"`
	// Device is the board readings in sequence with the step DeviceStepSeconds: load,
	// temperature, memory.
	Device []history.DevicePoint `json:"device"`
	// Recent is the last minute of traffic per second, without averaging. Empty
	// until the daemon has received a single sample.
	Recent []history.Point `json:"recent"`
	// Connections is the number of live connections over the last minute, one snapshot
	// per second.
	Connections []int `json:"connections"`
}

// ErrorCode is a machine identifier of a failure. The set is closed and declared here,
// not as strings in handlers: the panel picks the text in the user's language by the code,
// so a new code is a contract change, not an implementation
// detail.
type ErrorCode string

const (
	// ErrNotFound means there is no handler at this address.
	ErrNotFound ErrorCode = "not_found"
	// ErrOriginMismatch means the origin of a mutating request did not match the panel address.
	ErrOriginMismatch ErrorCode = "origin_mismatch"
	// ErrUpgradeUnsupported means an attempt to raise a WebSocket: the runtime goes as a stream
	// `/api/events`.
	ErrUpgradeUnsupported ErrorCode = "upgrade_unsupported"
	// ErrConfigMissing means there is no config file on the device.
	ErrConfigMissing ErrorCode = "config_missing"
	// ErrVersionMissing means there is no such version in the history.
	ErrVersionMissing ErrorCode = "version_missing"
	// ErrConnectionMissing means the connection closed while the panel was asking about it.
	ErrConnectionMissing ErrorCode = "connection_missing"
	// ErrRuntimeUnavailable means the sing-box runtime does not answer; the daemon itself is alive.
	ErrRuntimeUnavailable ErrorCode = "runtime_unavailable"
	// ErrUnknownTransaction means there is no apply transaction with such an identifier.
	ErrUnknownTransaction ErrorCode = "unknown_transaction"
	// ErrApplyInProgress means an apply is already running, a second does not start.
	ErrApplyInProgress ErrorCode = "apply_in_progress"
	// ErrNothingToConfirm means nothing to confirm, there is no confirmation window.
	ErrNothingToConfirm ErrorCode = "nothing_to_confirm"
	// ErrConfigModified means the config file was changed bypassing metabox, and the edit would lie
	// over foreign text.
	ErrConfigModified ErrorCode = "config_modified"
	// ErrConfigTooLarge means the request body is longer than allowed.
	ErrConfigTooLarge ErrorCode = "config_too_large"
	// ErrListInvalid means the list file was not accepted: the name is outside the rules of the
	// rule-sets subdirectory or the apply envelope was not parsed.
	ErrListInvalid ErrorCode = "list_invalid"
	// ErrWorkdirMismatch means an apply with list files is rejected before the write:
	// the sing-box service working directory does not match the config directory, and
	// the service would not find the relative path of a local node. The directories lie in
	// Details.
	ErrWorkdirMismatch ErrorCode = "workdir_mismatch"
	// ErrDeviceInvalid means the own device name was not accepted: the MAC is not parsed, the name
	// is longer than allowed or has control characters, the body is not parsed,
	// or there are more own names than the daemon stores.
	ErrDeviceInvalid ErrorCode = "device_invalid"
	// ErrDataplaneInvalid means the dataplane model was not accepted: in UCI or in
	// the `PUT /api/dataplane` body. The fields with errors lie in Details; a body
	// that did not parse as JSON has none.
	ErrDataplaneInvalid ErrorCode = "dataplane_invalid"
	// ErrDataplaneModified means the `metabox.dataplane` section changed after
	// the client read the model (412), or `PUT /api/dataplane` came without
	// If-Match (428).
	ErrDataplaneModified ErrorCode = "dataplane_modified"
	// ErrLogUnavailable means the sing-box log cannot be read: logread is not set or
	// failed, the log.output file did not open.
	ErrLogUnavailable ErrorCode = "log_unavailable"
	// ErrLogQueryInvalid means the level or the line count in the log query is not parsed.
	ErrLogQueryInvalid ErrorCode = "log_query_invalid"
	// ErrLogStreamLimit means the maximum number of log streams is open; a new one
	// opens when one of them closes.
	ErrLogStreamLimit ErrorCode = "log_stream_limit"
	// ErrEventStreamLimit means the maximum number of runtime streams is open; a new one
	// opens when one of them closes.
	ErrEventStreamLimit ErrorCode = "event_stream_limit"
	// ErrLogClearForbidden means the log.output file lies outside the config directory, /var/run
	// and /tmp: the daemon does not truncate such a file.
	ErrLogClearForbidden ErrorCode = "log_clear_forbidden"
	// ErrUnauthorized means the panel has a password and the request came without a live
	// session: the panel shows the login screen.
	ErrUnauthorized ErrorCode = "unauthorized"
	// ErrPasswordWrong means the password at login or the current password at a change
	// did not match.
	ErrPasswordWrong ErrorCode = "password_wrong"
	// ErrPasswordInvalid means the new password is shorter than 8 or longer than 128
	// characters, or the body is not parsed.
	ErrPasswordInvalid ErrorCode = "password_invalid"
	// ErrLoginLocked means the client network (an IPv4 /24 or an IPv6 /64) made five wrong
	// attempts in a quarter of an hour and is locked for five minutes; the wait is in the
	// Retry-After header.
	ErrLoginLocked ErrorCode = "login_locked"
	// ErrAuthDisabled means a login on a panel without a password: there is nothing to log
	// in with.
	ErrAuthDisabled ErrorCode = "auth_disabled"
	// ErrLogoutNotSaved means logout closed the session, but the daemon could not write the
	// session file: after a daemon restart the session comes back. The cookie is cleared
	// anyway.
	ErrLogoutNotSaved ErrorCode = "logout_not_saved"
	// ErrCheckFailed means `sing-box check` rejected the config; the binary output is in Details.
	ErrCheckFailed ErrorCode = "check_failed"
	// ErrInternal is a failure there is nothing to say outside about: details are in the log.
	ErrInternal ErrorCode = "internal"
)

// ApplyEnvelope is a config apply together with the list files of the rule-sets
// subdirectory. Goes in POST /api/apply with Content-Type
// application/vnd.metabox.apply+json; a body without this type the daemon reads as
// bare config bytes.
type ApplyEnvelope struct {
	// Config is the config text as is, with comments and dangling commas.
	Config string `json:"config"`
	// Lists is the file name in the rule-sets subdirectory → its content.
	Lists map[string]string `json:"lists,omitempty"`
	// RemoveLists are the rule-sets subdirectory files the apply deletes.
	RemoveLists []string `json:"remove_lists,omitempty"`
	// ListsBase is the fingerprint of the file set the client edited from:
	// the etag value from GET /api/config/rule-sets. Empty means apply without
	// a check.
	ListsBase string `json:"lists_base,omitempty"`
}

// RuleSetFiles are the own list files from the rule-sets subdirectory of the config
// directory, as GET /api/config/rule-sets returns them.
type RuleSetFiles struct {
	// Files is the file name → content byte for byte.
	Files map[string]string `json:"files"`
	// Etag is the set fingerprint; the client returns it in lists_base of the apply.
	Etag string `json:"etag"`
}

// Devices is the response of `GET /api/devices` and `PUT /api/devices/{mac}`: LAN
// devices by address, those without an address at the end.
type Devices struct {
	Devices []devices.Device `json:"devices"`
}

// DeviceName is the body of `PUT /api/devices/{mac}`.
type DeviceName struct {
	// Name is the own device name. Empty removes it, and the label returns to
	// the static lease or DHCP.
	Name string `json:"name"`
}

// Auth is the response of `GET /api/auth`.
type Auth struct {
	// Enabled means the panel has a password: without a session every API request except
	// the health check and the login endpoints gets 401.
	Enabled bool `json:"enabled"`
	// Authenticated means the request came with a live session. Always false without a
	// password.
	Authenticated bool `json:"authenticated"`
}

// Login is the body of `POST /api/auth/login`.
type Login struct {
	Password string `json:"password"`
}

// PasswordChange is the body of `PUT /api/auth/password`. A successful set or change
// closes every session and opens a new one for the caller in the cookie; removal
// closes every session.
type PasswordChange struct {
	// Current is the password in force. Ignored while the panel has no password.
	Current string `json:"current"`
	// Password is the new password, 8 to 128 characters. Empty removes the password.
	Password string `json:"password"`
}

// MCPPermission is what an MCP access token allows. The set is closed: a tool exists in
// the MCP server only for a token whose permissions cover it.
type MCPPermission string

// MCPRead allows the read-only tools: state, connections, nodes, config versions, the
// sing-box log and diagnostics.
const MCPRead MCPPermission = "read"

// MCP is the response of `GET /api/mcp`.
type MCP struct {
	// Enabled means the endpoint serves a request with the token. While false it answers
	// 404, as an unknown path.
	Enabled bool `json:"enabled"`
	// Endpoint is the path of the MCP endpoint on the panel address.
	Endpoint string `json:"endpoint"`
	// Permissions are what the token allows. Empty while MCP is disabled.
	Permissions []MCPPermission `json:"permissions"`
}

// MCPToken is the response of `POST /api/mcp/token`: a new token, which enables MCP and
// invalidates the previous token. The daemon keeps only its hash, so the token is
// shown once; the agent sends it as `Authorization: Bearer <token>`.
type MCPToken struct {
	Token       string          `json:"token"`
	Endpoint    string          `json:"endpoint"`
	Permissions []MCPPermission `json:"permissions"`
}

// Dataplane is the response of `GET /api/dataplane`: the dataplane model from UCI and
// whether its rules stand on the device.
type Dataplane struct {
	Model dataplane.Model `json:"model"`
	// Applied means the dataplane chains are in the fw4 table. False without AppliedReason means
	// nft was read and there are no chains.
	Applied bool `json:"applied"`
	// AppliedReason is why Applied was not observed but substituted with false.
	AppliedReason dataplane.AppliedReason `json:"applied_reason,omitempty"`
}

// DataplaneChange is the body of `PUT /api/dataplane`: the model in the same form as the
// model field of the `GET /api/dataplane` response. Written whole: a missing field is a
// zero value, not "leave as is".
type DataplaneChange struct {
	Model dataplane.Model `json:"model"`
}

// DataplaneDetails are the fields of the `dataplane_invalid` failure.
type DataplaneDetails struct {
	Fields []dataplane.FieldError `json:"fields"`
}

// Logs is the response of `GET /api/logs`: the last sing-box log lines, old first.
type Logs struct {
	Source logs.Source `json:"source"`
	// Since is the last cleanup mark in RFC 3339: lines earlier than it are not
	// returned. No field means there was no cleanup since the daemon start.
	Since   string       `json:"since,omitempty"`
	Entries []logs.Entry `json:"entries"`
}

// LogEvent is the `log` event of the `GET /api/logs/stream` stream.
type LogEvent struct {
	// Seq grows by one with each line, including one dropped because of
	// a slow reader: a gap means lost lines.
	Seq   uint64     `json:"seq"`
	Entry logs.Entry `json:"entry"`
}

// LogsCleared is the response of `POST /api/logs/clear`.
type LogsCleared struct {
	// Since is the cleanup mark in RFC 3339.
	Since string `json:"since"`
}

// Error is the single failure format at the HTTP boundary. Internal details (paths
// on disk, command arguments, config content) do not get into it; Details
// carries only what is shown to the user.
//
// Code is the contract, Message is a fallback text: the panel shows its own translation by
// the code, and takes the message only when the code is unfamiliar to it.
type Error struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details any       `json:"details,omitempty"`
}

// CheckDetails is the sing-box output verbatim. The only exception to the rule
// "internal details do not go outside": the user fixes the config by these lines.
type CheckDetails struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// WorkdirDetails are the directories of the `workdir_mismatch` failure. Paths go outside
// deliberately: the panel knows the config path from `GET /api/status` anyway, and by these
// two it builds the command that configures the service.
type WorkdirDetails struct {
	// Workdir is the working directory procd starts the service with.
	Workdir string `json:"workdir"`
	// ConfigDir is the config directory the daemon owns.
	ConfigDir string `json:"config_dir"`
}
