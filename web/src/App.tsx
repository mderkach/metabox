import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Switch,
} from "@/shared/ui"

function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>metabox</CardTitle>
          <CardDescription>
            Заглушка. Проверка тулинга: Tailwind + примитивы shadcn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="listen">Адрес прослушивания</FieldLabel>
              <Input id="listen" defaultValue="127.0.0.1:9090" />
            </Field>
            <Field orientation="horizontal">
              <Switch id="sniff" />
              <FieldLabel htmlFor="sniff">Sniff</FieldLabel>
            </Field>
            <Button type="button">Применить</Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </main>
  )
}

export default App
