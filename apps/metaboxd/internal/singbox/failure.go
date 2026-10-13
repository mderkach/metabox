package singbox

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"metabox/internal/clashapi"
	"metabox/internal/procd"
)

// sing-box messages are colored: the level comes in terminal escape
// sequences, and in the panel they would look like garbage such as `[31mFATAL[0m`.
var ansi = regexp.MustCompile(`\x1b\[[0-9;]*m`)

// fileTimestamp is the timestamp sing-box opens a log file line with
// under log.timestamp; without it the line starts with the level.
var fileTimestamp = regexp.MustCompile(`^[+-]\d{4} \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} `)

const (
	// How much of the log.output file tail to read, in bytes: about two hundred sing-box lines.
	failureTail = 64 << 10

	// The reason is the last lines, not the whole log: a service under procd crashes in
	// a loop, and the same failure repeats dozens of times.
	failureLines = 3
	// A ceiling for a long diagnostic: the reason goes into the handler response,
	// not into a file.
	failureLimit = 2000
)

// failure returns the reason of the last service crash. An empty string means
// there is no reason: the log is unavailable or the service did not mark itself in it, this is not a
// failure, the panel must open without a reason too.
//
// The device logger is asked first: the FATAL that `sing-box run` exits with
// is written to stderr, not to log.output, and it is not in the file.
// The file is a fallback source when the process did not mark itself in the logger.
func (c *Client) failure(ctx context.Context, launch procd.Launch) string {
	if reason := c.logreadFailure(ctx); reason != "" {
		return reason
	}

	return fileFailure(launch)
}

func (c *Client) logreadFailure(ctx context.Context) string {
	if c.logread == "" {
		return ""
	}

	// The -l limit is not passed to the logger: logd cuts the last N lines of the whole
	// journal before the -e filter, and on a router where dnsmasq writes thousands of lines
	// the sing-box lines do not get into the tail. The logd ring is limited by size
	// (64 KiB by default), so all the filtered output is small.
	res, err := c.runner.Run(ctx, c.logread, "-e", c.processName())
	if err != nil || res.ExitCode != 0 {
		return ""
	}

	return lastFailure(res.Stdout, c.processName())
}

// fileFailure reads the reason from the tail of the log.output file of the config the
// service is started with by procd. The config is taken only when it is a single file (-c):
// the daemon does not repeat the merge of several files and the -C directory.
//
// A relative log.output sing-box opens from the working directory (it moves into
// the -D directory before reading the config), so the path is resolved from
// Launch.Workdir. An unknown working directory means the file is not read: the cwd of the crashed
// process is not visible to the daemon, and the config directory is not a path base for sing-box
// anyway.
func fileFailure(launch procd.Launch) string {
	if len(launch.Configs) != 1 || len(launch.ConfigDirs) != 0 || !filepath.IsAbs(launch.Configs[0]) {
		return ""
	}

	data, err := os.ReadFile(launch.Configs[0])
	if err != nil {
		return ""
	}

	output, err := clashapi.LogOutput(data)
	if err != nil || output == "" {
		return ""
	}

	if !filepath.IsAbs(output) {
		if launch.Workdir == "" {
			return ""
		}

		output = filepath.Join(launch.Workdir, output)
	}

	tail, err := readTail(output, failureTail)
	if err != nil {
		return ""
	}

	return fileLastFailure(tail)
}

// readTail returns the last limit bytes of the file without the first, broken line.
func readTail(path string, limit int64) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()

	info, err := f.Stat()
	if err != nil {
		return "", err
	}

	offset := max(info.Size()-limit, 0)

	data, err := io.ReadAll(io.NewSectionReader(f, offset, limit))
	if err != nil {
		return "", err
	}

	tail := string(data)
	if offset > 0 {
		_, tail, _ = strings.Cut(tail, "\n")
	}

	return tail, nil
}

// lastFailure selects from the device log the lines by which the process reported
// a failure. Selection by process name, not over the whole log: all the router services
// write nearby, and a foreign error in the sing-box crash reason only confuses.
func lastFailure(log, process string) string {
	prefix := process + "["

	var messages []string

	for _, line := range strings.Split(log, "\n") {
		clean := strings.TrimSpace(ansi.ReplaceAllString(line, ""))

		if strings.Contains(clean, prefix) {
			messages = append(messages, messageOf(clean))
		}
	}

	return failureOf(messages)
}

// fileLastFailure selects a failure from the log.output file. The file is written by sing-box alone,
// but mixed with errors of individual connections, which sing-box marks with
// a connection identifier in brackets after the level. Such an error does not
// crash the service, and the file tail is stuffed with them, so they do not go into the reason.
func fileLastFailure(log string) string {
	var messages []string

	for _, line := range strings.Split(log, "\n") {
		message := fileTimestamp.ReplaceAllString(strings.TrimSpace(ansi.ReplaceAllString(line, "")), "")

		if _, rest, _ := strings.Cut(message, " "); strings.HasPrefix(rest, "[") {
			continue
		}

		messages = append(messages, message)
	}

	return failureOf(messages)
}

func failureOf(messages []string) string {
	var found []string

	for _, message := range messages {
		if !isFailure(message) {
			continue
		}

		// A repeat of the same failure adds nothing: procd restarts
		// the crashed service in a circle, and the log is one line in copies.
		if len(found) > 0 && found[len(found)-1] == message {
			continue
		}

		found = append(found, message)
	}

	if len(found) > failureLines {
		found = found[len(found)-failureLines:]
	}

	return clamp(strings.Join(found, "\n"), failureLimit)
}

// messageOf drops the service part of a log line (time, facility and process
// name), leaving what the process wrote itself.
func messageOf(line string) string {
	if _, message, found := strings.Cut(line, "]: "); found {
		return strings.TrimSpace(message)
	}

	return line
}

func isFailure(message string) bool {
	upper := strings.ToUpper(message)

	return strings.HasPrefix(upper, "FATAL") || strings.HasPrefix(upper, "ERROR") || strings.HasPrefix(upper, "PANIC")
}

func clamp(s string, limit int) string {
	if len(s) <= limit {
		return s
	}

	return s[:limit] + "…"
}

// processName derives the process name in the log from the binary path: the logger writes it
// the same way procd named the command.
func (c *Client) processName() string {
	return filepath.Base(c.binary)
}
