// Package clashapi handles the experimental.clash_api section: it guarantees its
// presence in the applied config and extracts from the config the address and secret for
// the healthcheck, the dns-in address for the DNS probe and the log file for the failure reason
// of the service.
//
// This is the only place where the daemon touches the config content, and it does so
// surgically: the section is inserted by a byte edit, the rest of the file stays as it was.
// Parsing into a struct is only for reading (Read), there is no reverse serialization,
// otherwise the order of the user's keys would be rewritten.
package clashapi

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
)

var errNotJSON = errors.New("config is not valid JSON")

// Settings is what the daemon needs from the section to reach the Clash API.
type Settings struct {
	Address string
	// Secret is empty when authorization is disabled. The fork disables it entirely with
	// an empty secret, and this is a regular case, not a configuration error.
	Secret string
}

// Read extracts the address and secret. The config is not changed: the struct is needed
// only to read two fields.
func Read(data []byte) (Settings, error) {
	var cfg struct {
		Experimental struct {
			ClashAPI struct {
				ExternalController string `json:"external_controller"`
				Secret             string `json:"secret"`
			} `json:"clash_api"`
		} `json:"experimental"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return Settings{}, fmt.Errorf("read clash_api: %w", err)
	}

	return Settings{
		Address: cfg.Experimental.ClashAPI.ExternalController,
		Secret:  cfg.Experimental.ClashAPI.Secret,
	}, nil
}

// LogOutput extracts the file sing-box writes its log to. An empty string means the log goes to
// the process stream (stderr, stdout) or is disabled.
func LogOutput(data []byte) (string, error) {
	var cfg struct {
		Log struct {
			Disabled bool   `json:"disabled"`
			Output   string `json:"output"`
		} `json:"log"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return "", fmt.Errorf("read log.output: %w", err)
	}

	switch {
	case cfg.Log.Disabled, cfg.Log.Output == "stderr", cfg.Log.Output == "stdout":
		return "", nil
	}

	return cfg.Log.Output, nil
}

// BaseURL turns the controller address into the one the daemon itself can reach.
// A controller listening on a wildcard also answers on loopback, while "0.0.0.0" is not
// routable as a destination address.
func (s Settings) BaseURL() (string, error) {
	if s.Address == "" {
		return "", errors.New("controller address is empty")
	}

	host, port, err := net.SplitHostPort(s.Address)
	if err != nil {
		return "", fmt.Errorf("parse address %q: %w", s.Address, err)
	}

	switch host {
	case "", "0.0.0.0", "::":
		host = "127.0.0.1"
	}

	return "http://" + net.JoinHostPort(host, port), nil
}

// Ensure guarantees that the applied config contains a working
// experimental.clash_api, and reports whether an edit was needed.
//
// The section is created whole, with a generated secret, only
// when it is absent. If the user already created the section, exactly the missing
// external_controller is appended: an empty secret in an existing section means
// "no authorization needed", and appending one would break already configured
// Clash API clients.
func Ensure(data []byte, port int) ([]byte, bool, error) {
	// Parsing goes over a copy without comments, and the edit over the original bytes:
	// the lengths match, so the found offsets fit both.
	parsed := mask(data)

	if !json.Valid(parsed) {
		return nil, false, errNotJSON
	}

	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))

	top, err := objectStart(parsed)
	if err != nil {
		return nil, false, err
	}

	experimental, ok, err := findMember(parsed, top, "experimental")
	if err != nil {
		return nil, false, err
	}
	if !ok {
		section := fmt.Sprintf(`"experimental":{"clash_api":{"external_controller":%q,"secret":%q}}`,
			address, rand.Text())

		return insertMember(data, top, section), true, nil
	}

	clash, ok, err := findMember(parsed, experimental.start, "clash_api")
	if errors.Is(err, errNotObject) {
		return nil, false, fmt.Errorf("experimental: %w", err)
	}
	if err != nil {
		return nil, false, err
	}
	if !ok {
		section := fmt.Sprintf(`"clash_api":{"external_controller":%q,"secret":%q}`, address, rand.Text())

		return insertMember(data, experimental.start, section), true, nil
	}

	controller, ok, err := findMember(parsed, clash.start, "external_controller")
	if errors.Is(err, errNotObject) {
		return nil, false, fmt.Errorf("clash_api: %w", err)
	}
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return insertMember(data, clash.start, fmt.Sprintf(`"external_controller":%q`, address)), true, nil
	}

	if !isEmptyString(data[controller.start:controller.end]) {
		return data, false, nil
	}

	return replaceSpan(data, controller, strconv.Quote(address)), true, nil
}

// isEmptyString reports whether the string in these bytes is empty. A non-string is also
// "empty": a controller set as a number will not work, and the section must be
// fixed.
func isEmptyString(raw []byte) bool {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return true
	}

	return value == ""
}
