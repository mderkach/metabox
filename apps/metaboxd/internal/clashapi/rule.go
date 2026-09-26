package clashapi

import "strings"

// FinalRule — строка, которой Clash API обозначает соединение, не совпавшее ни
// с одним правилом: использован route.final. Элемента с таким именем в списке
// правил нет.
const FinalRule = "final"

// ruleSeparator — чем Clash API склеивает условия правила с его действием.
// gRPC форка действие не отдаёт вовсе, и разделителя в его строке не бывает.
const ruleSeparator = " => "

// SplitRule разводит условия правила и его действие.
//
// Формат знает одно место: строка собирается рендером форка, и повторять
// разбор в каждом потребителе значило бы чинить подъём версии в двух местах.
// Третьим значением возвращается наличие действия — по нему видно, отдал его
// источник или нет.
func SplitRule(rule string) (conditions, action string, hasAction bool) {
	conditions, action, hasAction = strings.Cut(rule, ruleSeparator)

	return strings.TrimSpace(conditions), strings.TrimSpace(action), hasAction
}
