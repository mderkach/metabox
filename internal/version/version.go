// Package version holds build metadata injected at link time.
package version

// Version is overridden via -ldflags during release builds.
var Version = "dev"
