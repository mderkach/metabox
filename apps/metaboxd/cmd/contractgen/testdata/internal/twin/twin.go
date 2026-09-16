// Package twin держит тип с тем же именем, что и в sample: два перечисления с
// одинаковым именем обязаны разъехаться по константам, а не вытеснить друг
// друга.
package twin

// Kind — тёзка `sample.Kind` с другими значениями.
type Kind string

const (
	// KindOther — значение, которого у тёзки нет.
	KindOther Kind = "other"
)

// Holder — владелец перечисления.
type Holder struct {
	Kind Kind `json:"kind"`
}
