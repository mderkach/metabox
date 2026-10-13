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

// typeEntry is a union variant that the fork registry returns by a type string.
type typeEntry struct {
	registry string
	key      string
	typ      reflect.Type
}

// registryGroup is a fork registry and the types it can create.
type registryGroup struct {
	name    string
	entries []typeEntry
}

// skipTypes are the keys the registry returns but there is nothing to configure:
// block and wireguard in the outbound registry are declared with an empty option.StubOptions,
// shadowsocksr is left as a stub of a removed protocol and returns
// an error on creation.
var skipTypes = map[string]map[string]bool{
	"outbound": {"block": true, "wireguard": true, "shadowsocksr": true},
	"inbound":  {"shadowsocksr": true},
}

// collectRegistries runs the fork string constants through CreateOptions
// of each registry. A registry cannot list its keys, and the strings themselves
// are scattered over constant/proxy.go, constant/dns.go and constant/provider.go,
// so the whole constant package is the source. A mismatch between
// registered types and constants is caught by TestRegistryKeysHaveConstants.
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
			return nil, fmt.Errorf("registry %s is empty: no constant gave CreateOptions", c.name)
		}
		groups = append(groups, group)
	}
	return groups, nil
}

// constantStrings returns the sorted values of the string constants
// of the fork constant package.
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
		return nil, fmt.Errorf("no string constants found in the constant package: %s", dir)
	}

	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// constantValues is the name of a string constant of the fork constant package → its value.
func constantValues(dir string) (map[string]string, error) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, filepath.Join(dir, "constant"), nil, parser.SkipObjectResolution)
	if err != nil {
		return nil, fmt.Errorf("parsing the constant package: %w", err)
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

// forkDir returns the fork directory in the module cache. The command reads go.mod, so
// the generator is run from its module directory, which is how the schema
// target in the Makefile calls it.
func forkDir() (string, error) {
	return moduleDir(forkModule)
}

// moduleDir returns a module directory from the build graph in the module cache.
func moduleDir(module string) (string, error) {
	//nolint:gosec // the module name comes from generator constants, not from the user
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
		return "", fmt.Errorf("go list %s returned an empty path", module)
	}
	return dir, nil
}

const forkModule = "github.com/sagernet/sing-box"
