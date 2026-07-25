package routes

import (
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/api/handlers"
	"github.com/lavanyaarora/server/internal/api/routehandlers/assignments"
	"github.com/lavanyaarora/server/internal/api/routehandlers/attendance"
	"github.com/lavanyaarora/server/internal/api/routehandlers/auth"
	"github.com/lavanyaarora/server/internal/api/routehandlers/categories"
	"github.com/lavanyaarora/server/internal/api/routehandlers/doctors"
	"github.com/lavanyaarora/server/internal/api/routehandlers/health"
	"github.com/lavanyaarora/server/internal/api/routehandlers/homecarousel"
	"github.com/lavanyaarora/server/internal/api/routehandlers/homefocus"
	"github.com/lavanyaarora/server/internal/api/routehandlers/homehighlights"
	"github.com/lavanyaarora/server/internal/api/routehandlers/jobs"
	"github.com/lavanyaarora/server/internal/api/routehandlers/learning"
	"github.com/lavanyaarora/server/internal/api/routehandlers/ledger"
	"github.com/lavanyaarora/server/internal/api/routehandlers/manufacturers"
	"github.com/lavanyaarora/server/internal/api/routehandlers/meetings"
	"github.com/lavanyaarora/server/internal/api/routehandlers/messages"
	"github.com/lavanyaarora/server/internal/api/routehandlers/notifications"
	"github.com/lavanyaarora/server/internal/api/routehandlers/orders"
	"github.com/lavanyaarora/server/internal/api/routehandlers/products"
	"github.com/lavanyaarora/server/internal/api/routehandlers/purchaseorders"
	"github.com/lavanyaarora/server/internal/api/routehandlers/requests"
	userauth "github.com/lavanyaarora/server/internal/api/routehandlers/userAuth"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/middleware"
	"github.com/lavanyaarora/server/internal/services"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func RegisterRoutes(router *mux.Router, db *pgxpool.Pool, rdb *cache.Client, chatHub *services.ChatHub) {

	// records request count/latency for every route matched below —
	// registered first so it wraps the whole router via mux's own
	// middleware chain (needs a matched route to read the path template)
	router.Use(middleware.Metrics)

	prometheus.MustRegister(middleware.NewDBPoolCollector(db))

	// health check
	router.HandleFunc("/health", health.Health).Methods("GET")

	// Prometheus scrape target — not proxied through the public nginx
	// vhost (see nginx.conf), only reachable inside the docker network.
	router.Handle("/metrics", promhttp.Handler()).Methods("GET")

	// chat websocket (authenticates itself via ?token= query param, since
	// browsers can't set an Authorization header on a WebSocket handshake)
	router.HandleFunc("/ws", messages.WebSocketHandler(db, chatHub)).Methods("GET")

	// public auth routes
	router.HandleFunc("/auth/login", auth.LoginHandler(db)).Methods("POST")

	// public product routes
	router.HandleFunc("/products", products.ListProductsHandler(db, true, rdb)).Methods("GET")
	router.HandleFunc("/products/categories", categories.ListHandler(db, rdb)).Methods("GET")
	router.HandleFunc("/products/forms", products.ProductFormsHandler(db, rdb)).Methods("GET")
	router.HandleFunc("/products/{id}", products.GetProductHandler(db, rdb)).Methods("GET")
	router.HandleFunc("/home-highlights", homehighlights.GetHandler(db, rdb)).Methods("GET")
	router.HandleFunc("/home-carousel", homecarousel.ListHandler(db, rdb)).Methods("GET")
	router.HandleFunc("/home-focus", homefocus.GetHandler(db, rdb)).Methods("GET")

	// careers — public (active postings, applying, resume upload)
	router.HandleFunc("/careers", jobs.ListHandler(db)).Methods("GET")
	router.HandleFunc("/careers/upload-url", jobs.UploadURLHandler()).Methods("POST")
	router.HandleFunc("/careers/{id}/apply", jobs.ApplyHandler(db)).Methods("POST")

	// protected routes (require valid JWT)
	protected := router.PathPrefix("").Subrouter()
	protected.Use(middleware.Auth)

	protected.HandleFunc("/auth/me", auth.MeHandler(db, rdb)).Methods("GET")

	// order routes (any authenticated user)
	protected.HandleFunc("/orders", orders.CreateOrderHandler(db)).Methods("POST")
	protected.HandleFunc("/orders", orders.ListMyOrdersHandler(db)).Methods("GET")
	protected.HandleFunc("/orders/{id}", orders.GetOrderHandler(db)).Methods("GET")

	// employee: view own attendance
	protected.HandleFunc("/my-attendance", attendance.GetMyAttendanceHandler(db, rdb)).Methods("GET")
	protected.HandleFunc("/attendance-visibility", attendance.GetAttendanceVisibilityHandler(db, rdb)).Methods("GET")

	// notification inbox routes (any authenticated user)
	protected.HandleFunc("/notifications", notifications.ListMyNotificationsHandler(db)).Methods("GET")
	protected.HandleFunc("/notifications/{id}/read", notifications.MarkReadHandler(db)).Methods("PUT")
	protected.HandleFunc("/device-tokens", notifications.RegisterDeviceTokenHandler(db)).Methods("POST")

	// doctor routes (any authenticated user)
	protected.HandleFunc("/doctors", doctors.ListDoctorsHandler(db)).Methods("GET")
	protected.HandleFunc("/doctors", doctors.CreateDoctorHandler(db)).Methods("POST")
	protected.HandleFunc("/doctors/{id}", doctors.GetDoctorHandler(db)).Methods("GET")
	protected.HandleFunc("/doctors/{id}", doctors.UpdateDoctorHandler(db)).Methods("PUT")
	protected.HandleFunc("/doctors/{id}", doctors.DeleteDoctorHandler(db)).Methods("DELETE")
	protected.HandleFunc("/doctors/{id}/products", doctors.ListDoctorProductsHandler(db)).Methods("GET")
	protected.HandleFunc("/doctors/{id}/products", doctors.AddDoctorProductHandler(db)).Methods("POST")
	protected.HandleFunc("/doctors/{id}/products/{productId}", doctors.RemoveDoctorProductHandler(db)).Methods("DELETE")
	protected.HandleFunc("/doctors/{id}/last-meeting", doctors.UpdateDoctorLastMeetingHandler(db)).Methods("PUT")

	// meeting routes (any authenticated user — partners and employees both own doctors/meetings)
	protected.HandleFunc("/meetings", meetings.CreateHandler(db)).Methods("POST")
	protected.HandleFunc("/meetings", meetings.ListHandler(db)).Methods("GET")
	protected.HandleFunc("/meetings/{id}", meetings.GetHandler(db)).Methods("GET")
	protected.HandleFunc("/meetings/{id}", meetings.UpdateHandler(db)).Methods("PUT")
	protected.HandleFunc("/meetings/{id}/status", meetings.UpdateStatusHandler(db)).Methods("PUT")
	protected.HandleFunc("/meetings/{id}/mom", meetings.UpdateMomHandler(db)).Methods("PUT")
	protected.HandleFunc("/meetings/{id}", meetings.DeleteHandler(db)).Methods("DELETE")

	// request routes (any authenticated user)
	protected.HandleFunc("/requests", requests.CreateHandler(db)).Methods("POST")
	protected.HandleFunc("/requests", requests.ListHandler(db)).Methods("GET")

	// self-service assignment lookup (any authenticated user — clients see
	// their employees, employees see their clients; used for chat contacts)
	protected.HandleFunc("/my-assignments", assignments.MyAssignmentsHandler(db)).Methods("GET")
	protected.HandleFunc("/chat-contacts", assignments.ChatContactsHandler(db)).Methods("GET")

	// self-service ledger lookup (partner's own current ledger)
	protected.HandleFunc("/ledger", ledger.GetMyLedgerHandler(db)).Methods("GET")

	// learning platform — browsing (any authenticated user)
	protected.HandleFunc("/learning/videos", learning.ListVideosHandler(db)).Methods("GET")
	protected.HandleFunc("/learning/playlists", learning.ListPlaylistsHandler(db)).Methods("GET")

	// product image downloads — gated behind login (any authenticated user)
	protected.HandleFunc("/products/images/{imgId}/download-url", products.DownloadImageHandler(db)).Methods("GET")

	// recently viewed products (any authenticated user)
	protected.HandleFunc("/products/{id}/view", products.RecordProductViewHandler(db)).Methods("POST")
	protected.HandleFunc("/recently-viewed", products.ListRecentlyViewedHandler(db)).Methods("GET")

	// favorite products (any authenticated user)
	protected.HandleFunc("/favorites", products.ListFavoritesHandler(db)).Methods("GET")
	protected.HandleFunc("/favorites/ids", products.ListFavoriteIDsHandler(db)).Methods("GET")
	protected.HandleFunc("/favorites/{id}", products.AddFavoriteHandler(db)).Methods("POST")
	protected.HandleFunc("/favorites/{id}", products.RemoveFavoriteHandler(db)).Methods("DELETE")

	// chat routes (any authenticated user)
	protected.HandleFunc("/messages/upload-url", messages.UploadURLHandler()).Methods("POST")
	protected.HandleFunc("/messages/conversations", messages.ListConversationsHandler(db)).Methods("GET")
	protected.HandleFunc("/messages/thread/{conversationId}", messages.ThreadHistoryHandler(db)).Methods("GET")
	protected.HandleFunc("/messages/thread/{conversationId}/read", messages.MarkThreadReadHandler(db)).Methods("PUT")
	protected.HandleFunc("/messages/{userId}", messages.HistoryHandler(db)).Methods("GET")
	protected.HandleFunc("/messages/{userId}/read", messages.MarkReadHandler(db)).Methods("PUT")

	// onboarding routes (any authenticated user)
	onboardingHandler := handlers.NewOnboardingHandler(db)
	protected.HandleFunc("/onboarding/documents", onboardingHandler.UploadDocument).Methods("POST")
	protected.HandleFunc("/onboarding/upload-url", onboardingHandler.GetUploadURL).Methods("POST")
	protected.HandleFunc("/onboarding/status", onboardingHandler.GetStatus).Methods("GET")

	// admin-only routes
	admin := protected.PathPrefix("/admin").Subrouter()
	admin.Use(middleware.AdminOnly)

	admin.HandleFunc("/users", userauth.GetLastUsersHandler(db)).Methods("GET")
	admin.HandleFunc("/permissions", userauth.ListAvailablePermissionsHandler()).Methods("GET")
	admin.HandleFunc("/employees", userauth.GetEmployeesHandler(db)).Methods("GET")
	admin.HandleFunc("/admins", userauth.GetAdminsHandler(db)).Methods("GET")
	admin.HandleFunc("/employees/{id}", userauth.GetEmployeeDetailHandler(db)).Methods("GET")
	admin.HandleFunc("/employees/{id}/password", userauth.UpdateEmployeePasswordHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/employees/{id}/permissions", userauth.GetPermissionsHandler(db)).Methods("GET")
	admin.HandleFunc("/employees/{id}/permissions", userauth.SetPermissionsHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/employees/{id}/role", userauth.UpdateEmployeeRoleHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/employees/{id}", userauth.DeleteEmployeeHandler(db, rdb)).Methods("DELETE")

	// client-employee assignment routes (admin only)
	admin.HandleFunc("/assignments", assignments.ListAllHandler(db)).Methods("GET")
	admin.HandleFunc("/clients/{id}/employees", assignments.ListForClientHandler(db)).Methods("GET")
	admin.HandleFunc("/clients/{id}/employees", assignments.AssignHandler(db)).Methods("POST")
	admin.HandleFunc("/clients/{id}/employees/{employeeId}", assignments.RemoveHandler(db)).Methods("DELETE")
	admin.HandleFunc("/employees/{id}/clients", assignments.ListForEmployeeHandler(db)).Methods("GET")

	// attendance routes (admin only)
	admin.HandleFunc("/attendance", attendance.MarkAttendanceHandler(db)).Methods("POST")
	admin.HandleFunc("/attendance", attendance.GetAttendanceByDateHandler(db)).Methods("GET")
	admin.HandleFunc("/attendance/month", attendance.GetAttendanceByMonthHandler(db)).Methods("GET")
	admin.HandleFunc("/attendance/{id}", attendance.DeleteAttendanceHandler(db)).Methods("DELETE")

	// settings routes (admin only)
	admin.HandleFunc("/settings", attendance.GetSettingsHandler(db, rdb)).Methods("GET")
	admin.HandleFunc("/settings", attendance.UpdateSettingsHandler(db, rdb)).Methods("PUT")

	// manufacturer routes (admin only)
	admin.HandleFunc("/manufacturers", manufacturers.ListHandler(db, rdb)).Methods("GET")
	admin.HandleFunc("/manufacturers", manufacturers.CreateHandler(db, rdb)).Methods("POST")
	admin.HandleFunc("/manufacturers/{id}", manufacturers.GetHandler(db)).Methods("GET")
	admin.HandleFunc("/manufacturers/{id}", manufacturers.UpdateHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/manufacturers/{id}", manufacturers.DeleteHandler(db, rdb)).Methods("DELETE")

	// purchase order routes (admin only)
	admin.HandleFunc("/purchase-orders", purchaseorders.ListHandler(db, rdb)).Methods("GET")
	admin.HandleFunc("/purchase-orders/last-by-product", purchaseorders.LastByProductHandler(db)).Methods("GET")
	admin.HandleFunc("/purchase-orders", purchaseorders.CreateHandler(db, rdb)).Methods("POST")
	admin.HandleFunc("/purchase-orders/{id}", purchaseorders.GetHandler(db, rdb)).Methods("GET")
	admin.HandleFunc("/purchase-orders/{id}", purchaseorders.UpdateHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/purchase-orders/{id}/status", purchaseorders.UpdateStatusHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/purchase-orders/{id}", purchaseorders.DeleteHandler(db, rdb)).Methods("DELETE")

	// onboarding routes (admin only)
	admin.HandleFunc("/onboarding", onboardingHandler.GetPendingPartners).Methods("GET")
	admin.HandleFunc("/onboarding/partner/{userID}", onboardingHandler.GetPartnerOnboarding).Methods("GET")
	admin.HandleFunc("/onboarding/verify", onboardingHandler.VerifyDocument).Methods("PATCH")

	// notification routes (admin only)
	admin.HandleFunc("/notifications", notifications.ListHandler(db)).Methods("GET")
	admin.HandleFunc("/notifications", notifications.CreateHandler(db)).Methods("POST")
	admin.HandleFunc("/notifications/upload-url", notifications.UploadURLHandler()).Methods("POST")
	admin.HandleFunc("/users/search", notifications.SearchUsersHandler(db)).Methods("GET")

	// home highlights (admin only)
	admin.HandleFunc("/home-highlights", homehighlights.UpdateHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/home-highlights/upload-url", homehighlights.UploadURLHandler()).Methods("POST")

	// home carousel (admin only)
	admin.HandleFunc("/home-carousel", homecarousel.CreateHandler(db, rdb)).Methods("POST")
	admin.HandleFunc("/home-carousel/{position}", homecarousel.UpdateHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/home-carousel/{position}", homecarousel.DeleteHandler(db, rdb)).Methods("DELETE")
	admin.HandleFunc("/home-carousel/upload-url", homecarousel.UploadURLHandler()).Methods("POST")

	// areas of focus (admin only)
	admin.HandleFunc("/home-focus", homefocus.UpdateSectionHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/home-focus/cards/{position}", homefocus.UpdateCardHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/home-focus/upload-url", homefocus.UploadURLHandler()).Methods("POST")

	// careers — job openings management (admin only)
	admin.HandleFunc("/careers", jobs.AdminListHandler(db)).Methods("GET")
	admin.HandleFunc("/careers", jobs.CreateHandler(db)).Methods("POST")
	admin.HandleFunc("/careers/{id}", jobs.UpdateHandler(db)).Methods("PUT")
	admin.HandleFunc("/careers/{id}", jobs.DeleteHandler(db)).Methods("DELETE")
	admin.HandleFunc("/careers/{id}/applications", jobs.ListApplicationsHandler(db)).Methods("GET")

	// staff routes — partner management
	partnerStaff := protected.PathPrefix("/admin").Subrouter()
	partnerStaff.Use(middleware.StaffOnly)
	partnerStaff.Use(middleware.RequirePermission(db, "partners", rdb))

	partnerStaff.HandleFunc("/createuser", userauth.CreateUserHandler(db)).Methods("POST")
	partnerStaff.HandleFunc("/geocode/pincode", userauth.GeocodePincodeHandler()).Methods("GET")
	partnerStaff.HandleFunc("/partners", userauth.GetPartnersHandler(db)).Methods("GET")
	partnerStaff.HandleFunc("/doctors", doctors.AdminListDoctorsHandler(db)).Methods("GET")
	partnerStaff.HandleFunc("/doctors/{id}/contact-name", doctors.UpdateDoctorContactNameHandler(db)).Methods("PUT")
	partnerStaff.HandleFunc("/partners/verify-document", userauth.VerifyPartnerDocumentHandler(db)).Methods("POST")
	partnerStaff.HandleFunc("/partners/{id}", userauth.GetPartnerDetailHandler(db)).Methods("GET")
	partnerStaff.HandleFunc("/partners/{id}/password", userauth.UpdatePartnerPasswordHandler(db, rdb)).Methods("PUT")
	partnerStaff.HandleFunc("/partners/{id}", userauth.DeletePartnerHandler(db, rdb)).Methods("DELETE")

	// staff routes — order management
	orderStaff := protected.PathPrefix("/admin").Subrouter()
	orderStaff.Use(middleware.StaffOnly)
	orderStaff.Use(middleware.RequirePermission(db, "orders", rdb))

	orderStaff.HandleFunc("/orders", orders.ListAllOrdersHandler(db)).Methods("GET")
	orderStaff.HandleFunc("/orders/{id}/details", orders.UpdateOrderDetailsHandler(db)).Methods("PUT")
	orderStaff.HandleFunc("/orders/{id}/status", orders.UpdateOrderStatusHandler(db)).Methods("PUT")
	orderStaff.HandleFunc("/orders/{id}/items/{itemId}", orders.UpdateOrderItemHandler(db)).Methods("PUT")
	orderStaff.HandleFunc("/orders/{id}/items/{itemId}", orders.DeleteOrderItemHandler(db)).Methods("DELETE")
	orderStaff.HandleFunc("/orders/upload-url", orders.UploadURLHandler()).Methods("POST")
	orderStaff.HandleFunc("/orders/{id}/photos", orders.AddPhotoHandler(db)).Methods("POST")
	orderStaff.HandleFunc("/orders/photos/{photoId}", orders.DeletePhotoHandler(db)).Methods("DELETE")

	// staff routes — product management
	productStaff := protected.PathPrefix("/admin").Subrouter()
	productStaff.Use(middleware.StaffOnly)
	productStaff.Use(middleware.RequirePermission(db, "products", rdb))

	productStaff.HandleFunc("/products", products.ListProductsHandler(db, false, rdb)).Methods("GET")
	productStaff.HandleFunc("/products", products.CreateProductHandler(db, rdb)).Methods("POST")
	productStaff.HandleFunc("/products/upload-url", products.UploadURLHandler()).Methods("POST")
	productStaff.HandleFunc("/products/document-upload-url", products.DocumentUploadURLHandler()).Methods("POST")
	productStaff.HandleFunc("/products/{id}", products.UpdateProductHandler(db, rdb)).Methods("PUT")
	productStaff.HandleFunc("/products/{id}", products.DeleteProductHandler(db, rdb)).Methods("DELETE")
	productStaff.HandleFunc("/products/{id}/images", products.AddImageHandler(db, rdb)).Methods("POST")
	productStaff.HandleFunc("/products/images/{imgId}", products.DeleteImageHandler(db, rdb)).Methods("DELETE")
	productStaff.HandleFunc("/products/{id}/documents", products.AddDocumentHandler(db, rdb)).Methods("POST")
	productStaff.HandleFunc("/products/documents/{docId}", products.DeleteDocumentHandler(db, rdb)).Methods("DELETE")
	productStaff.HandleFunc("/products/{id}/audio", products.SetProductAudioHandler(db, rdb)).Methods("PUT")

	// category routes (admin only, same product permission)
	productStaff.HandleFunc("/categories", categories.CreateHandler(db, rdb)).Methods("POST")
	productStaff.HandleFunc("/categories/{id}", categories.UpdateHandler(db, rdb)).Methods("PUT")
	productStaff.HandleFunc("/categories/{id}", categories.DeleteHandler(db, rdb)).Methods("DELETE")

	// staff routes — meeting oversight
	meetingsStaff := protected.PathPrefix("/admin").Subrouter()
	meetingsStaff.Use(middleware.StaffOnly)
	meetingsStaff.Use(middleware.RequirePermission(db, "meetings", rdb))

	meetingsStaff.HandleFunc("/meetings", meetings.AdminListHandler(db)).Methods("GET")

	// staff routes — request inbox
	requestsStaff := protected.PathPrefix("/admin").Subrouter()
	requestsStaff.Use(middleware.StaffOnly)
	requestsStaff.Use(middleware.RequirePermission(db, "requests", rdb))

	requestsStaff.HandleFunc("/requests", requests.AdminListHandler(db)).Methods("GET")
	requestsStaff.HandleFunc("/requests/{id}/status", requests.AdminUpdateStatusHandler(db)).Methods("PUT")

	// staff routes — partner ledger management
	ledgerStaff := protected.PathPrefix("/admin").Subrouter()
	ledgerStaff.Use(middleware.StaffOnly)
	ledgerStaff.Use(middleware.RequirePermission(db, "ledger", rdb))

	ledgerStaff.HandleFunc("/ledger/upload-url", ledger.UploadURLHandler()).Methods("POST")
	ledgerStaff.HandleFunc("/partners/{id}/ledger", ledger.UpsertLedgerHandler(db)).Methods("PUT")
	ledgerStaff.HandleFunc("/partners/{id}/ledger", ledger.GetLedgerHandler(db)).Methods("GET")

	// staff routes — learning platform management
	learningStaff := protected.PathPrefix("/admin").Subrouter()
	learningStaff.Use(middleware.StaffOnly)
	learningStaff.Use(middleware.RequirePermission(db, "learning", rdb))

	learningStaff.HandleFunc("/learning/videos", learning.CreateVideoHandler(db)).Methods("POST")
	learningStaff.HandleFunc("/learning/videos/{id}", learning.DeleteVideoHandler(db)).Methods("DELETE")
	learningStaff.HandleFunc("/learning/playlists", learning.CreatePlaylistHandler(db)).Methods("POST")
	learningStaff.HandleFunc("/learning/playlists/{id}", learning.DeletePlaylistHandler(db)).Methods("DELETE")
	learningStaff.HandleFunc("/learning/playlists/{id}/videos", learning.AddVideoToPlaylistHandler(db)).Methods("POST")
	learningStaff.HandleFunc("/learning/playlists/{id}/videos/{videoId}", learning.RemoveVideoFromPlaylistHandler(db)).Methods("DELETE")
}
