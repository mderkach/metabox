package main

import (
	"fmt"
	"reflect"
	"strings"
)

// Статические union'ы форка объявлены одинаково: поле-дискриминатор и по полю
// с json:"-" на каждый вариант. Реестр им не нужен — варианты известны на
// этапе компиляции, а badjson кладёт выбранный вариант плоско рядом с
// дискриминатором.
type taggedSpec struct {
	discr    string      // имя поля в JSON: type, action, provider, version
	variants []tagOption // порядок задаёт порядок вариантов в схеме
	// numeric: дискриминатор — число, и литерал печатается без кавычек.
	// Такой union у http_clients, где вариант выбирает версия протокола.
	numeric bool
}

type tagOption struct {
	tag   string // значение дискриминатора
	field string // поле Go-структуры с опциями варианта; пустое — вариант без опций
}

// taggedUnion собирает union: общие поля структуры плюс поля выбранного
// варианта, уплощённые в тот же объект.
func (w *walker) taggedUnion(t reflect.Type, spec taggedSpec, path string) *schema {
	discrOptional := w.discrOptional(t, spec.discr)

	out := &schema{kind: kindTagged, discr: spec.discr}
	if discrOptional {
		// Дискриминатор можно опустить (форк подставляет значение по
		// умолчанию), а z.discriminatedUnion требует его присутствия.
		out = &schema{kind: kindUnion}
	}

	for _, option := range spec.variants {
		body := &schema{kind: kindObject}
		body.fields = append(body.fields, field{
			name:     spec.discr,
			schema:   scalar(literalOf(option.tag, spec.numeric)),
			optional: discrOptional,
		})
		w.appendCommonFields(body, t, spec.discr, path)

		if option.field == "" {
			out.variants = append(out.variants, variant{body})
			continue
		}

		variantField, ok := t.FieldByName(option.field)
		if !ok {
			panic(fmt.Sprintf("schemagen: %s: нет поля %s", goTypeName(t), option.field))
		}
		for _, expanded := range w.expand(body, deref(variantField.Type), path+"."+option.tag) {
			out.variants = append(out.variants, variant{expanded})
		}
	}
	return out
}

// literalOf печатает значение дискриминатора: число литералом, всё остальное
// строкой.
func literalOf(tag string, numeric bool) string {
	if numeric {
		return fmt.Sprintf("z.literal(%s)", tag)
	}

	return fmt.Sprintf("z.literal(%q)", tag)
}

// appendCommonFields переносит поля, общие для всех вариантов union'а: сам
// дискриминатор и поля вариантов (json:"-") пропускаются.
//
// Обход тот же, что у обычной структуры: встроенные поля форк кладёт в JSON
// плоско, и своя укороченная копия обхода теряла бы их целиком — у встроенного
// поля нет тега json, и по имени оно не отбирается.
func (w *walker) appendCommonFields(out *schema, t reflect.Type, discr, path string) {
	common := &schema{kind: kindObject}

	if unions := w.appendFields(common, t, path); len(unions) > 0 {
		panic(fmt.Sprintf("schemagen: %s: встроенный union внутри union'а по %q", goTypeName(t), discr))
	}

	for _, f := range dedupe(common.fields) {
		if f.name == discr {
			continue
		}
		out.fields = append(out.fields, f)
	}
}

// discrOptional: у дискриминатора стоит omitempty, значит в конфиге его
// может не быть.
func (w *walker) discrOptional(t reflect.Type, discr string) bool {
	for i := range t.NumField() {
		name, opts, _ := strings.Cut(t.Field(i).Tag.Get("json"), ",")
		if name == discr {
			return strings.Contains(opts, "omitempty")
		}
	}
	return false
}

func deref(t reflect.Type) reflect.Type {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}
