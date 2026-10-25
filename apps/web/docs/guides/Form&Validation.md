# Forms and validation

React Hook Form + Zod through `@hookform/resolvers`. Uncontrolled fields are chosen for the render count: a config with 500 rules cannot be handled with controlled state.

Russian strings in quotes below, such as «Форма», are interface labels as the panel shows them.

## Requirements

1. Every form has a **model**: a type derived from a Zod schema.
2. A composite form is wrapped in `FormProvider`; child components take methods from `useFormContext<FormModel>()`, **with the generic**, otherwise typing is lost.
3. Fields are registered through `<Controller />`: shadcn/Base UI primitives do not forward `ref` to the native input uniformly.
4. A form is split into subcomponents, but with an eye on the "Performance" section below.

```tsx
interface FormModel extends z.infer<typeof RuleFormSchema> {}

function RuleForm() {
  const form = useForm<FormModel>({
    defaultValues: { domain: '', outbound: '' },
    mode: 'onChange',
    resolver: zodResolver(RuleFormSchema),
  });

  return (
    <FormProvider {...form}>
      <RuleDomainField />
    </FormProvider>
  );
}

function RuleDomainField() {
  const { control } = useFormContext<FormModel>();

  return <Controller control={control} name='domain' render={({ field }) => <Input {...field} />} />;
}
```

## RHF constraints that matter for the project

- **Field names use dot notation only**: `outbounds.2.uuid`. Bracket syntax is not supported; the autorenderer prints paths with dots.
- **A form is typed against the node type**, not the whole config. `Path<T>` over a union of 57 branches would take the compiler down. This is exactly why the document lives in Zustand, and a form opens on one node: `VLESSOutboundOptions`, not `ConfigModel`.
- The autorenderer has no path type safety: there it is a string and a type cast. The cast comes with a comment; this is the only place where it is allowed.

## Performance

RHF works through React Context, hence the [known pitfalls](https://react-hook-form.com/faqs#Howtoworkwithmodalortabforms).

### Conditional rendering

Mounting a field calls `register`, that is, a form change: a rerender and validation. Options:

- hide the block with CSS instead of unmounting it;
- give each step its own form, saving the data to the store on unmount;
- consciously accept the slowdown if the form is small.

### External context above the form

A change of an external React context above `FormProvider` renders the controlled fields and can cause unexpected side effects. If the data is needed deep inside, pass it through the form's own `context`:

```tsx
const form = useForm<FormModel, StepContext>({
  defaultValues: { name: '' },
  context: stepContext,
});

// inside
const {
  control,
  control: {
    _options: { context },
  },
} = useFormContext<FormModel, StepContext>();
```

This accesses an internal RHF field: a compromise, use it selectively and with a comment.

## Zod

### General rules

- A schema is `z.object({ ... })`, fields are annotated with JSDoc: the annotations are visible in IDE hints. The autorenderer does not see them: JSDoc does not get into the runtime schema.
- The type is extracted with `z.infer`, not duplicated by hand.
- A schema is extended with `.extend()`, not by copy-pasting fields.
- An external type that is expensive to move to `z.infer`: `z.custom<T>()`.

As the message, a schema returns a **failure code**, not a localization key: the
`ui` of its slice inserts the text by a code table. A key in the schema looks
working, but `ui` translates by code, and an unknown message finds no
translation: the field ends up with no `role='alert'` block at all, so the form
stays silent instead of naming the error.

```ts
export const RULE_FORM_ERROR = {
  DomainRequired: 'domainRequired',
  OutboundRequired: 'outboundRequired',
} as const;

export const RuleFormSchema = z.object({
  /** Domain or domain suffix the rule matches */
  domain: z.string().min(1, RULE_FORM_ERROR.DomainRequired),
  /** Tag of the outbound the traffic goes to */
  outbound: z.string().min(1, RULE_FORM_ERROR.OutboundRequired),
});

export type RuleFormModel = z.infer<typeof RuleFormSchema>;
```

A reference for linking codes to texts: `features/Rule/RuleEdit`, codes in
`model/RuleEdit.schema.ts`, the translation table in `ui/RuleEditForm.tsx`.

### Generated schemas are untouchable

`src/shared/api/generated.ts` is written by `tools/schemagen`. Rules:

- **no `.transform()` inside them**: the autorenderer reads the node schema definition, and `transform` turns the object into a `ZodPipe`: the node fields are not visible behind it, and the whole node would fall back to the raw widget;
- everything that needs transformation is transformed in the `model` segment of its slice or in a separate form adapter schema, but not in the generated file.

### Adapter: when the UI does not match the DTO

A form is often more convenient for the user in one shape, while the server needs a different structure. Split them into two schemas and join them with `.transform()`, in a **handwritten** schema, not in a generated one.

```ts
// what is convenient to control in the UI
const RuleFormSchema = z.object({
  matchKind: z.enum(['domain', 'domainSuffix', 'ipCidr']),
  value: z.string(),
  outbound: z.string(),
});

// what goes into the config
const RuleAdapterSchema = RuleFormSchema.transform((data) => ({
  ...(data.matchKind === 'domain' && { domain: [data.value] }),
  ...(data.matchKind === 'domainSuffix' && { domain_suffix: [data.value] }),
  ...(data.matchKind === 'ipCidr' && { ip_cidr: [data.value] }),
  outbound: data.outbound,
}));
```

The form takes data by `RuleFormSchema`, validates by `RuleAdapterSchema`, and `handleSubmit` outputs a structure ready to be written: no mapping outside is needed.

### Validation outside the form

Not every check lives in the schema. If validity is determined by the server (for example, `sing-box check` for the whole config), the calling code is responsible for it, and the check is removed from the schema. Do not mix a synchronous schema and a server verdict in one resolver.

## Autorenderer

A node of a section with a fork type registry (`inbounds`, `outbounds`, `endpoints`, `providers`, `services`, `certificate_providers`, `dns.servers`) opens in a form drawn by `features/Config/ConfigNodeForm` from the generated schema of its type ([ADR-0035](../../../../docs/adr/ADR-0035-render-node-forms-from-the-generated-schema.md)). There is no handwritten field table per type: a new fork type gets a form by rebuilding the schema.

### Definition introspection, not JSON Schema

The schema is read by walking `_zod.def`, not through `z.toJSONSchema()`. The converter pulls about 64 kB of Zod sources into the chunk and spends about 17 ms per node, while the field kind needs only one pass over the definition, which is also what the form resolver sees.

All work with Zod internals is closed behind the `shared/lib/schemaShape.ts` module: the module has no domain knowledge, so it lives in `shared`, not in the renderer slice. It turns a node schema into a field plan `FieldPlan` (key, path from the node root, field kind, enum values, child fields of a group) and returns the variants of a registry's discriminated union (`toVariants`). The kind is recognized by checking the core constructor (`instanceof z.core.$ZodString`), not by a type cast. A Zod major upgrade changes only this module; a test walking all registry types fails on the first mismatch.

The entity knows the registries: `entities/Config` reads the generated unions and returns the type schema (`nodeSchemaOf`), the "node recognized" flag (`isNodeRecognized`) and the type's build tag (`buildTagOfType`). The feature does not read `@shared/api/generated`: the linter enforces this.

### Field kind → widget

| Kind       | Schema                                                                         | Widget                                                        |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `string`   | `z.string()`                                                                   | input field                                                   |
| `duration` | `z.string().regex(…)` with the Go duration pattern from the generator          | input field with a format example `10s`, `1m30s`              |
| `int`      | `z.int()`                                                                      | number field; empty means no key                              |
| `number`   | `z.number()`                                                                   | number field; empty means no key                              |
| `boolean`  | `z.boolean()`                                                                  | switch and a "reset" button («сбросить») that removes the key |
| `enum`     | `z.enum()`                                                                     | select; the empty item means no key                           |
| `literal`  | `z.literal()`: the `type` discriminator                                        | not drawn: the type changes only with a new node              |
| `list`     | `z.array(z.string())` or listable `z.union([X, z.array(X)])`                   | multiline field, one value per line                           |
| `enumList` | the same over `z.enum()`                                                       | group of switches with multiple selection                     |
| `scalar`   | union of string and integer (`FwMark`, `UDPTimeoutCompat`)                     | input field; an entry of digits only is written as a number   |
| `group`    | `z.strictObject()` no deeper than `MAX_DEPTH`                                  | `FieldSet` with `FieldLegend`, collapsed while empty          |
| `raw`      | everything else: union of string and object, array of objects, nested registry | JSON text of the subnode; secrets masked until shown          |

- The "kind → widget" table is a `Record<FieldKind, Widget>` in the `ui` of the renderer slice; a new kind is added by an entry, not by an `if` branch. A kind unknown to recognition goes to `raw`: the field is not lost and does not break the form.
- Fields that went to `raw` across all registry types are listed in a snapshot of the walk test (`ConfigNodeForm.coverage.test.tsx`): growth of the list is visible in the diff.
- A listable field with one line is written as a string, not as an array of one element: the fork writes it this way too.
- A field path is a dotted string (`tls.reality.public_key`) without type safety. The form is typed as `Record<string, unknown>`, so a cast to `Path<…>` is not needed; if it becomes needed, it is covered by a comment with the reason, and this is the only place where it is allowed.
- A widget gets the path and the field plan and knows nothing about the specific node. Labels are key names: there are no godoc descriptions in the runtime schema (the generator carries them as JSDoc comments, not as `.describe()`/`.meta()`), so fields have no hints yet.
- An unrecognized node ([ADR-0018](../../../../docs/adr/ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md)) gets no form: the "Form" tab («Форма») is disabled, the node opens as text. Object sections `log`, `ntp` and `certificate` are edited only as text. Scalars of the `route` and `dns` sections (`final`, `strategy` and neighbours) are opened by `ConfigSectionForm` with the same renderer: the schema is the generated section schema without its lists (`entities/Config`, `Config.settings.ts`), the lists are edited on their own screens. The `experimental` object section is in the same table with no lists: it opens by `ConfigSectionForm` on the "Form" tab of its node, so `clash_api.secret` is masked like a secret of a node.
- The node form on the sections screen is placed by the `widgets/Config/ConfigNode` widget: tabs "Form" («Форма») and "JSON". Which registry gets an autoform is decided by its `NODE_FORM_POLICY` table: services have no autoform, a form is required only for `api` (PRD, section 8): a registry with the "overrides only" policy opens in a form a type that has an entry in `NODE_OVERRIDE`, other services are edited as text.

### Type overrides

A type for which the autoform is not enough gets an entry in the `NODE_OVERRIDE` table (`features/Config/ConfigNodeForm/model/ConfigNodeForm.overrides.ts`), not its own form next to it: fields, leaf writes and the resolver stay shared.

- `primary`: main fields on top, in order; a nested one is lifted out of its group and labelled with the full path (`tls.reality.public_key`). The other fields of the type follow: those set in the node are visible, empty ones are under the "More parameters (N)" collapsible («Ещё параметры (N)»), closed by default. Types without an override have the same collapsible for empty fields.
- `widgets`: a field kind instead of the kind from the schema: the VLESS `flow` string is drawn as a select of the fork's values.
- `required` and `refine`: checks on top of the schema, with a failure code, as in handwritten schemas. The resolver gets the node before the edit through the form context (`context`): `refine` does not recheck the format of a value the user did not touch (`sing-box check` is its arbiter), and the form does not prevent editing a neighbouring field.
- `preset`: a new node of the type in the add form (`features/Config/ConfigNodeAdd`, through `@x`): only what the type cannot be built without.

An option from `BUILD_TAG_OF_OPTION` that is not in the binary build (`tls.utls`: `with_utls`) is marked on the topmost field it belongs to: on the group or on a field lifted out of it.

### Leaf writes

The form assembles the whole node value, but only changed leaves go into the document: `diffNode(path, before, after)` from `entities/Config` compares the node before and after the edit and returns edits `{ path, value }`, the store applies them with one `editMany`: one draft update, not a series.

- A leaf is a scalar or a whole array; objects are compared by keys.
- `null`, `''`, `[]` and `undefined` mean "no key" (`compactNode`): a cleared field is removed from the node, not written empty. The form holds a cleared field as `null`, not `undefined`: React Hook Form reads `undefined` as "take the default value" and puts the original back into the field.
- An untouched field produces no edit, even if the form holds it in a different shape.

So the diff after editing one field is one line, and comments inside the node are intact ([ADR-0004](../../../../docs/adr/ADR-0004-edit-config-text-in-place-on-the-client.md), AC-2). Writing the whole node with `edit(path, node)` would rewrite it together with the comments: only the node's text mode works this way.

### Form and draft

```ts
useForm<ConfigNodeFormModel>({
  defaultValues: node,
  values: node,
  resetOptions: { keepDirtyValues: true },
  mode: 'onChange',
  resolver: toNodeFormResolver(schema),
});
```

`values` pulls into the form an external edit of the same node (as text in the neighbouring tab), and `keepDirtyValues` keeps it from erasing what the user has already typed. After a write, `form.reset(data)` makes the saved value the new baseline.

The node comes from text parsing as objects without a prototype: RHF does not copy those, and editing a field would also rewrite the original values, so the form would not know it was touched. That is why `values` is a copy of the node (`structuredClone`).

The resolver is the node type schema, and it checks what will go into the document: cleared fields drop out before the check, otherwise an empty duration would fail the pattern. The generated schema carries no failure codes, so the renderer's `ui` translates the error by the Zod issue code: `invalid_format` is a duration not in Go format, `too_small` is a negative number, `too_big` is a number above the Go type of the field (a port above 65535), `invalid_type` is a value of the wrong type. `sing-box check` on apply stays the arbiter of validity: the binary can still reject a node that is valid by the schema.

## Arrays and order

This is also a decision made in advance: `useFieldArray` is not used in the panel yet; lists are edited by document patches in the store, not by a form. The rules below apply from the moment a list gets a form.

- Lists (`route.rules`, `outbounds`) use `useFieldArray`.
- The row key is `field.id`, not the index: on reordering, indexes shift and React reuses the wrong nodes.
- Reordering is `move`, insertion is `insert`; rebuilding the whole array is forbidden, it loses field state.

## Default values

`defaultValues` are filled from the config node as is. A field absent in the config stays absent: an empty string is not written into the model in its place, and `handleSubmit` does not output it.

The reason: after editing one field, the diff with the original file must contain only that edit. A form that diligently fills in defaults breaks this requirement silently.

## Raw JSON

- Raw mode is available on any node: text → `JSON.parse` → validation with this node's schema → write to the store as one patch.
- A parse error is shown in place and does not erase the entered text.
- An unrecognized node gets no form at all: it is shown as a raw block marked "not covered by the UI" («UI не покрывает») and saved without changes.

## Errors from the device

The `sing-box check` output is a verdict on the whole config. For now it is shown in full in the apply bar: there is no parsing down to a specific node. When it appears, a parsed error is attached to the field of its node, and an unparsed one is still shown in full, without attempts to guess the field.
