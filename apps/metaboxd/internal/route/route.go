// Package route объясняет маршрут соединения по наблюдаемым данным core.
//
// Своего evaluator'а правил sing-box здесь нет и не будет: повторение
// семантики матчинга сделало бы арбитром маршрута metabox, а не бинарь
// (ADR-0007). Список правил и сработавшее правило берутся у Clash API,
// индекс определяется сравнением условий, а всё, что вычислить нечем,
// помечается unknown, а не заменяется догадкой.
package route

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"metabox/internal/clashapi"
)

// Origin — происхождение утверждения. Значений ровно три, смешивать их нельзя,
// и утверждения без происхождения наружу не уходят.
type Origin string

const (
	// OriginObserved — пришло от core: список правил, сработавшее правило, цепочка.
	OriginObserved Origin = "observed"
	// OriginComputed — вычислено metabox или получено вопросом к бинарю.
	OriginComputed Origin = "computed"
	// OriginUnknown — вычислить нечем.
	OriginUnknown Origin = "unknown"
)

// ReasonCode — почему правило определить не вышло. Набор закрытый: текст
// пользователю выбирает панель по коду, а Reason остаётся подробностью на
// языке демона (ADR-0019).
type ReasonCode string

const (
	// ReasonNotInProcessList — условия у соединения есть, а правила с ними в
	// списке работающего процесса нет.
	ReasonNotInProcessList ReasonCode = "not_in_process_list"
)

// Kind — чем закончился подбор сработавшего правила.
type Kind string

const (
	// KindRule — правило найдено в списке работающего процесса.
	KindRule Kind = "rule"
	// KindFinal — ни одно правило не совпало, использован route.final. Это
	// наблюдаемый исход, а не неизвестность: core говорит о нём прямо.
	KindFinal Kind = "final"
	// KindUnknown — условия у соединения есть, а в списке правил не нашлись.
	KindUnknown Kind = "unknown"
)

var (
	// ErrNoConnection — соединения с таким идентификатором у core нет. Оно
	// могло закрыться между снапшотом, который видит панель, и этим запросом.
	ErrNoConnection = errors.New("соединения с таким идентификатором нет")

	// ErrRuntimeUnavailable — рантайм не ответил. Это отказ источника, а не
	// панели: экран обязан отличать «данных нет» от «демон сломался».
	ErrRuntimeUnavailable = errors.New("рантайм sing-box недоступен")
)

// Rule — правило работающего процесса. Индекс равен индексу узла в
// route.rules применённого документа: роутер строит список циклом по конфигу
// один к одному (ADR-0007).
type Rule struct {
	Origin     Origin `json:"origin"`
	Index      int    `json:"index"`
	Type       string `json:"type"`
	Conditions string `json:"conditions"`
	Action     string `json:"action"`
}

// Match — сработавшее правило. Index отдаётся указателем: ноль — валидный
// индекс, и отличить его от «индекса нет» иначе нельзя.
type Match struct {
	Origin     Origin `json:"origin"`
	Kind       Kind   `json:"kind"`
	Index      *int   `json:"index,omitempty"`
	Conditions string `json:"conditions,omitempty"`
	Action     string `json:"action,omitempty"`
	// ReasonCode заполняется только у Kind == KindUnknown: по нему панель берёт
	// текст на языке пользователя.
	ReasonCode ReasonCode `json:"reason_code,omitempty"`
	// Reason — та же причина словами демона. Запасной текст для кода, которого
	// панель не знает.
	Reason string `json:"reason,omitempty"`
}

// Chain — цепочка прокси соединения в том порядке, в каком её отдаёт core:
// от конечного узла к группе.
type Chain struct {
	Origin Origin   `json:"origin"`
	Nodes  []string `json:"nodes"`
}

// Explanation — ответ ручки объяснения маршрута.
type Explanation struct {
	ConnectionID string `json:"connection_id"`
	Match        Match  `json:"match"`
	Chain        Chain  `json:"chain"`
	// Rules — весь список работающего процесса. Панель сверяет его длину с
	// длиной route.rules применённого документа: процесс мог загрузить другой
	// конфиг, и вести пользователя на узел чужого файла нельзя (ADR-0007).
	Rules []Rule `json:"rules"`
}

// Source отдаёт разовые ответы Clash API. Интерфейс объявлен здесь, у
// потребителя, и содержит только чтение снапшота.
type Source interface {
	Snapshot(ctx context.Context, path string) (json.RawMessage, error)
}

// Explainer собирает объяснение по данным core.
type Explainer struct {
	source Source
}

// NewExplainer собирает объяснение поверх того же источника, что и поток
// рантайма: второго комплекта запросов к Clash API демон не заводит.
func NewExplainer(source Source) *Explainer {
	return &Explainer{source: source}
}

type clashRule struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Proxy   string `json:"proxy"`
}

type clashRules struct {
	Rules []clashRule `json:"rules"`
}

type clashConnection struct {
	ID     string   `json:"id"`
	Rule   string   `json:"rule"`
	Chains []string `json:"chains"`
}

type clashConnections struct {
	Connections []clashConnection `json:"connections"`
}

// Explain объясняет маршрут соединения: какое правило сработало, каким узлом
// конфига оно является и какой цепочкой ушёл трафик.
func (e *Explainer) Explain(ctx context.Context, id string) (Explanation, error) {
	connection, err := e.connection(ctx, id)
	if err != nil {
		return Explanation{}, err
	}

	rules, err := e.rules(ctx)
	if err != nil {
		return Explanation{}, err
	}

	return Explanation{
		ConnectionID: connection.ID,
		Match:        matchRule(connection.Rule, rules),
		Chain:        Chain{Origin: OriginObserved, Nodes: connection.Chains},
		Rules:        rules,
	}, nil
}

func (e *Explainer) connection(ctx context.Context, id string) (clashConnection, error) {
	body, err := e.source.Snapshot(ctx, "/connections")
	if err != nil {
		return clashConnection{}, fmt.Errorf("%w: соединения: %w", ErrRuntimeUnavailable, err)
	}

	var snapshot clashConnections
	if err := json.Unmarshal(body, &snapshot); err != nil {
		return clashConnection{}, fmt.Errorf("разбор снапшота соединений: %w", err)
	}

	for _, connection := range snapshot.Connections {
		if connection.ID == id {
			return connection, nil
		}
	}

	return clashConnection{}, ErrNoConnection
}

func (e *Explainer) rules(ctx context.Context) ([]Rule, error) {
	body, err := e.source.Snapshot(ctx, "/rules")
	if err != nil {
		return nil, fmt.Errorf("%w: список правил: %w", ErrRuntimeUnavailable, err)
	}

	var list clashRules
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, fmt.Errorf("разбор списка правил: %w", err)
	}

	rules := make([]Rule, 0, len(list.Rules))
	for index, rule := range list.Rules {
		rules = append(rules, Rule{
			Origin:     OriginObserved,
			Index:      index,
			Type:       rule.Type,
			Conditions: rule.Payload,
			Action:     rule.Proxy,
		})
	}

	return rules, nil
}

// matchRule находит правило соединения в списке работающего процесса.
//
// Сопоставление идёт по условиям: их оба источника рендерят одинаково. Из
// совпавших отбрасываются те, чьё действие перебор правил не прерывает, —
// записанным может оказаться только узел с route, reject, hijack-dns или
// bypass с непустым outbound. Из оставшихся берётся первый: роутер
// останавливается на первом совпадении (ADR-0007).
func matchRule(rule string, rules []Rule) Match {
	// Пустая строка значит то же, что `final`: gRPC форка оставляет поле
	// пустым, а Clash API подставляет слово (ADR-0007). Без этой проверки
	// пустые условия совпали бы с первым правилом без условий.
	if rule == "" || rule == clashapi.FinalRule {
		return Match{Origin: OriginObserved, Kind: KindFinal}
	}

	conditions, action, hasAction := clashapi.SplitRule(rule)

	for _, candidate := range rules {
		if candidate.Conditions != conditions || !terminates(candidate.Action) {
			continue
		}

		if hasAction && candidate.Action != action {
			continue
		}

		index := candidate.Index

		return Match{
			Origin:     OriginObserved,
			Kind:       KindRule,
			Index:      &index,
			Conditions: candidate.Conditions,
			Action:     candidate.Action,
		}
	}

	return Match{
		Origin:     OriginUnknown,
		Kind:       KindUnknown,
		ReasonCode: ReasonNotInProcessList,
		Reason:     "правила соединения нет в списке работающего процесса",
	}
}

// terminates отвечает, прерывает ли действие перебор правил.
//
// Определяется по строке действия, потому что другого признака у Clash API
// нет. `bypass()` без outbound перебор не прерывает и записанным сработавшим
// правилом не становится — у остальных bypass в скобках стоит имя outbound.
func terminates(action string) bool {
	name, arguments, _ := strings.Cut(action, "(")
	arguments = strings.TrimSuffix(arguments, ")")

	switch name {
	case "route", "reject", "hijack-dns":
		return true
	case "bypass":
		return arguments != ""
	default:
		return false
	}
}
