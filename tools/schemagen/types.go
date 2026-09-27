package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/sagernet/sing-box/include"
)

// typeEntry — вариант union'а, который реестр форка отдаёт по строке типа.
type typeEntry struct {
	registry string
	key      string
	typ      reflect.Type
}

// registryGroup — реестр форка и типы, которые он умеет создавать.
type registryGroup struct {
	name    string
	entries []typeEntry
}

// skipTypes — ключи, которые реестр отдаёт, но конфигурировать нечего:
// block и wireguard в outbound-реестре объявлены с пустым option.StubOptions,
// shadowsocksr оставлен заглушкой удалённого протокола и при создании
// возвращает ошибку.
var skipTypes = map[string]map[string]bool{
	"outbound": {"block": true, "wireguard": true, "shadowsocksr": true},
	"inbound":  {"shadowsocksr": true},
}

// collectRegistries прогоняет строковые константы форка через CreateOptions
// каждого реестра. Реестр не умеет перечислять свои ключи, а сами строки
// разбросаны по constant/proxy.go, constant/dns.go и constant/provider.go,
// поэтому источником служит весь пакет constant. Расхождение между
// зарегистрированными типами и константами ловит TestRegistryKeysHaveConstants.
func collectRegistries() ([]registryGroup, error) {
	names, err := constantStrings()
	if err != nil {
		return nil, err
	}

	inbound := include.InboundRegistry()
	outbound := include.OutboundRegistry()
	endpoint := include.EndpointRegistry()
	provider := include.ProviderRegistry()
	dnsTransport := include.DNSTransportRegistry()
	svc := include.ServiceRegistry()
	certProvider := include.CertificateProviderRegistry()

	creators := []struct {
		name   string
		create func(string) (any, bool)
	}{
		{"inbound", inbound.CreateOptions},
		{"outbound", outbound.CreateOptions},
		{"endpoint", endpoint.CreateOptions},
		{"provider", provider.CreateOptions},
		{"dns", dnsTransport.CreateOptions},
		{"service", svc.CreateOptions},
		{"certificate_provider", certProvider.CreateOptions},
	}

	groups := make([]registryGroup, 0, len(creators))
	for _, c := range creators {
		group := registryGroup{name: c.name}
		for _, name := range names {
			if skipTypes[c.name][name] {
				continue
			}
			options, ok := c.create(name)
			if !ok {
				continue
			}
			group.entries = append(group.entries, typeEntry{
				registry: c.name,
				key:      name,
				typ:      reflect.TypeOf(options),
			})
		}
		if len(group.entries) == 0 {
			return nil, fmt.Errorf("реестр %s пуст: ни одна константа не дала CreateOptions", c.name)
		}
		groups = append(groups, group)
	}
	return groups, nil
}

// constantStrings возвращает отсортированные значения строковых констант
// пакета constant форка.
func constantStrings() ([]string, error) {
	dir, err := forkDir()
	if err != nil {
		return nil, err
	}

	values, err := constantValues(dir)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	for _, value := range values {
		if value != "" {
			seen[value] = true
		}
	}
	if len(seen) == 0 {
		return nil, fmt.Errorf("в пакете constant не нашлось строковых констант: %s", dir)
	}

	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// constantValues — имя строковой константы пакета constant форка → значение.
func constantValues(dir string) (map[string]string, error) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, filepath.Join(dir, "constant"), nil, parser.SkipObjectResolution)
	if err != nil {
		return nil, fmt.Errorf("разбор пакета constant: %w", err)
	}

	values := map[string]string{}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			for _, decl := range file.Decls {
				gen, ok := decl.(*ast.GenDecl)
				if !ok || gen.Tok != token.CONST {
					continue
				}
				for _, spec := range gen.Specs {
					value, ok := spec.(*ast.ValueSpec)
					if !ok {
						continue
					}
					for i, expr := range value.Values {
						lit, ok := expr.(*ast.BasicLit)
						if !ok || lit.Kind != token.STRING || i >= len(value.Names) {
							continue
						}
						if s, err := strconv.Unquote(lit.Value); err == nil {
							values[value.Names[i].Name] = s
						}
					}
				}
			}
		}
	}

	return values, nil
}

// forkDir отдаёт каталог форка в module cache. Команда читает go.mod, поэтому
// генератор запускается из каталога своего модуля — так его и зовёт
// цель schema в Makefile.
func forkDir() (string, error) {
	return moduleDir(forkModule)
}

// moduleDir отдаёт каталог модуля из графа сборки в module cache.
func moduleDir(module string) (string, error) {
	//nolint:gosec // имя модуля приходит из констант генератора, не от пользователя
	command := exec.Command("go", "list", "-m", "-f", "{{.Dir}}", module)
	var stderr strings.Builder
	command.Stderr = &stderr

	out, err := command.Output()
	if err != nil {
		return "", fmt.Errorf("go list %s: %w: %s", module, err,
			strings.TrimSpace(stderr.String()))
	}
	dir := strings.TrimSpace(string(out))
	if dir == "" {
		return "", fmt.Errorf("go list %s вернул пустой путь", module)
	}
	return dir, nil
}

const forkModule = "github.com/sagernet/sing-box"
