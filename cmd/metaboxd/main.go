// Command metaboxd is the metabox daemon. It serves the web UI and owns the
// sing-box configuration on the device.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"metabox/internal/version"
)

func main() {
	addr := flag.String("listen", "127.0.0.1:8080", "address to listen on")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","version":"` + version.Version + `"}`))
	})

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("metaboxd %s listening on %s", version.Version, *addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
