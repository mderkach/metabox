package clashapi

import "bytes"

// Конфиг sing-box — не строгий JSON: бинарь принимает комментарии обоих видов
// и запятую перед закрывающей скобкой, а владельцы роутеров ими пользуются.
// Стандартная библиотека такой файл читать отказывается.
//
// mask отдаёт копию, в которой всё лишнее заменено пробелами. Длина
// сохраняется, поэтому смещения, найденные разбором копии, указывают на те же
// байты оригинала: точечная правка конфига продолжает работать по исходным
// байтам и не переписывает файл целиком.
//
// Проходов два: запятая может стоять перед комментарием, и «висячей» она
// становится видна только после того, как комментарий погашен.
func mask(data []byte) []byte {
	masked := make([]byte, len(data))
	copy(masked, data)

	maskComments(masked)
	maskTrailingCommas(masked)

	return masked
}

func maskComments(data []byte) {
	for i := 0; i < len(data); {
		switch {
		case data[i] == '"':
			i = skipString(data, i)
		case hasPrefixAt(data, i, "//"):
			i = blankTo(data, i, lineCommentEnd(data, i))
		case hasPrefixAt(data, i, "/*"):
			i = blankTo(data, i, blockCommentEnd(data, i))
		default:
			i++
		}
	}
}

func maskTrailingCommas(data []byte) {
	for i := 0; i < len(data); {
		switch data[i] {
		case '"':
			i = skipString(data, i)
		case ',':
			if closesValue(data, i+1) {
				data[i] = ' '
			}

			i++
		default:
			i++
		}
	}
}

func hasPrefixAt(data []byte, index int, prefix string) bool {
	return bytes.HasPrefix(data[index:], []byte(prefix))
}

// skipString проходит строковый литерал не трогая его: «//» и запятая внутри
// строки — обычные символы, а не разметка.
func skipString(data []byte, start int) int {
	for i := start + 1; i < len(data); i++ {
		switch data[i] {
		case '\\':
			i++
		case '"':
			return i + 1
		}
	}

	return len(data)
}

func lineCommentEnd(data []byte, start int) int {
	if end := bytes.IndexByte(data[start:], '\n'); end >= 0 {
		return start + end
	}

	return len(data)
}

func blockCommentEnd(data []byte, start int) int {
	if end := bytes.Index(data[start+2:], []byte("*/")); end >= 0 {
		return start + 2 + end + 2
	}

	return len(data)
}

// blankTo гасит байты до end, оставляя переводы строк: по ним считаются номера
// строк в сообщениях об ошибках разбора.
func blankTo(data []byte, start, end int) int {
	for i := start; i < end; i++ {
		if data[i] != '\n' {
			data[i] = ' '
		}
	}

	return end
}

// closesValue отвечает, стоит ли за этой позицией только закрывающая скобка.
func closesValue(data []byte, from int) bool {
	for i := from; i < len(data); i++ {
		if isSpace(data[i]) {
			continue
		}

		return data[i] == '}' || data[i] == ']'
	}

	return false
}
