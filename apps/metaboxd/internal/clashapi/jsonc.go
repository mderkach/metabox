package clashapi

import "bytes"

// The sing-box config is not strict JSON: the binary accepts comments of both kinds
// and a comma before the closing bracket, and router owners use them.
// The standard library refuses to read such a file.
//
// mask returns a copy in which everything extra is replaced with spaces. The length
// is preserved, so offsets found by parsing the copy point to the same
// bytes of the original: a surgical config edit keeps working on the original
// bytes and does not rewrite the whole file.
//
// There are two passes: a comma may stand before a comment, and it becomes visible as
// "dangling" only after the comment is blanked.
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

// skipString passes a string literal without touching it: "//" and a comma inside
// a string are ordinary characters, not markup.
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

// blankTo blanks the bytes up to end, leaving line breaks: line numbers in
// parse error messages are counted by them.
func blankTo(data []byte, start, end int) int {
	for i := start; i < end; i++ {
		if data[i] != '\n' {
			data[i] = ' '
		}
	}

	return end
}

// closesValue reports whether only a closing bracket stands after this position.
func closesValue(data []byte, from int) bool {
	for i := from; i < len(data); i++ {
		if isSpace(data[i]) {
			continue
		}

		return data[i] == '}' || data[i] == ']'
	}

	return false
}
