package clashapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

// errNotObject — значение оказалось не объектом, вставлять в него член нечего.
var errNotObject = errors.New("значение не объект")

// span — границы значения в исходных байтах: [start, end).
type span struct {
	start int
	end   int
}

// objectStart находит начало объекта верхнего уровня: индекс его '{'.
func objectStart(data []byte) (int, error) {
	for i, b := range data {
		if isSpace(b) {
			continue
		}
		if b != '{' {
			return 0, fmt.Errorf("конфиг начинается с %q, а не с объекта", b)
		}

		return i, nil
	}

	return 0, errors.New("конфиг пуст")
}

// findMember ищет член объекта, начинающегося на data[start], и отдаёт границы
// его значения в координатах data. Границы нужны, чтобы править байты точечно:
// разбор в структуру и обратная сериализация переписали бы порядок ключей
// пользователя.
func findMember(data []byte, start int, key string) (span, bool, error) {
	dec := json.NewDecoder(bytes.NewReader(data[start:]))

	tok, err := dec.Token()
	if err != nil {
		return span{}, false, fmt.Errorf("разбор объекта: %w", err)
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '{' {
		return span{}, false, errNotObject
	}

	for dec.More() {
		name, err := dec.Token()
		if err != nil {
			return span{}, false, fmt.Errorf("разбор ключа: %w", err)
		}

		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return span{}, false, fmt.Errorf("разбор значения %v: %w", name, err)
		}

		end := start + int(dec.InputOffset())
		if name == key {
			return span{start: end - len(raw), end: end}, true, nil
		}
	}

	return span{}, false, nil
}

// insertMember дописывает член в начало объекта. В начало, а не в конец: так
// не приходится искать закрывающую скобку и разбирать хвостовые пробелы, а
// порядок остальных ключей остаётся прежним.
func insertMember(data []byte, objStart int, text string) []byte {
	at := objStart + 1
	indent := indentAfterBrace(data, objStart)

	out := make([]byte, 0, len(data)+len(indent)+len(text)+1)
	out = append(out, data[:at]...)
	out = append(out, indent...)
	out = append(out, text...)
	if !objectIsEmpty(data, objStart) {
		out = append(out, ',')
	}

	return append(out, data[at:]...)
}

// replaceSpan меняет значение на месте, не трогая ничего вокруг.
func replaceSpan(data []byte, at span, text string) []byte {
	out := make([]byte, 0, len(data)-(at.end-at.start)+len(text))
	out = append(out, data[:at.start]...)
	out = append(out, text...)

	return append(out, data[at.end:]...)
}

// indentAfterBrace отдаёт пробелы сразу за '{'. Вставка повторяет их, и в
// человекочитаемом конфиге новая секция встаёт на своё место, а не слипается
// с предыдущей строкой.
func indentAfterBrace(data []byte, objStart int) string {
	i := objStart + 1
	for i < len(data) && isSpace(data[i]) {
		i++
	}

	return string(data[objStart+1 : i])
}

func objectIsEmpty(data []byte, objStart int) bool {
	for i := objStart + 1; i < len(data); i++ {
		if isSpace(data[i]) {
			continue
		}

		return data[i] == '}'
	}

	return false
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r'
}
