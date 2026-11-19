package contract

import "time"

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

// Version is a history entry. The daemon does not parse the config content,
// so only the number, size, fingerprint and timestamp go outside.
type Version struct {
	// ID is a monotonic number. Time cannot be the source of order: the
	// router has no real-time clock, it starts from the epoch and jumps on
	// NTP synchronization.
	ID int `json:"id"`
	// Size is the size in bytes.
	Size int64 `json:"size"`
	// Sum is the sha256 of the content. It shows that the version matches the
	// active config without reading both.
	Sum string `json:"sum"`
	// SavedAt is the file timestamp, Unix seconds. Informational: shows the
	// device clock at the time of saving and lies if it is not synchronized.
	SavedAt int64 `json:"saved_at"`
	// ListsSum is the fingerprint of the list files snapshot in the same notation as the etag of
	// `GET /api/config/rule-sets`. No field means the version was saved without a snapshot, and its
	// restore does not touch the lists.
	ListsSum string `json:"lists_sum,omitempty"`
}

// ListStat is what the disk says about a list file.
type ListStat struct {
	// Size is the size in bytes.
	Size int64 `json:"size"`
	// ModifiedAt is the file modification time, Unix seconds. Informational: shows the
	// device clock at the time of the write and lies if it was not synchronized.
	ModifiedAt int64 `json:"modified_at"`
}

// Point is the average speed per step, bytes per second.
type Point struct {
	Down int64 `json:"down"`
	Up   int64 `json:"up"`
}

// DevicePoint is the board and process readings per step.
//
// Load and temperature are taken as the step peak, memory as the average. The history is needed
// to notice overheating and a leak over days of work, and on step coarsening the average
// would dissolve a short overheating among neighbouring calm minutes.
type DevicePoint struct {
	// Load is the average load per minute as the kernel gives it; the step peak.
	Load float64 `json:"load"`
	// Celsius is the hottest board zone, the step peak; zero means there are no zones.
	Celsius float64 `json:"celsius"`
	// Memory is the occupied board memory in bytes.
	Memory int64 `json:"memory"`
	// Singbox is the resident memory of the sing-box process in bytes; zero means the process
	// was not found. A leak is visible by it: the board memory as a whole blurs it.
	Singbox int64 `json:"singbox"`
	// Daemon is the resident memory of the daemon itself in bytes.
	Daemon int64 `json:"daemon"`
}

// NameSource is where the device label comes from. The set is closed: the panel
// explains by it why the device is labelled this way.
type NameSource string

const (
	// SourceCustom means the owner set the name in the panel.
	SourceCustom NameSource = "custom"
	// SourceStatic means the name of a dnsmasq static lease.
	SourceStatic NameSource = "static"
	// SourceDHCP means the name the device gave itself when getting a lease.
	SourceDHCP NameSource = "dhcp"
	// SourceNone means no name, the panel labels the device with its address.
	SourceNone NameSource = "none"
)

// Device is a LAN device reduced by MAC.
type Device struct {
	// IP is the address from the lease, and without it from the static entry. Empty when
	// there is no address in either: the device has only its own name.
	IP string `json:"ip"`
	// MAC is lowercase with colons; the own name is stored by it.
	MAC string `json:"mac"`
	// Name is the label by priority: own name, static lease, DHCP. Empty
	// with NameSource `none`.
	Name string `json:"name"`
	// NameSource is where the label comes from; with `none` the panel labels
	// the device with its address.
	NameSource NameSource `json:"name_source"`
	// Static means the MAC has a static lease in UCI `dhcp`.
	Static bool `json:"static"`
	// Online means the lease has not expired by the router clock. Before NTP synchronization the clock
	// stands in the past, and an expired lease may count as alive.
	Online bool `json:"online"`
	// LeaseExpires is the lease end in unix seconds. Zero means no lease or it is
	// permanent; the second differs by the Online flag.
	LeaseExpires int64 `json:"lease_expires"`
}

// AccessMode is which sources from the LAN interfaces go through sing-box.
type AccessMode string

const (
	// AccessAll means all sources; the source lists are stored but have no effect.
	AccessAll AccessMode = "all"
	// AccessListed means only those listed in source_ip and source_mac, minus those
	// listed in source_ip_exclude and source_mac_exclude.
	AccessListed AccessMode = "listed"
)

// Model is the `metabox.dataplane` section. A missing option gets the default value
// from Defaults; a list set with empty values is empty.
type Model struct {
	// Enabled is whether to install interception. False: the service starts only sing-box,
	// without nft, ip rule and the dnsmasq upstream.
	Enabled bool `json:"enabled"`
	// RedirectPort is the redirect inbound port: LAN TCP goes here.
	RedirectPort int `json:"redirect_port"`
	// TproxyPort is the tproxy inbound port: LAN UDP goes here.
	TproxyPort int `json:"tproxy_port"`
	// DNSPort is the sing-box dns-in port that dnsmasq sends queries to.
	DNSPort int `json:"dns_port"`
	// DNSHijack is whether to intercept udp/53 from the LAN to the router dnsmasq.
	DNSHijack bool `json:"dns_hijack"`
	// SelfMark is the bypass mark: a packet with it goes around interception. Matches
	// route.default_mark of the sing-box config, otherwise its traffic would loop.
	SelfMark uint32 `json:"self_mark"`
	// TproxyMark is the mark of tproxy flows, ip rule sends them to RouteTable by it.
	TproxyMark uint32 `json:"tproxy_mark"`
	// RouteTable is the routing table with a local route for tproxy.
	RouteTable uint32     `json:"route_table"`
	AccessMode AccessMode `json:"acl_mode"`
	// SourceIP are the sources of listed mode: an IPv4 address or a subnet.
	SourceIP []string `json:"source_ip"`
	// SourceMAC are the sources of listed mode by MAC: they do not depend on a lease change.
	SourceMAC []string `json:"source_mac"`
	// SourceIPExclude are listed mode sources that go direct even when SourceIP or
	// SourceMAC lists them: a device inside an intercepted subnet. Same form as SourceIP.
	SourceIPExclude []string `json:"source_ip_exclude"`
	// SourceMACExclude are the same exclusions by MAC.
	SourceMACExclude []string `json:"source_mac_exclude"`
	// LANInterface are the interfaces traffic is intercepted from.
	LANInterface []string `json:"lan_interface"`
	// WANProxyCIDR are the destinations that always go through sing-box.
	WANProxyCIDR []string `json:"wan_proxy_cidr"`
	// WANDirectCIDR are the destinations that always bypass sing-box.
	WANDirectCIDR []string `json:"wan_direct_cidr"`
	// IPv6 is whether to render the IPv6 chains; while false, there are none.
	IPv6 bool `json:"ipv6"`
}

// AppliedReason is why the applied flag was not observed but substituted with false.
type AppliedReason string

const (
	// NFTUnavailable means nft did not start, returned a non-zero code or the path to it
	// is not set.
	NFTUnavailable AppliedReason = "nft_unavailable"
	// NFTUnparsed means the nft output was not parsed: truncated or not JSON.
	NFTUnparsed AppliedReason = "nft_unparsed"
)

// FieldReason is why an option value was not accepted. The set is closed: the panel
// picks the text in the user's language by it.
type FieldReason string

const (
	// ReasonInvalid means the value is not parsed: not a number, not an IP, not a MAC, not from
	// the set.
	ReasonInvalid FieldReason = "invalid"
	// ReasonOutOfRange means the port is outside 1–65535.
	ReasonOutOfRange FieldReason = "out_of_range"
	// ReasonDuplicate means the port matched the port of another inbound.
	ReasonDuplicate FieldReason = "duplicate"
	// ReasonRequired means the list is empty while the dataplane is enabled.
	ReasonRequired FieldReason = "required"
)

// FieldError is one value that was not accepted.
type FieldError struct {
	// Field is the UCI option name.
	Field string `json:"field"`
	// Value is the value as in UCI; for a list element, the element itself. Empty for
	// ReasonRequired.
	Value  string      `json:"value"`
	Reason FieldReason `json:"reason"`
}

// Level is a sing-box log line level.
type Level string

// The sing-box levels from the most detailed.
const (
	LevelTrace  Level = "trace"
	LevelDebug  Level = "debug"
	LevelInfo   Level = "info"
	LevelNotice Level = "notice"
	LevelWarn   Level = "warn"
	LevelError  Level = "error"
	LevelFatal  Level = "fatal"
	LevelPanic  Level = "panic"
)

// Source is where the log was read from.
type Source string

const (
	// SourceLogread is the device logger: sing-box writes to stderr.
	SourceLogread Source = "logread"
	// SourceFile is the log.output file of the applied config.
	SourceFile Source = "file"
)

// Entry is a sing-box log line.
type Entry struct {
	// Time is the line timestamp in RFC 3339; empty when there is no stamp. For logger
	// lines this is the logd time, for the file the sing-box log.timestamp stamp. The router
	// has no real-time clock: before NTP synchronization the stamps are in the past.
	Time string `json:"time,omitempty"`
	// Level is empty when the level is not parsed: a continuation of a multi-line
	// message, a panic stack. The level filter lets such lines through.
	Level   Level  `json:"level,omitempty"`
	Message string `json:"message"`
}
