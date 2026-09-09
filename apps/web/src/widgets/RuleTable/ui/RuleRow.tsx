import { ArrowRight } from "lucide-react"
import { memo } from "react"

import type { RuleRow as RuleRowModel } from "@entities/Rule"
import { cn } from "@shared/lib/utils"

import { RULE_COLUMN } from "./RuleColumns"
import { RuleMatcherChip } from "./RuleMatcherChip"

function RuleRowProto({ rule }: { rule: RuleRowModel }) {
  return (
    <div
      className={cn(
        RULE_COLUMN.Row,
        "border-b border-border hover:bg-muted/50"
      )}
    >
      <span className={RULE_COLUMN.Index}>{rule.index}</span>

      <div className="flex min-w-0 grow items-center gap-1.5 overflow-hidden">
        {rule.isCatchAll ? (
          <span className="text-sm text-muted-foreground">
            без условий — применяется ко всему трафику
          </span>
        ) : (
          rule.matchers.map((matcher) => (
            <RuleMatcherChip key={matcher.key} matcher={matcher} />
          ))
        )}
      </div>

      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />

      <span className={RULE_COLUMN.Target} title={rule.target}>
        {rule.target}
      </span>
    </div>
  )
}

export const RuleRow = memo(RuleRowProto)
