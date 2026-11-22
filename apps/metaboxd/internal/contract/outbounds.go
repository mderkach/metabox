package contract

// OutboundMetadataEdit replaces the label and manual usual latency for a tag.
type OutboundMetadataEdit struct {
	Label  string `json:"label,omitempty"`
	NormMS *int   `json:"norm_ms,omitempty"`
}

// OutboundMetadata describes a stored label or manual norm.
type OutboundMetadata struct {
	Label  string `json:"label,omitempty"`
	NormMS *int   `json:"norm_ms,omitempty"`
	Unused bool   `json:"unused,omitempty"`
}

// Outbounds includes entries keyed by tag, even for missing servers.
type Outbounds map[string]OutboundMetadata
