package logs

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"metabox/internal/clashapi"
)

// BlockedKind describes a connection blocking mechanism in the applied config.
type BlockedKind struct {
	Used    bool `json:"used"`
	Visible bool `json:"visible"`
}

// BlockedTraffic reports the observed count when every configured kind is visible.
type BlockedTraffic struct {
	Count      *uint64     `json:"count,omitempty"`
	Origin     string      `json:"origin"`
	Reject     BlockedKind `json:"reject"`
	Block      BlockedKind `json:"block"`
	Incomplete bool        `json:"incomplete,omitempty"`
}

// BlockedCounter keeps log-based counts for the lifetime of the daemon.
type BlockedCounter struct {
	reader     *Reader
	configPath string
	log        *slog.Logger

	mu         sync.Mutex
	stop       context.CancelFunc
	done       chan struct{}
	count      uint64
	reject     BlockedKind
	block      BlockedKind
	known      bool
	following  bool
	incomplete bool
}

// NewBlockedCounter takes the applied config path to detect when the projection must be refreshed.
func NewBlockedCounter(reader *Reader, configPath string, log *slog.Logger) *BlockedCounter {
	return &BlockedCounter{reader: reader, configPath: configPath, log: log}
}

// Start runs the log follower even when no panel is open.
func (b *BlockedCounter) Start() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.stop != nil {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	b.stop, b.done = cancel, make(chan struct{})

	go func(done chan struct{}) {
		defer close(done)
		b.run(ctx)
	}(b.done)
}

// Close stops the follower and waits for its reader to release the slot.
func (b *BlockedCounter) Close() {
	b.mu.Lock()
	stop, done := b.stop, b.done
	b.mu.Unlock()

	if stop == nil {
		return
	}

	stop()
	<-done

	b.mu.Lock()
	defer b.mu.Unlock()

	if b.done == done {
		b.stop, b.done = nil, nil
	}
}

// Snapshot omits the figure when the applied config or a needed source is unavailable.
func (b *BlockedCounter) Snapshot() BlockedTraffic {
	b.mu.Lock()
	defer b.mu.Unlock()

	result := BlockedTraffic{
		Origin:     "computed",
		Reject:     b.reject,
		Block:      b.block,
		Incomplete: b.incomplete,
	}

	if b.known && !b.incomplete && b.complete(b.reject) && b.complete(b.block) {
		count := b.count
		result.Count = &count
	}

	return result
}

func (b *BlockedCounter) complete(kind BlockedKind) bool {
	return !kind.Used || (kind.Visible && b.following)
}

func (b *BlockedCounter) observe(entry Entry) {
	// The logger name distinguishes traffic blocks from diagnostics or DNS rejects.
	line := entry.Message
	if strings.HasPrefix(line, "[") {
		_, line, _ = strings.Cut(line, "] ")
	}

	rejected := entry.Level == LevelDebug && line == "router: connection closed: rejected"
	blocked := false

	if entry.Level == LevelInfo && strings.HasPrefix(line, "outbound/block[") {
		if delimiter := strings.LastIndex(line, "]: "); delimiter >= 0 {
			message := line[delimiter+len("]: "):]
			blocked = strings.HasPrefix(message, "blocked connection to ") ||
				strings.HasPrefix(message, "blocked packet connection to ")
		}
	}

	if !rejected && !blocked {
		return
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	b.count++
}

func (b *BlockedCounter) run(ctx context.Context) {
	select {
	case b.reader.slots <- struct{}{}:
	case <-ctx.Done():
		return
	}
	defer func() { <-b.reader.slots }()

	var (
		info     os.FileInfo
		settings clashapi.BlockedLog
		known    bool

		active    source
		refreshed bool
		required  bool
		stream    <-chan error
		stop      context.CancelFunc
	)

	stopStream := func() {
		if stream != nil {
			stop()
			<-stream
			stream = nil
		}
	}
	defer stopStream()

	refresh := func() {
		initial := !refreshed
		refreshed = true
		info, settings, known = b.readSettings(ctx, info, settings, known)
		if !known {
			b.mu.Lock()
			b.known = false
			b.mu.Unlock()

			return
		}

		level, valid := ParseLevel(settings.Level)
		visible := valid && !settings.Disabled
		reject := BlockedKind{Used: settings.Reject, Visible: visible && rank(level) <= rank(LevelDebug)}
		block := BlockedKind{Used: settings.Block, Visible: visible && rank(level) <= rank(LevelInfo)}

		src, err := b.reader.outputSource(settings.Output)
		required = (reject.Used && reject.Visible) || (block.Used && block.Visible)
		canFollow := reject.Visible || block.Visible
		switched := stream != nil && required && src != active
		lateStart := !initial && stream == nil && required

		if stream != nil && (src != active || !canFollow || err != nil) {
			stopStream()
		}

		if stream == nil && canFollow && err == nil {
			var followCtx context.Context

			followCtx, stop = context.WithCancel(ctx)
			// Clearing the panel's log must not discard samples from the daemon's uptime.
			stream, err = b.reader.startFollow(followCtx, src, filter{min: rank(LevelDebug)}, b.observe, func() {},
				fileFollowOptions{watchMissing: true, onGap: b.markGap})
			if err != nil {
				stop()
			} else {
				active = src
			}
		}

		b.mu.Lock()
		b.reject, b.block = reject, block
		b.known, b.following = known, stream != nil
		// Later visibility cannot replace log lines that the core omitted earlier.
		b.incomplete = b.incomplete ||
			(reject.Used && !reject.Visible) || (block.Used && !block.Visible) ||
			(required && stream == nil) || switched || lateStart
		b.mu.Unlock()
	}

	refresh()

	ticker := time.NewTicker(b.reader.opts.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			b.markDisconnected(false)

			return
		case <-ticker.C:
			refresh()
		case err := <-stream:
			stop()
			stream = nil
			unexpected := ctx.Err() == nil
			b.markDisconnected(unexpected && required)

			if err != nil && unexpected {
				b.log.Debug("blocked connection log stream ended", "err", err)
			}
		}
	}
}

func (b *BlockedCounter) markGap() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.incomplete = true
}

func (b *BlockedCounter) markDisconnected(incomplete bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.following = false
	b.incomplete = b.incomplete || incomplete
}

func (b *BlockedCounter) readSettings(
	ctx context.Context, previous os.FileInfo, current clashapi.BlockedLog, known bool,
) (os.FileInfo, clashapi.BlockedLog, bool) {
	var info os.FileInfo

	if b.configPath != "" {
		var err error

		info, err = os.Stat(b.configPath)
		if err != nil {
			return nil, clashapi.BlockedLog{}, false
		}
	}

	if known && (info == nil || (previous != nil && os.SameFile(previous, info) &&
		previous.ModTime().Equal(info.ModTime()) && previous.Size() == info.Size())) {
		return info, current, true
	}

	data, err := b.reader.config.Read(ctx)
	if err != nil {
		return nil, clashapi.BlockedLog{}, false
	}

	settings, err := clashapi.ReadBlockedLog(data)

	return info, settings, err == nil
}
