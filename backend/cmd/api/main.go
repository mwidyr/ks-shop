package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"sort"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"ordermgmt/internal/config"
	"ordermgmt/internal/db"
	"ordermgmt/internal/handlers"
	appmw "ordermgmt/internal/middleware"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

const uploadDir = "uploads"

func main() {
	cfg := config.Load()

	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("failed to connect to database: ", err)
	}
	defer pool.Close()

	runMigrations(pool)

	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatal("failed to create upload dir: ", err)
	}

	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	authH := &handlers.AuthHandler{DB: pool, JWTSecret: cfg.JWTSecret}
	productH := &handlers.ProductHandler{DB: pool}
	orderH := &handlers.OrderHandler{DB: pool}
	customerH := &handlers.CustomerHandler{DB: pool}
	dashboardH := &handlers.DashboardHandler{DB: pool}
	hostH := &handlers.HostHandler{DB: pool}
	pickupChainH := &handlers.PickupChainHandler{DB: pool}
	uploadH := &handlers.UploadHandler{
		UploadDir:           uploadDir,
		CloudinaryCloudName: cfg.CloudinaryCloudName,
		CloudinaryAPIKey:    cfg.CloudinaryAPIKey,
		CloudinaryAPISecret: cfg.CloudinaryAPISecret,
	}
	imageH := &handlers.ProductImageHandler{DB: pool}
	feesH := &handlers.FeeSettingsHandler{DB: pool}
	shippingSettingsH := &handlers.ShippingSettingsHandler{DB: pool}
	pickingH := &handlers.PickingHandler{DB: pool}
	pickupLinkH := &handlers.PickupLinkHandler{DB: pool}

	internalRoles := []string{"sales", "spv", "management", "super_user"}
	catalogWriteRoles := []string{"super_user", "management"}

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))

	r.Route("/api", func(r chi.Router) {
		// Public
		r.Post("/auth/login", authH.Login)
		r.Get("/public/pickup/{token}", pickupLinkH.PublicGet)

		// Authenticated (any internal role)
		r.Group(func(r chi.Router) {
			r.Use(appmw.JWTAuth(cfg.JWTSecret))
			r.Use(appmw.RequireRole(internalRoles...))

			r.Get("/products", productH.List)
			r.Get("/products/{id}", productH.Detail)

			r.Get("/orders", orderH.List)
			r.Get("/orders/{id}", orderH.Detail)
			r.Post("/orders", orderH.Create)
			r.Patch("/orders/{id}/status", orderH.UpdateStatus)
			r.Patch("/orders/{id}/notes", orderH.UpdateNotes)
			r.Post("/orders/{id}/attachments", orderH.AddAttachment)
			r.Patch("/order-items/{itemId}/pick", orderH.PickItem)
			r.Post("/orders/{id}/split", orderH.Split)

			r.Get("/dashboard/summary", dashboardH.Summary)
			r.Get("/dashboard/graph", dashboardH.Graph)
			r.Get("/dashboard/host-ranking", dashboardH.HostRanking)
			r.Get("/dashboard/top-products", dashboardH.TopProducts)
			r.Get("/dashboard/profit", dashboardH.Profit)
			r.Get("/dashboard/alerts", dashboardH.Alerts)

			r.Get("/hosts", hostH.List)
			r.Get("/pickup-chains", pickupChainH.List)

			r.Get("/customers", customerH.Search)
			r.Post("/customers", customerH.Create)
			r.Get("/customers/stats", customerH.Stats)

			r.Get("/settings/fees", feesH.Get)
			r.Get("/settings/shipping", shippingSettingsH.Get)
			r.Get("/picking-queue", pickingH.Queue)
			r.Get("/pickup-links", pickupLinkH.List)
			r.Post("/pickup-links", pickupLinkH.Create)
			r.Patch("/pickup-links/{id}", pickupLinkH.Update)
		})

		// Catalog & reference-data management: super_user + management only
		r.Group(func(r chi.Router) {
			r.Use(appmw.JWTAuth(cfg.JWTSecret))
			r.Use(appmw.RequireRole(catalogWriteRoles...))

			r.Post("/products", productH.Create)
			r.Patch("/products/{id}", productH.Update)
			r.Post("/products/{id}/variants", productH.CreateVariant)
			r.Patch("/products/{id}/variants/{variantId}", productH.UpdateVariant)
			r.Delete("/products/{id}", productH.Delete)
			r.Post("/products/{id}/images", imageH.AddImage)
			r.Delete("/products/{id}/images/{imageId}", imageH.DeleteImage)

			r.Post("/uploads/image", uploadH.UploadImage)

			r.Post("/hosts", hostH.Create)
			r.Patch("/hosts/{id}", hostH.Update)
			r.Delete("/hosts/{id}", hostH.Delete)

			r.Post("/pickup-chains", pickupChainH.Create)
			r.Patch("/pickup-chains/{id}", pickupChainH.Update)
			r.Delete("/pickup-chains/{id}", pickupChainH.Delete)

			r.Patch("/settings/fees", feesH.Update)
			r.Patch("/settings/shipping", shippingSettingsH.Update)
		})
	})

	log.Println("server listening on port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatal(err)
	}
}

// runMigrations executes embedded .sql files in filename order, tracked via schema_migrations table.
func runMigrations(pool *pgxpool.Pool) {
	ctx := context.Background()

	_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
	if err != nil {
		log.Fatal("failed to create schema_migrations table: ", err)
	}

	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		log.Fatal("failed to read migrations dir: ", err)
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		var exists bool
		pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, name).Scan(&exists)
		if exists {
			continue
		}

		content, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			log.Fatal("failed to read migration file ", name, ": ", err)
		}

		log.Println("applying migration:", name)
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			log.Fatal("migration failed (", name, "): ", err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			log.Fatal("failed to record migration: ", err)
		}
	}
	log.Println("migrations up to date")
}
