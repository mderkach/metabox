package logs

import (
	"context"
	"io"
	"testing"
)

func TestExecReadsUntilExit(t *testing.T) {
	out, err := Exec(t.Context(), "/bin/echo", "строка")
	if err != nil {
		t.Fatal(err)
	}

	data, err := io.ReadAll(out)
	if err != nil {
		t.Fatal(err)
	}

	if err := out.Close(); err != nil {
		t.Errorf("процесс, вышедший сам, закрылся с ошибкой %v", err)
	}

	if string(data) != "строка\n" {
		t.Errorf("вывод %q", data)
	}
}

func TestExecStopsWithContext(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())

	out, err := Exec(ctx, "/bin/sleep", "60")
	if err != nil {
		t.Fatal(err)
	}

	cancel()

	if _, err := io.ReadAll(out); err != nil {
		t.Fatal(err)
	}

	if err := out.Close(); err == nil {
		t.Error("убитый процесс закрылся без ошибки")
	}
}
