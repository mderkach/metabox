package main

// builtins are the Go types that go on the wire as is.
var builtins = map[string]string{
	"string":  "z.string()",
	"bool":    "z.boolean()",
	"int":     "z.int()",
	"int8":    "z.int()",
	"int16":   "z.int()",
	"int32":   "z.int()",
	"int64":   "z.int()",
	"uint":    "z.int()",
	"uint8":   "z.int()",
	"uint16":  "z.int()",
	"uint32":  "z.int()",
	"uint64":  "z.int()",
	"float32": "z.number()",
	"float64": "z.number()",
	"any":     "z.unknown()",
	"byte":    "z.int()",
}

// externals are the standard library types in the form `encoding/json`
// serializes them. A type without a rule stops generation: a silently printed
// `z.unknown()` would hide a lost contract.
var externals = map[string]string{
	"time.Duration":   "z.int()",
	"time.Time":       "z.string()",
	"json.RawMessage": "z.unknown()",
}
