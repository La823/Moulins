package routes

import (
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lavanyaarora/server/internal/api/routehandlers/attendance"
	"github.com/lavanyaarora/server/internal/api/routehandlers/auth"
	"github.com/lavanyaarora/server/internal/api/routehandlers/doctors"
	"github.com/lavanyaarora/server/internal/api/routehandlers/health"
	"github.com/lavanyaarora/server/internal/api/routehandlers/manufacturers"
	"github.com/lavanyaarora/server/internal/api/routehandlers/orders"
	"github.com/lavanyaarora/server/internal/api/routehandlers/products"
	"github.com/lavanyaarora/server/internal/api/routehandlers/purchaseorders"
	userauth "github.com/lavanyaarora/server/internal/api/routehandlers/userAuth"
	"github.com/lavanyaarora/server/internal/cache"
	"github.com/lavanyaarora/server/internal/middleware"
)

func RegisterRoutes(router *mux.Router, db *pgxpool.Pool, rdb *cache.Client) {

	// health check
	router.HandleFunc("/health", health.Health).Methods("GET")

	// public auth routes
	router.HandleFunc("/auth/login", auth.LoginHandler(db)).Methods("POST")

	// public product routes
	router.HandleFunc("/products", products.ListProductsHandler(db, true, rdb)).Methods("GET")
	router.HandleFunc("/products/categories", products.ListCategoriesHandler(db, rdb)).Methods("GET")
	router.HandleFunc("/products/{id}", products.GetProductHandler(db, rdb)).Methods("GET")

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

	// doctor routes (any authenticated user)
	protected.HandleFunc("/doctors", doctors.ListDoctorsHandler(db)).Methods("GET")
	protected.HandleFunc("/doctors", doctors.CreateDoctorHandler(db)).Methods("POST")
	protected.HandleFunc("/doctors/{id}", doctors.GetDoctorHandler(db)).Methods("GET")
	protected.HandleFunc("/doctors/{id}", doctors.UpdateDoctorHandler(db)).Methods("PUT")
	protected.HandleFunc("/doctors/{id}", doctors.DeleteDoctorHandler(db)).Methods("DELETE")
	protected.HandleFunc("/doctors/{id}/products", doctors.ListDoctorProductsHandler(db)).Methods("GET")
	protected.HandleFunc("/doctors/{id}/products", doctors.AddDoctorProductHandler(db)).Methods("POST")
	protected.HandleFunc("/doctors/{id}/products/{productId}", doctors.RemoveDoctorProductHandler(db)).Methods("DELETE")

	// admin-only routes
	admin := protected.PathPrefix("/admin").Subrouter()
	admin.Use(middleware.AdminOnly)

	admin.HandleFunc("/createuser", userauth.CreateUserHandler(db)).Methods("POST")
	admin.HandleFunc("/users", userauth.GetLastUsersHandler(db)).Methods("GET")
	admin.HandleFunc("/permissions", userauth.ListAvailablePermissionsHandler()).Methods("GET")
	admin.HandleFunc("/employees", userauth.GetEmployeesHandler(db)).Methods("GET")
	admin.HandleFunc("/employees/{id}", userauth.GetEmployeeDetailHandler(db)).Methods("GET")
	admin.HandleFunc("/employees/{id}/password", userauth.UpdateEmployeePasswordHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/employees/{id}/permissions", userauth.GetPermissionsHandler(db)).Methods("GET")
	admin.HandleFunc("/employees/{id}/permissions", userauth.SetPermissionsHandler(db, rdb)).Methods("PUT")
	admin.HandleFunc("/employees/{id}", userauth.DeleteEmployeeHandler(db, rdb)).Methods("DELETE")

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

	// staff routes — customer management
	customerStaff := protected.PathPrefix("/admin").Subrouter()
	customerStaff.Use(middleware.StaffOnly)
	customerStaff.Use(middleware.RequirePermission(db, "customers", rdb))

	customerStaff.HandleFunc("/customers", userauth.GetCustomersHandler(db)).Methods("GET")
	customerStaff.HandleFunc("/customers/{id}", userauth.GetCustomerDetailHandler(db)).Methods("GET")
	customerStaff.HandleFunc("/customers/{id}/password", userauth.UpdateCustomerPasswordHandler(db, rdb)).Methods("PUT")
	customerStaff.HandleFunc("/customers/{id}", userauth.DeleteCustomerHandler(db, rdb)).Methods("DELETE")

	// staff routes — order management
	orderStaff := protected.PathPrefix("/admin").Subrouter()
	orderStaff.Use(middleware.StaffOnly)
	orderStaff.Use(middleware.RequirePermission(db, "orders", rdb))

	orderStaff.HandleFunc("/orders", orders.ListAllOrdersHandler(db)).Methods("GET")
	orderStaff.HandleFunc("/orders/{id}/details", orders.UpdateOrderDetailsHandler(db)).Methods("PUT")
	orderStaff.HandleFunc("/orders/{id}/status", orders.UpdateOrderStatusHandler(db)).Methods("PUT")
	orderStaff.HandleFunc("/orders/{id}/items/{itemId}", orders.UpdateOrderItemHandler(db)).Methods("PUT")
	orderStaff.HandleFunc("/orders/{id}/items/{itemId}", orders.DeleteOrderItemHandler(db)).Methods("DELETE")

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
}
