package main

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
)

// walker переводит Go-типы форка в промежуточное дерево. Именованные
// структуры выносятся в отдельные схемы, остальное печатается по месту.
type walker struct {
	set      *schemaSet
	building map[reflect.Type]string // тип -> имя схемы, включая недостроенные
	unknown  map[string][]string     // нераспознанный тип -> пути, где встретился
	byGoType map[string]*schema      // готовые схемы: union'ы реестров и правила по типам
	docs     *docSet                 // godoc форка: описания типов и полей
}

func newWalker(docs *docSet) *walker {
	return &walker{
		set:      newSchemaSet(),
		building: map[reflect.Type]string{},
		unknown:  map[string][]string{},
		byGoType: map[string]*schema{},
		docs:     docs,
	}
}

func (w *walker) note(t reflect.Type, path string) {
	name := goTypeName(t)
	if len(w.unknown[name]) < 5 {
		w.unknown[name] = append(w.unknown[name], path)
	}
}

// unknownReport возвращает отсортированный список нераспознанных типов.
func (w *walker) unknownReport() []string {
	if len(w.unknown) == 0 {
		return nil
	}
	out := make([]string, 0, len(w.unknown))
	for name, paths := range w.unknown {
		out = append(out, fmt.Sprintf("  %s — %s", name, strings.Join(paths, ", ")))
	}
	sort.Strings(out)
	return out
}

// build возвращает схему типа. Указатели разыменовываются вызывающим кодом:
// на форме JSON они не сказываются, а на обязательности поля — да.
//
// Именованные типы пакета option выносятся в отдельные схемы, и имя
// резервируется до построения тела: правила маршрутизации ссылаются сами на
// себя, и без такой отсечки обход зациклился бы.
func (w *walker) build(t reflect.Type, path string) *schema {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}

	if name, ok := w.building[t]; ok {
		return ref(name)
	}
	if s, ok := w.byGoType[goTypeName(t)]; ok {
		return s
	}

	if name, exported := schemaName(t); exported {
		w.building[t] = name
		body := w.body(t, path)
		w.set.put(name, body)
		return ref(name)
	}
	return w.body(t, path)
}

// body строит схему типа без оглядки на именование.
func (w *walker) body(t reflect.Type, path string) *schema {
	if s, ok := w.override(t, path); ok {
		return s
	}

	switch t.Kind() {
	case reflect.Bool:
		return scalar("z.boolean()")

	case reflect.String:
		return scalar("z.string()")

	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return scalar(intSchema(t))

	case reflect.Float32, reflect.Float64:
		return scalar("z.number()")

	case reflect.Slice, reflect.Array:
		// []byte сериализуется стандартной библиотекой в base64-строку.
		if t.Elem().Kind() == reflect.Uint8 && t.Elem().PkgPath() == "" {
			return scalar("z.string()")
		}
		return array(w.build(t.Elem(), path+"[]"))

	case reflect.Map:
		return record(w.build(t.Elem(), path+"{}"))

	case reflect.Struct:
		// Структура со своей сериализацией без правила в таблице: обойти её
		// поля значит напечатать схему, не совпадающую с конфигом. Такой тип
		// накапливается и обрывает генерацию.
		if hasCustomJSON(t) {
			w.note(t, path)
			return scalar("z.unknown()")
		}
		return w.plainStruct(t, path)

	case reflect.Interface:
		// Полезная нагрузка узлов реестра: подставляется вариантами union'а
		// в родителе, самостоятельной схемы у неё нет.
		return scalar("z.unknown()")

	default:
		w.note(t, path)
		return scalar("z.unknown()")
	}
}

// intSchema: JSON-число, ограниченное диапазоном Go-типа настолько, насколько
// это выразимо без transform.
func intSchema(t reflect.Type) string {
	switch t.Kind() {
	case reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int, reflect.Int64:
		return "z.int()"
	default:
		return "z.int().nonnegative()"
	}
}

// plainStruct собирает поля структуры, уплощая встроенные: badjson кладёт их
// в JSON плоско, вложенного объекта в конфиге не появляется. Вызывается из
// правил, которые уже установили, что форма JSON совпадает с полями.
//
// Встроенный union (правило маршрутизации встраивает действие) раскрывается
// в union объектов: полей действия в JSON столько же уровней, сколько у
// самого правила.
func (w *walker) plainStruct(t reflect.Type, path string) *schema {
	return oneOf(w.expand(&schema{kind: kindObject}, t, path))
}

// embeddedUnion — встроенная структура, у которой своя форма union'а.
type embeddedUnion struct {
	typ  reflect.Type
	spec taggedSpec
}

// appendFields добавляет поля структуры в объект и возвращает встроенные
// union'ы, которые вызывающий код обязан раскрыть.
func (w *walker) appendFields(out *schema, t reflect.Type, path string) []embeddedUnion {
	return w.appendFieldsAt(out, t, path, 0)
}

func (w *walker) appendFieldsAt(out *schema, t reflect.Type, path string, depth int) []embeddedUnion {
	var unions []embeddedUnion

	for i := range t.NumField() {
		f := t.Field(i)
		if f.PkgPath != "" {
			continue
		}

		tag := f.Tag.Get("json")
		name, _, _ := strings.Cut(tag, ",")

		if f.Anonymous && name == "" {
			embedded := deref(f.Type)
			if embedded.Kind() == reflect.Struct {
				if spec, ok := taggedSpecs[goTypeName(embedded)]; ok {
					unions = append(unions, embeddedUnion{embedded, spec})
					continue
				}
				unions = append(unions, w.appendFieldsAt(out, embedded, path, depth+1)...)
				continue
			}
		}

		if name == "-" || (name == "" && tag == "-") {
			continue
		}
		if name == "" {
			name = f.Name
		}

		// Все поля опциональны: encoding/json не знает обязательных полей,
		// отсутствие ключа даёт нулевое значение, а не ошибку. Обязателен
		// только дискриминатор union'а — без него форк не выберет вариант.
		out.fields = append(out.fields, field{
			name:     name,
			schema:   w.build(f.Type, path+"."+name),
			optional: true,
			depth:    depth,
			doc:      w.docs.field(goTypeName(t), f.Name),
		})
	}

	return unions
}

// schemaName даёт имя схемы для именованной структуры пакета option форка.
// Остальные структуры печатаются по месту: имена вроде linkedhashmap.Map
// в схеме не нужны.
func schemaName(t reflect.Type) (string, bool) {
	if t.Name() == "" || t.PkgPath() == "" {
		return "", false
	}
	if !strings.HasSuffix(t.PkgPath(), "/option") {
		return "", false
	}
	if strings.ContainsAny(t.Name(), "[]") {
		return "", false
	}
	return t.Name() + "Schema", true
}

func goTypeName(t reflect.Type) string {
	if t.Name() != "" && t.PkgPath() != "" {
		parts := strings.Split(t.PkgPath(), "/")
		return parts[len(parts)-1] + "." + t.Name()
	}
	return t.String()
}

// hasCustomJSON: тип сам решает, как выглядеть в JSON, поэтому его форму
// нельзя вывести из полей структуры.
func hasCustomJSON(t reflect.Type) bool {
	pointer := reflect.PointerTo(t)
	for _, method := range []string{"MarshalJSON", "MarshalJSONContext", "UnmarshalJSON", "UnmarshalJSONContext"} {
		if _, ok := pointer.MethodByName(method); ok {
			return true
		}
	}
	_, ok := pointer.MethodByName("MarshalText")
	return ok
}

// genericBase отрезает у дженерика список параметров:
// badoption.Listable[string] -> badoption.Listable.
func genericBase(t reflect.Type) string {
	name := goTypeName(t)
	if i := strings.IndexByte(name, '['); i > 0 {
		return name[:i]
	}
	return name
}
