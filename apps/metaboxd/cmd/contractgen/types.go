package main

// builtins — типы Go, которые уходят на провод как есть.
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

// externals — типы стандартной библиотеки в том виде, в каком их сериализует
// `encoding/json`. Тип без правила останавливает генерацию: молча напечатанный
// `z.unknown()` спрятал бы потерю контракта.
var externals = map[string]string{
	"time.Duration":   "z.int()",
	"time.Time":       "z.string()",
	"json.RawMessage": "z.unknown()",
}
