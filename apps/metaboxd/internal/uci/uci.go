// Package uci разбирает вывод `uci show <config>`. Запуск самой утилиты остаётся
// у потребителя: путь к ней и обработку кода возврата каждый задаёт сам.
package uci

import "strings"

// Section — секция конфига UCI в порядке файла.
type Section struct {
	// Name — имя секции; у анонимной — `@<тип>[N]`, как её печатает uci.
	Name string
	Type string
	// Options — значения опций. Список uci печатает несколькими значениями в
	// кавычках, опцию — одним; оба вида приходят срезом.
	Options map[string][]string
}

// Option отдаёт первое значение опции; пусто, когда опции нет.
func (s Section) Option(name string) string {
	if values := s.Options[name]; len(values) > 0 {
		return values[0]
	}

	return ""
}

// Parse разбирает вывод `uci show <config>`. Строки чужого конфига и строки
// без `=` пропускаются.
func Parse(out, config string) []Section {
	var sections []Section

	index := map[string]int{}
	prefix := config + "."

	for line := range strings.Lines(out) {
		key, value, ok := strings.Cut(strings.TrimRight(line, "\r\n"), "=")
		if !ok {
			continue
		}

		path, ok := strings.CutPrefix(key, prefix)
		if !ok {
			continue
		}

		name, option, isOption := strings.Cut(path, ".")
		if !isOption {
			index[name] = len(sections)
			sections = append(sections, Section{Name: name, Type: value, Options: map[string][]string{}})

			continue
		}

		if i, ok := index[name]; ok {
			sections[i].Options[option] = unquote(value)
		}
	}

	return sections
}

// unquote разбирает значение в записи uci: слова в одинарных кавычках через
// пробел. Кавычку внутри значения uci печатает так же, как шелл: закрывает
// кавычки, ставит экранированную кавычку и открывает их снова.
func unquote(s string) []string {
	var (
		out     []string
		word    strings.Builder
		inQuote bool
		started bool
	)

	for i := 0; i < len(s); i++ {
		c := s[i]

		switch {
		case inQuote && c == '\'':
			inQuote = false
		case inQuote:
			word.WriteByte(c)
		case c == '\'':
			inQuote, started = true, true
		case c == '\\' && i+1 < len(s):
			i++
			word.WriteByte(s[i])
			started = true
		case c == ' ' || c == '\t':
			if started {
				out = append(out, word.String())
				word.Reset()
				started = false
			}
		default:
			word.WriteByte(c)
			started = true
		}
	}

	if started {
		out = append(out, word.String())
	}

	return out
}
