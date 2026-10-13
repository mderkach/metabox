// Package ruleset is the catalog of ready rule sets: which providers exist,
// where their files are downloaded from and which categories they publish.
//
// The daemon checks the category listing with the providers itself and gives it to the panel. The panel
// stores no catalog: otherwise it would live as a second copy and diverge from what
// the provider actually publishes.
package ruleset

import "fmt"

// ListKind is what lists the set returns: domains or addresses.
type ListKind string

// List kinds.
const (
	KindGeosite ListKind = "geosite"
	KindGeoip   ListKind = "geoip"
)

// ListSource is where the category listing is taken from.
type ListSource string

// Listing sources.
const (
	// ListSourceSnapshot is a snapshot embedded into the binary at build time: the daemon
	// has not yet checked with the provider.
	ListSourceSnapshot ListSource = "snapshot"
	// ListSourceProvider means the listing is checked with the provider.
	ListSourceProvider ListSource = "provider"
)

// Mirror is the address from which sing-box downloads the set files. The primary
// address is not always reachable from Russia, so there are several mirrors.
type Mirror struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Base is the start of the address up to the file name, with a trailing slash.
	Base string `json:"base"`
}

// List is one kind of lists at a provider.
type List struct {
	Kind ListKind `json:"kind"`
	// Prefix is the file name prefix: `geosite-` + category + `.srs`.
	Prefix  string   `json:"prefix"`
	Mirrors []Mirror `json:"mirrors"`
	// Featured is what to show while the category field is empty, in order from
	// general to specific.
	Featured []string `json:"featured"`
	// Categories are all categories for which the provider has an `.srs` file,
	// alphabetically.
	Categories []string   `json:"categories"`
	Source     ListSource `json:"source"`
	// UpdatedAt is when the listing was last checked with the provider, and for a
	// snapshot when it was built; Unix seconds. An informational value: the
	// router has no real-time clock, but the check goes over TLS, which does not pass without
	// synchronized clocks.
	UpdatedAt int64 `json:"updated_at"`
}

// Provider is a provider of ready sets.
type Provider struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Lists []List `json:"lists"`
}

// Catalog is the catalog handler response.
type Catalog struct {
	Providers []Provider `json:"providers"`
}

// Tree is a branch catalog on GitHub where the provider publishes `.srs` files.
type Tree struct {
	Owner string
	Repo  string
	Ref   string
	// Dir is the path inside the branch without slashes at the edges; empty is the branch root.
	Dir string
}

func (t Tree) rawBase() string {
	return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", t.Owner, t.Repo, t.Ref, t.suffix())
}

func (t Tree) cdnBase() string {
	return fmt.Sprintf("https://cdn.jsdelivr.net/gh/%s/%s@%s/%s", t.Owner, t.Repo, t.Ref, t.suffix())
}

func (t Tree) suffix() string {
	if t.Dir == "" {
		return ""
	}

	return t.Dir + "/"
}

func (t Tree) mirrors() []Mirror {
	return []Mirror{
		{ID: "github", Name: "GitHub", Base: t.rawBase()},
		{ID: "jsdelivr", Name: "jsDelivr", Base: t.cdnBase()},
	}
}

type listSpec struct {
	kind     ListKind
	prefix   string
	tree     Tree
	featured []string
}

type providerSpec struct {
	id    string
	name  string
	lists []listSpec
}

// key is the list name in the cache and snapshot.
func key(providerID string, kind ListKind) string {
	return providerID + "/" + string(kind)
}

// providers is the provider table. Only one whose address template is checked gets into
// the catalog: a wrong address cannot be told from an unavailable provider,
// and the price of a mistake is a failed sing-box start. A source that is not here
// is connected by the panel with its own address.
func providers() []providerSpec {
	runet := func(dir string) Tree {
		return Tree{Owner: "runetfreedom", Repo: "russia-v2ray-rules-dat", Ref: "release", Dir: dir}
	}

	return []providerSpec{
		{
			id:   "runetfreedom",
			name: "Runet Freedom",
			lists: []listSpec{
				{
					kind:   KindGeosite,
					prefix: "geosite-",
					tree:   runet("sing-box/rule-set-geosite"),
					featured: []string{
						"ru-blocked", "ru-blocked-all", "ru-available-only-inside", "category-ads-all",
						"youtube", "google", "telegram", "discord", "openai", "meta", "instagram",
						"facebook", "twitter", "tiktok", "whatsapp", "netflix", "spotify", "github",
						"cloudflare", "microsoft", "apple", "category-gov-ru", "win-spy", "category-porn",
						"private",
					},
				},
				{
					kind:   KindGeoip,
					prefix: "geoip-",
					tree:   runet("sing-box/rule-set-geoip"),
					featured: []string{
						"ru-blocked", "ru-blocked-community", "re-filter", "ru-whitelist", "ru", "private",
						"telegram", "cloudflare", "google", "ddos-guard", "yandex",
					},
				},
			},
		},
		{
			id:   "v2fly",
			name: "v2fly",
			lists: []listSpec{
				{
					kind:   KindGeosite,
					prefix: "geosite-",
					tree:   Tree{Owner: "SagerNet", Repo: "sing-geosite", Ref: "rule-set"},
					featured: []string{
						"google", "google-play", "youtube", "telegram", "netflix", "github", "cloudflare",
						"apple", "microsoft", "openai", "spotify", "twitter", "facebook", "instagram",
						"amazon", "steam", "discord", "reddit", "tiktok", "wikimedia", "category-ads-all",
						"category-ads", "category-porn", "category-games", "category-media",
						"category-social-media-cn", "category-social-media-!cn", "category-vpnservices",
						"geolocation-cn", "geolocation-!cn", "cn", "private",
					},
				},
				{
					kind:   KindGeoip,
					prefix: "geoip-",
					tree:   Tree{Owner: "SagerNet", Repo: "sing-geoip", Ref: "rule-set"},
					featured: []string{
						"ru", "cn", "us", "de", "nl", "gb", "fr", "jp", "sg", "tr", "ir", "by", "kz", "ua",
					},
				},
			},
		},
	}
}
