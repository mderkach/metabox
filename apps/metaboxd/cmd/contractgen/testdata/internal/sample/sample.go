// Package sample держит формы, на которых проверяется генератор: смешанный
// нейминг тегов, необязательные поля, вложенные структуры и типы стандартной
// библиотеки. Пакет не собирается вместе с демоном — он лежит в testdata.
package sample

import (
	"encoding/json"
	"time"
)

// Phase — тип поверх строки: на проводе он остаётся строкой.
type Phase string

// Nested — вложенная структура: на неё ссылается схема владельца.
type Nested struct {
	// Value — поле с комментарием: он уходит в JSDoc.
	Value string `json:"value"`
}

// Sample собирает случаи, на которых ломается механический перевод.
type Sample struct {
	SnakeField  string            `json:"snake_field"`
	CamelField  string            `json:"lastError,omitempty"`
	Abbreviated string            `json:"sourceIP"`
	Pointer     *Nested           `json:"pointer,omitempty"`
	Required    Nested            `json:"required"`
	List        []string          `json:"list"`
	Dictionary  map[string]Nested `json:"dictionary"`
	Duration    time.Duration     `json:"window"`
	Moment      time.Time         `json:"moment"`
	Raw         json.RawMessage   `json:"raw"`
	Phase       Phase             `json:"phase"`
	Count       int               `json:"count"`
	Ratio       float64           `json:"ratio"`
	Flag        bool              `json:"flag"`
	Hidden      string            `json:"-"`
	Untagged    string
}
