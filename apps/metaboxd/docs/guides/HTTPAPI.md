# HTTP-слой демона

Только `net/http`. Роутер стандартной библиотеки с Go 1.22 умеет методы и wildcards, а middleware — обычная функция `func(http.Handler) http.Handler`; chi, gorilla и фреймворки не дают ничего, чего здесь не хватает, и стоят зависимости в артефакте.

## Роутинг

```go
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("GET /api/apply/{id}", s.handleApplyState)
	mux.HandleFunc("POST /api/apply/{id}/confirm", s.handleApplyConfirm)
	mux.HandleFunc("/api/", s.handleAPINotFound)
	mux.Handle("/", s.spa())

	return s.middleware(mux)
}
```

Метод в шаблоне обязателен: без него на `POST` ответит хендлер, написанный под `GET`. Параметр берётся `r.PathValue("id")`. Ручки API — под `/api/`, всё остальное отдаёт SPA.

Набор ручек Apply задан ADR-0002 и не переизобретается по ходу: `POST /api/apply`, `GET /api/apply/{id}`, `POST /api/apply/{id}/confirm`, ссылка на активную транзакцию в `GET /api/status`.

## Хендлеры

Хендлер — метод структуры с зависимостями, тонкий: разобрать запрос, вызвать предметный код, отдать ответ. Дисковых операций, `exec` и таймеров в нём нет.

```go
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	cfg, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxConfigBytes))
	if err != nil {
		s.fail(w, r, err)
		return
	}

	tx, err := s.applier.Start(r.Context(), cfg)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	s.writeJSON(w, http.StatusAccepted, tx)
}
```

`r.Context()` уходит в предметный код — при обрыве соединения отменяются и его шаги. Исключение — цикл применения: он переживает запрос по ADR-0002, поэтому получает собственный контекст, а не контекст запроса.

Тело запроса всегда ограничено `http.MaxBytesReader`: конфиг приходит байтами, и без лимита один запрос забирает столько памяти, сколько прислали.

Ответы пишет один хелпер: код, `Content-Type`, кодирование. Формат ошибки — единый, из [ErrorsAndLogging](./ErrorsAndLogging.md).

## Middleware

Цепочка собирается один раз, порядок — снаружи внутрь:

```go
func (s *Server) middleware(next http.Handler) http.Handler {
	return recoverPanic(s.log,
		logRequests(s.log,
			checkOrigin(s.allowedOrigin, next)))
}
```

`recoverPanic` снаружи — иначе паника в логировании уронит процесс. Каждая обёртка делает одно и тестируется отдельно. Аутентификации нет по решению A.6 PRD (осознанный риск), поэтому проверка источника — единственная защита мутирующих запросов.

## Проверка источника

Правило задано ADR-0002 и обсуждению в коде не подлежит: на мутирующих запросах хост из `Origin` обязан совпадать с `Host`, запрос без `Origin` отклоняется. Флаг `-allowed-origin` добавляет разрешённое значение и нужен дев-стенду: vite-прокси ходит с `changeOrigin: true` ([`apps/web/vite.config.ts:39`](../../../../apps/web/vite.config.ts)), то есть с переписанным `Host` и исходным `Origin`.

CORS-заголовки демон не отдаёт: UI живёт на том же origin, а разрешать чужие — прямо противоположно AC-19.

## Сервер и таймауты

```go
srv := &http.Server{
	Addr:              addr,
	Handler:           s.routes(),
	ReadHeaderTimeout: 10 * time.Second,
	ReadTimeout:       30 * time.Second,
	IdleTimeout:       60 * time.Second,
	ErrorLog:          slog.NewLogLogger(s.log.Handler(), slog.LevelError),
}
```

`WriteTimeout` глобально не ставим: он режет долгие ответы — прокси Clash API и поток соединений. Дедлайн задаётся точечно на конкретном ответе через `http.NewResponseController(w).SetWriteDeadline(...)`.

Слушаем только LAN-интерфейс (AC-18): адрес приходит флагом `-listen`, `0.0.0.0` в значении по умолчанию не появляется.

## Остановка

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

go func() {
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("сервер остановлен", "err", err)
	}
}()

<-ctx.Done()

shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
if err := srv.Shutdown(shutdownCtx); err != nil {
	log.Error("остановка не завершилась", "err", err)
}
```

`ErrServerClosed` — штатное завершение, ошибкой не считается. После `Shutdown` останавливаются и фоновые владельцы: таймер окна подтверждения дописывает состояние на диск, чтобы после старта его доиграли (ADR-0002). Процесс, убитый procd по таймауту, обязан оставить на диске состояние, по которому автооткат наступит.

## Раздача SPA

Статика встраивается `go:embed`. Директива не поднимается выше каталога своего пакета: `apps/web/dist` из `apps/metaboxd` или `internal/` так не достать. Значит либо embed-пакет лежит в корне модуля, либо `make daemon` копирует `apps/web/dist` в каталог пакета перед `go build`. Выбор фиксируется при реализации AC-17; формулировка «`go:embed` смотрит в `apps/web/dist`» из A.10 PRD описывает источник, а не путь в директиве.

Правила раздачи:

- неизвестный путь под `/api/` — 404 с телом ошибки, а не `index.html`: иначе фронт получит HTML вместо JSON и покажет ерунду;
- остальные неизвестные пути — `index.html` с `Cache-Control: no-cache`, роутинг клиентский;
- файлы с хэшем в имени — `Cache-Control: public, max-age=31536000, immutable`.

## Прокси Clash API

Демон проксирует Clash API sing-box (A.3 PRD) — `httputil.ReverseProxy`. Ответ не буферизуется: дашборд читает поток. Секрет подставляет демон, наружу он не уходит (см. запреты в [ErrorsAndLogging](./ErrorsAndLogging.md)). Недоступность sing-box — штатный ответ с состоянием, а не 500: панель обязана работать при лежащем сервисе (NFR-1).

## Тесты

Правила — [Testing](./Testing.md): `httptest` для сервера и для отдельного обработчика, фейки вместо предметных зависимостей.
