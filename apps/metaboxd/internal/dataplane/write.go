package dataplane

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strconv"
	"strings"

	"metabox/internal/uci"
)

// BatchRunner запускает команду с input на stdin и отдаёт её вывод с кодом
// возврата.
type BatchRunner func(ctx context.Context, input, name string, args ...string) (stdout string, exitCode int, err error)

// listOptions — опции-списки модели. В выводе `uci show` список из одного
// значения не отличить от опции, а init-скрипт читает их config_list_foreach,
// который опцию не видит: при восстановлении они пишутся только списком.
var listOptions = []string{"source_ip", "source_mac", "lan_interface", "wan_proxy_cidr", "wan_direct_cidr"}

// Snapshot — секция `metabox.dataplane` как она лежит в UCI, без разбора.
// По ней откатывается смена модели: возвращается и то, что демон не принял бы
// сам, — опции, дописанные владельцем, и невалидные значения.
type Snapshot struct {
	// Exists — секция была; ложь — откат её удаляет.
	Exists  bool                `json:"exists"`
	Type    string              `json:"type,omitempty"`
	Options map[string][]string `json:"options,omitempty"`
}

// Model разбирает снимок так же, как Reader.Model разбирает UCI.
func (s Snapshot) Model() (Model, error) {
	if !s.Exists || s.Type != sectionType {
		return Defaults(), nil
	}

	return decode(uci.Section{Name: section, Type: s.Type, Options: s.Options})
}

// Equal сравнивает снимки по содержимому секции.
func (s Snapshot) Equal(other Snapshot) bool {
	if s.Exists != other.Exists {
		return false
	}

	if !s.Exists {
		return true
	}

	return s.Type == other.Type && maps.EqualFunc(s.Options, other.Options, slices.Equal)
}

// Sum — отпечаток секции для оптимистичной блокировки смены модели. JSON
// детерминирован: ключи карты сортируются, порядок значений списка значим и для
// UCI. Отсутствующая секция даёт один отпечаток независимо от прочих полей.
func (s Snapshot) Sum() string {
	if !s.Exists {
		s = Snapshot{}
	}

	// Ошибки здесь не бывает: в снимке только строки, срезы строк и карта со
	// строковыми ключами.
	data, _ := json.Marshal(s)
	digest := sha256.Sum256(data)

	return hex.EncodeToString(digest[:])
}

// Normalize проверяет модель теми же правилами, что чтение из UCI, и отдаёт её
// в том виде, в каком она прочитается после записи: пустые значения списков
// выброшены, пустой lan_interface заменён умолчанием.
func Normalize(m Model) (Model, error) {
	return decode(encode(m))
}

func encode(m Model) uci.Section {
	options := map[string][]string{
		"enabled":       {flagValue(m.Enabled)},
		"redirect_port": {strconv.Itoa(m.RedirectPort)},
		"tproxy_port":   {strconv.Itoa(m.TproxyPort)},
		"dns_port":      {strconv.Itoa(m.DNSPort)},
		"dns_hijack":    {flagValue(m.DNSHijack)},
		"self_mark":     {strconv.FormatUint(uint64(m.SelfMark), 10)},
		"tproxy_mark":   {strconv.FormatUint(uint64(m.TproxyMark), 10)},
		"route_table":   {strconv.FormatUint(uint64(m.RouteTable), 10)},
		"acl_mode":      {string(m.AccessMode)},
		"ipv6":          {flagValue(m.IPv6)},
	}

	// Пустой список пишется отсутствием опции — как его и прочтут после записи:
	// у lan_interface тогда действует умолчание.
	for name, values := range map[string][]string{
		"source_ip":       m.SourceIP,
		"source_mac":      m.SourceMAC,
		"lan_interface":   m.LANInterface,
		"wan_proxy_cidr":  m.WANProxyCIDR,
		"wan_direct_cidr": m.WANDirectCIDR,
	} {
		if values = slices.DeleteFunc(slices.Clone(values), func(v string) bool { return v == "" }); len(values) > 0 {
			options[name] = values
		}
	}

	return uci.Section{Name: section, Type: sectionType, Options: options}
}

func flagValue(v bool) string {
	if v {
		return "1"
	}

	return "0"
}

// Snapshot снимает секцию `metabox.dataplane` как есть. Нет конфига `metabox`
// или секции — снимок без неё.
func (r *Reader) Snapshot(ctx context.Context) (Snapshot, error) {
	out, code, err := r.run(ctx, r.uci, "-q", "show", config)
	if err != nil {
		return Snapshot{}, fmt.Errorf("uci show %s: %w", config, err)
	}

	if code != 0 {
		return Snapshot{}, nil
	}

	for _, s := range uci.Parse(out, config) {
		if s.Name == section {
			return Snapshot{Exists: true, Type: s.Type, Options: s.Options}, nil
		}
	}

	return Snapshot{}, nil
}

// Write записывает модель в UCI одним `uci batch` с commit и сверяет
// прочитанное после записи с моделью. Сверка обязательна: uci batch на
// отказе отдельной команды печатает ошибку и идёт дальше с кодом 0.
//
// Опции, которых в модели нет, остаются в секции: их мог дописать владелец.
func (r *Reader) Write(ctx context.Context, m Model) error {
	want, err := Normalize(m)
	if err != nil {
		return err
	}

	enc := encode(want)

	var b strings.Builder

	fmt.Fprintf(&b, "set %s.%s=%s\n", config, section, sectionType)

	for _, name := range slices.Sorted(maps.Keys(enc.Options)) {
		if !slices.Contains(listOptions, name) {
			fmt.Fprintf(&b, "set %s.%s.%s=%s\n", config, section, name, quote(enc.Options[name][0]))
		}
	}

	for _, name := range listOptions {
		writeList(&b, name, enc.Options[name])
	}

	if err := r.commit(ctx, &b); err != nil {
		return err
	}

	got, err := r.Model(ctx)
	if err != nil {
		return fmt.Errorf("модель после записи: %w", err)
	}

	if !reflect.DeepEqual(got, want) {
		return errors.New("модель в UCI после записи не совпала с записанной")
	}

	return nil
}

// Restore возвращает секцию к снимку: удаляет её и пишет заново, так что
// опции, добавленные после снимка, не остаются.
func (r *Reader) Restore(ctx context.Context, snap Snapshot) error {
	var b strings.Builder

	fmt.Fprintf(&b, "delete %s.%s\n", config, section)

	if snap.Exists {
		if !safeWord(snap.Type) {
			return fmt.Errorf("тип секции %q не записать", snap.Type)
		}

		fmt.Fprintf(&b, "set %s.%s=%s\n", config, section, snap.Type)

		for _, name := range slices.Sorted(maps.Keys(snap.Options)) {
			values := snap.Options[name]
			if !safeWord(name) || len(values) == 0 || slices.ContainsFunc(values, splitsCommand) {
				return fmt.Errorf("опция %q не записать", name)
			}

			if slices.Contains(listOptions, name) || len(values) > 1 {
				writeList(&b, name, values)

				continue
			}

			fmt.Fprintf(&b, "set %s.%s.%s=%s\n", config, section, name, quote(values[0]))
		}
	}

	if err := r.commit(ctx, &b); err != nil {
		return err
	}

	got, err := r.Snapshot(ctx)
	if err != nil {
		return fmt.Errorf("секция после восстановления: %w", err)
	}

	if !got.Equal(snap) {
		return errors.New("секция в UCI после восстановления не совпала со снимком")
	}

	return nil
}

func writeList(b *strings.Builder, name string, values []string) {
	fmt.Fprintf(b, "delete %s.%s.%s\n", config, section, name)

	for _, v := range values {
		fmt.Fprintf(b, "add_list %s.%s.%s=%s\n", config, section, name, quote(v))
	}
}

func (r *Reader) commit(ctx context.Context, b *strings.Builder) error {
	if r.batch == nil {
		return errors.New("запись UCI не настроена")
	}

	fmt.Fprintf(b, "commit %s\n", config)

	_, code, err := r.batch(ctx, b.String(), r.uci, "-q", "batch")
	if err != nil {
		return fmt.Errorf("uci batch: %w", err)
	}

	if code != 0 {
		return fmt.Errorf("uci batch: код %d", code)
	}

	return nil
}

// quote заключает значение в одинарные кавычки, как его разбирает uci batch:
// кавычка внутри значения закрывает кавычки, экранируется и открывает их
// снова. Перевод строки так не спрятать, поэтому значение с ним не пишется
// вовсе — см. splitsCommand.
func quote(v string) string {
	return "'" + strings.ReplaceAll(v, "'", `'\''`) + "'"
}

// splitsCommand — значение разорвало бы строку команды uci batch.
func splitsCommand(v string) bool {
	return strings.ContainsAny(v, "\n\r\x00")
}

// safeWord — имя опции или тип секции, которые uci примет без кавычек.
func safeWord(s string) bool {
	return s != "" && strings.Trim(s, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") == ""
}
