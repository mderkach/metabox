// Package ruleset — каталог готовых наборов правил: какие поставщики есть,
// откуда качаются их файлы и какие категории они публикуют.
//
// Перечень категорий демон сверяет с поставщиками сам и отдаёт панели. Панель
// каталога не хранит: иначе он жил бы вторым экземпляром и расходился с тем,
// что поставщик публикует на самом деле.
package ruleset

import "fmt"

// ListKind — что за списки отдаёт набор: домены или адреса.
type ListKind string

// Виды списков.
const (
	KindGeosite ListKind = "geosite"
	KindGeoip   ListKind = "geoip"
)

// ListSource — откуда взят перечень категорий.
type ListSource string

// Источники перечня.
const (
	// ListSourceSnapshot — снимок, встроенный в бинарь при сборке: с поставщиком
	// демон ещё не сверялся.
	ListSourceSnapshot ListSource = "snapshot"
	// ListSourceProvider — перечень сверен с поставщиком.
	ListSourceProvider ListSource = "provider"
)

// Mirror — адрес, по которому sing-box качает файлы набора. До основного
// адреса из России дотягиваются не всегда, поэтому зеркал несколько.
type Mirror struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Base — начало адреса до имени файла, со слэшем на конце.
	Base string `json:"base"`
}

// List — один вид списков у поставщика.
type List struct {
	Kind ListKind `json:"kind"`
	// Prefix — приставка имени файла: `geosite-` + категория + `.srs`.
	Prefix  string   `json:"prefix"`
	Mirrors []Mirror `json:"mirrors"`
	// Featured — что показать, пока поле категории пустое, в порядке от
	// общего к частному.
	Featured []string `json:"featured"`
	// Categories — все категории, для которых у поставщика есть файл `.srs`,
	// по алфавиту.
	Categories []string   `json:"categories"`
	Source     ListSource `json:"source"`
	// UpdatedAt — когда перечень последний раз сверен с поставщиком, а у
	// снимка — когда снимок собран; секунды Unix. Справочная величина: у
	// роутера нет часов реального времени, но сверка идёт по TLS, а он без
	// синхронизованных часов не пройдёт.
	UpdatedAt int64 `json:"updated_at"`
}

// Provider — поставщик готовых наборов.
type Provider struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Lists []List `json:"lists"`
}

// Catalog — ответ ручки каталога.
type Catalog struct {
	Providers []Provider `json:"providers"`
}

// Tree — каталог ветки на GitHub, где поставщик публикует файлы `.srs`.
type Tree struct {
	Owner string
	Repo  string
	Ref   string
	// Dir — путь внутри ветки без слэшей по краям; пустой — корень ветки.
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

// key — имя списка в кэше и снимке.
func key(providerID string, kind ListKind) string {
	return providerID + "/" + string(kind)
}

// providers — таблица поставщиков. В каталог попадает только тот, чей шаблон
// адреса проверен: неверный адрес нельзя отличить от недоступного поставщика,
// а цена ошибки — несостоявшийся старт sing-box. Источник, которого здесь нет,
// панель подключает своим адресом.
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
