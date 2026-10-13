package clashapi

import "strings"

// FinalRule is the string the Clash API uses to mark a connection that matched no
// rule: route.final was used. There is no element with such a name in the
// rule list.
const FinalRule = "final"

// ruleSeparator is what the Clash API joins the rule conditions to its action with.
// The fork gRPC does not return the action at all, and the separator is absent from its string.
const ruleSeparator = " => "

// SplitRule separates the rule conditions and its action.
//
// Only one place knows the format: the string is built by the fork renderer, and repeating
// the parsing in every consumer would mean fixing a version bump in two places.
// The third return value is the presence of the action: it shows whether the
// source returned it or not.
func SplitRule(rule string) (conditions, action string, hasAction bool) {
	conditions, action, hasAction = strings.Cut(rule, ruleSeparator)

	return strings.TrimSpace(conditions), strings.TrimSpace(action), hasAction
}
