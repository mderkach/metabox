package ruleset

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"sync"
	"time"
)

//go:embed snapshot.json
var snapshot []byte

// Lister читает имена файлов дерева поставщика. Интерфейс объявлен здесь, у
// потребителя.
type Lister interface {
	List(ctx context.Context, tree Tree, etag string) (Listing, error)
}

// Store хранит сверенный перечень между перезапусками. Служебным каталогом
// владеет config.Store, поэтому запись идёт через него. Отсутствие файла —
// ошибка, для которой errors.Is(err, fs.ErrNotExist).
type Store interface {
	ReadRuleSets(ctx context.Context) ([]byte, error)
	WriteRuleSets(ctx context.Context, data []byte) error
}

// entry — перечень одного списка в кэше и снимке.
type entry struct {
	Categories []string `json:"categories"`
	ETag       string   `json:"etag,omitempty"`
	UpdatedAt  int64    `json:"updated_at"`
	source     ListSource
}

// file — формат кэша и снимка: перечни по ключу `поставщик/вид`.
type file struct {
	Lists map[string]entry `json:"lists"`
}

// Updater держит каталог и сверяет его с поставщиками по таймеру всё время
// жизни демона, открыта панель или нет, — исключение из правила «фоновых
// опросов без потребителя нет»; цена и причина — ADR-0034.
type Updater struct {
	lister   Lister
	store    Store
	log      *slog.Logger
	interval time.Duration
	retry    time.Duration

	mu    sync.Mutex
	lists map[string]entry

	stop context.CancelFunc
	done chan struct{}
}

// NewUpdater собирает каталог из встроенного снимка и сохранённого перечня.
// Сверки он не начинает: её поднимает Start. Испорченный кэш не мешает
// запуску — каталог остаётся на снимке, а следующая сверка его перепишет.
//
// Нулевой интервал отключает сверку. Интервал короче паузы повтора
// отвергается: без токена GitHub даёт 60 запросов в час, и частая сверка
// выбрала бы лимит, так и не дойдя до повтора.
func NewUpdater(ctx context.Context, lister Lister, store Store, log *slog.Logger, interval, retry time.Duration) (*Updater, error) {
	if interval > 0 && interval < retry {
		return nil, fmt.Errorf("интервал сверки %s короче паузы повтора %s", interval, retry)
	}

	lists, err := decode(snapshot, ListSourceSnapshot)
	if err != nil {
		return nil, fmt.Errorf("встроенный снимок каталога: %w", err)
	}

	u := &Updater{lister: lister, store: store, log: log, interval: interval, retry: retry, lists: lists}

	cached, err := store.ReadRuleSets(ctx)

	switch {
	case errors.Is(err, fs.ErrNotExist):
	case err != nil:
		log.Warn("кэш каталога наборов не прочитан, каталог на снимке", "err", err)
	default:
		saved, err := decode(cached, ListSourceProvider)
		if err != nil {
			log.Warn("кэш каталога наборов испорчен, каталог на снимке", "err", err)

			break
		}

		for name, e := range saved {
			if _, known := u.lists[name]; known {
				u.lists[name] = e
			}
		}
	}

	return u, nil
}

func decode(data []byte, source ListSource) (map[string]entry, error) {
	var f file
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}

	lists := make(map[string]entry, len(f.Lists))
	for name, e := range f.Lists {
		e.source = source
		lists[name] = e
	}

	return lists, nil
}

// Catalog отдаёт каталог в том виде, в каком его получает панель. Срезы
// категорий общие с внутренним состоянием: сверка подменяет их целиком и на
// месте не меняет, поэтому копировать четыре тысячи строк на запрос незачем.
func (u *Updater) Catalog() Catalog {
	u.mu.Lock()
	defer u.mu.Unlock()

	specs := providers()
	catalog := Catalog{Providers: make([]Provider, 0, len(specs))}

	for _, p := range specs {
		provider := Provider{ID: p.id, Name: p.name, Lists: make([]List, 0, len(p.lists))}

		for _, l := range p.lists {
			e := u.lists[key(p.id, l.kind)]
			categories := e.Categories
			if categories == nil {
				categories = []string{}
			}

			provider.Lists = append(provider.Lists, List{
				Kind:       l.kind,
				Prefix:     l.prefix,
				Mirrors:    l.tree.mirrors(),
				Featured:   l.featured,
				Categories: categories,
				Source:     e.source,
				UpdatedAt:  e.UpdatedAt,
			})
		}

		catalog.Providers = append(catalog.Providers, provider)
	}

	return catalog
}

// Start поднимает сверку на всё время работы демона. Нулевой интервал
// оставляет каталог на снимке и кэше: сеть демон не трогает.
func (u *Updater) Start() {
	u.mu.Lock()
	defer u.mu.Unlock()

	if u.stop != nil || u.interval <= 0 {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	u.stop, u.done = cancel, make(chan struct{})

	go func(done chan struct{}) {
		defer close(done)
		u.run(ctx)
	}(u.done)
}

// Close останавливает сверку и дожидается её.
func (u *Updater) Close() {
	u.mu.Lock()
	stop, done := u.stop, u.done
	u.stop, u.done = nil, nil
	u.mu.Unlock()

	if stop == nil {
		return
	}

	stop()
	<-done
}

// run сверяет каталог, как только он устарел, дальше — раз в интервал.
// Неудачная сверка повторяется через retry, а не через интервал: на старте
// роутера сеть и часы поднимаются позже демона, и первая попытка часто
// проваливается.
func (u *Updater) run(ctx context.Context) {
	timer := time.NewTimer(u.untilStale(time.Now()))
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		next := u.interval
		if err := u.refresh(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}

			u.log.Warn("каталог наборов не сверен с поставщиками", "err", err, "retry", u.retry)
			next = u.retry
		} else {
			u.log.Info("каталог наборов сверен с поставщиками", "next", next)
		}

		timer.Reset(next)
	}
}

// untilStale — сколько ждать до сверки. Снимок и перечень с датой из будущего
// сверяются сразу: второе значит, что часы роутера ещё не синхронизованы, и
// возраст по ним не посчитать.
func (u *Updater) untilStale(now time.Time) time.Duration {
	u.mu.Lock()
	defer u.mu.Unlock()

	wait := u.interval

	for _, e := range u.lists {
		updated := time.Unix(e.UpdatedAt, 0)
		if e.source == ListSourceSnapshot || updated.After(now) {
			return 0
		}

		wait = min(wait, max(0, u.interval-now.Sub(updated)))
	}

	return wait
}

// refresh сверяет каждый список с поставщиком и сохраняет результат. Список,
// который не сверился, остаётся прежним; ошибки всех списков собираются вместе.
func (u *Updater) refresh(ctx context.Context) error {
	var errs []error

	for _, p := range providers() {
		for _, l := range p.lists {
			name := key(p.id, l.kind)

			u.mu.Lock()
			etag := u.lists[name].ETag
			u.mu.Unlock()

			listing, err := u.lister.List(ctx, l.tree, etag)
			if err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", name, err))

				continue
			}

			if err := u.apply(name, l.prefix, listing, time.Now()); err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", name, err))
			}
		}
	}

	if err := u.save(ctx); err != nil {
		errs = append(errs, err)
	}

	return errors.Join(errs...)
}

func (u *Updater) apply(name, prefix string, listing Listing, now time.Time) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	e := u.lists[name]

	if !listing.NotModified {
		found := categories(listing.Names, prefix)
		if len(found) == 0 {
			return errEmpty
		}

		e.Categories = found
	}

	e.ETag = listing.ETag
	e.UpdatedAt = now.Unix()
	e.source = ListSourceProvider
	u.lists[name] = e

	return nil
}

// save пишет сверенные списки. Списки, ещё не сверенные ни разу, в кэш не
// попадают: иначе снимок после перезапуска выдавал бы себя за сверенный.
func (u *Updater) save(ctx context.Context) error {
	u.mu.Lock()
	f := file{Lists: map[string]entry{}}
	for name, e := range u.lists {
		if e.source == ListSourceProvider {
			f.Lists[name] = e
		}
	}
	u.mu.Unlock()

	if len(f.Lists) == 0 {
		return nil
	}

	data, err := json.Marshal(f)
	if err != nil {
		return fmt.Errorf("кэш каталога: %w", err)
	}

	if err := u.store.WriteRuleSets(ctx, data); err != nil {
		return fmt.Errorf("кэш каталога: %w", err)
	}

	return nil
}

// Snapshot сверяет все списки с поставщиками и отдаёт их в формате снимка.
// Им собирается `snapshot.json`, который встраивается в бинарь.
func Snapshot(ctx context.Context, lister Lister, now time.Time) ([]byte, error) {
	f := file{Lists: map[string]entry{}}

	for _, p := range providers() {
		for _, l := range p.lists {
			listing, err := lister.List(ctx, l.tree, "")
			if err != nil {
				return nil, fmt.Errorf("%s: %w", key(p.id, l.kind), err)
			}

			found := categories(listing.Names, l.prefix)
			if len(found) == 0 {
				return nil, fmt.Errorf("%s: %w", key(p.id, l.kind), errEmpty)
			}

			f.Lists[key(p.id, l.kind)] = entry{Categories: found, ETag: listing.ETag, UpdatedAt: now.Unix()}
		}
	}

	return json.MarshalIndent(f, "", "  ")
}
