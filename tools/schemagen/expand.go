package main

import (
	"fmt"
	"reflect"
)

// Правило маршрутизации встраивает действие, а действие — union по полю
// action. В JSON и то и другое лежит на одном уровне, поэтому объект
// приходится размножать: сколько вариантов действия, столько форм у правила.
//
// Общие поля при этом выносятся в отдельную схему, а варианты печатаются как
// расширение: без этого шесть десятков полей правила дублировались бы в
// каждом варианте.
func (w *walker) expand(base *schema, t reflect.Type, path string) []*schema {
	object := &schema{kind: kindObject, base: base.base}
	object.fields = append(object.fields, base.fields...)
	embedded := w.appendFields(object, t, path)
	object.fields = dedupe(object.fields)

	variants := []*schema{object}
	for _, union := range embedded {
		variants = w.multiply(variants, union, t, path)
	}
	return variants
}

// multiply размножает каждый собранный объект по вариантам встроенного
// union'а.
func (w *walker) multiply(objects []*schema, union embeddedUnion, owner reflect.Type, path string) []*schema {
	discrOptional := w.discrOptional(union.typ, union.spec.discr)

	var out []*schema
	for _, object := range objects {
		shared := w.shareFields(object, owner)

		for _, option := range union.spec.variants {
			body := &schema{kind: kindObject, base: shared.base}
			body.fields = append(body.fields, shared.fields...)
			body.fields = append(body.fields, field{
				name:     union.spec.discr,
				schema:   scalar(fmt.Sprintf("z.literal(%q)", option.tag)),
				optional: discrOptional,
			})

			if option.field == "" {
				out = append(out, body)
				continue
			}

			variantField, ok := union.typ.FieldByName(option.field)
			if !ok {
				panic(fmt.Sprintf("schemagen: %s: нет поля %s",
					goTypeName(union.typ), option.field))
			}
			out = append(out, w.expand(body, deref(variantField.Type), path+"."+option.tag)...)
		}
	}
	return out
}

// shareFields выносит уже собранные поля в отдельную схему, чтобы варианты
// ссылались на неё, а не повторяли её целиком. Короткие объекты остаются как
// есть: отдельная схема на три поля читается хуже, чем сами поля.
func (w *walker) shareFields(object *schema, owner reflect.Type) *schema {
	const worthSharing = 6

	if object.base != "" || len(object.fields) < worthSharing {
		return object
	}

	name := baseName(owner)
	if _, exists := w.set.byName[name]; !exists {
		w.set.put(name, &schema{kind: kindObject, fields: object.fields})
	}
	return &schema{kind: kindObject, base: name}
}

// baseName даёт имя схемы с общими полями: option.RuleAction ->
// RuleActionBaseSchema.
func baseName(t reflect.Type) string {
	return t.Name() + "BaseSchema"
}

// oneOf сворачивает набор вариантов: единственный вариант остаётся объектом.
func oneOf(variants []*schema) *schema {
	if len(variants) == 1 {
		return variants[0]
	}
	out := &schema{kind: kindUnion}
	for _, v := range variants {
		out.variants = append(out.variants, variant{v})
	}
	return out
}
