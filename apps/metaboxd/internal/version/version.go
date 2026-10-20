// Package version holds build metadata injected at link time.
package version

// Version is overridden via -ldflags during release builds.
var Version = "dev"

// Schema is the sing-box fork version the embedded panel schemas are built from, injected
// via -ldflags from the generated schema file. Empty means the build did not inject it.
var Schema = ""
