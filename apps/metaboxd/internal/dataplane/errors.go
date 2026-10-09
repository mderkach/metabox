package dataplane

import "fmt"

// FieldReason — почему значение опции не принято. Набор закрытый: по нему
// панель выбирает текст на языке пользователя.
type FieldReason string

const (
	// ReasonInvalid — значение не разобрано: не число, не IP, не MAC, не из
	// набора.
	ReasonInvalid FieldReason = "invalid"
	// ReasonOutOfRange — порт вне 1–65535.
	ReasonOutOfRange FieldReason = "out_of_range"
	// ReasonDuplicate — порт совпал с портом другого inbound.
	ReasonDuplicate FieldReason = "duplicate"
	// ReasonRequired — при включённой обвязке список пуст.
	ReasonRequired FieldReason = "required"
)

// FieldError — одно непринятое значение.
type FieldError struct {
	// Field — имя опции UCI.
	Field string `json:"field"`
	// Value — значение как в UCI; у элемента списка — сам элемент. Пусто у
	// ReasonRequired.
	Value  string      `json:"value"`
	Reason FieldReason `json:"reason"`
}

// InvalidError — модель в UCI не принята; Fields перечисляет все отказы сразу,
// чтобы владелец не чинил их по одному.
type InvalidError struct {
	Fields []FieldError
}

func (e *InvalidError) Error() string {
	return fmt.Sprintf("модель обвязки не принята: полей с ошибкой %d", len(e.Fields))
}
