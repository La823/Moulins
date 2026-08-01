package models

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProductDesignFile struct {
	ID        uuid.UUID `json:"id"`
	ProductID uuid.UUID `json:"product_id"`
	Name      string    `json:"name"`
	FileKey   string    `json:"file_key"`
	FileURL   string    `json:"file_url,omitempty"`
	FileSize  *int64    `json:"file_size"`
	CreatedAt time.Time `json:"created_at"`
}

func AddProductDesignFile(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID, name string, fileKey string, fileSize *int64) (uuid.UUID, error) {
	query := `
		INSERT INTO product_design_files (product_id, name, file_key, file_size)
		VALUES ($1, $2, $3, $4)
		RETURNING id;
	`
	var id uuid.UUID
	err := db.QueryRow(ctx, query, productID, name, fileKey, fileSize).Scan(&id)
	return id, err
}

func GetProductDesignFiles(ctx context.Context, db *pgxpool.Pool, productID uuid.UUID) ([]ProductDesignFile, error) {
	query := `
		SELECT id, product_id, name, file_key, file_size, created_at
		FROM product_design_files
		WHERE product_id = $1
		ORDER BY created_at DESC
	`
	rows, err := db.Query(ctx, query, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := make([]ProductDesignFile, 0)
	for rows.Next() {
		var f ProductDesignFile
		if err := rows.Scan(&f.ID, &f.ProductID, &f.Name, &f.FileKey, &f.FileSize, &f.CreatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func DeleteProductDesignFile(ctx context.Context, db *pgxpool.Pool, fileID uuid.UUID) error {
	_, err := db.Exec(ctx, "DELETE FROM product_design_files WHERE id = $1", fileID)
	return err
}

func GetProductIDByDesignFileID(ctx context.Context, db *pgxpool.Pool, fileID uuid.UUID) (uuid.UUID, error) {
	var productID uuid.UUID
	err := db.QueryRow(ctx, "SELECT product_id FROM product_design_files WHERE id = $1", fileID).Scan(&productID)
	return productID, err
}

type ProductDesignFileCount struct {
	Total int `json:"total"`
	CDR   int `json:"cdr"`
}

// GetProductDesignFileCounts returns how many design files exist per product
// (total, and how many are .cdr files), for the "folder" list view — avoids
// loading every file for every product.
func GetProductDesignFileCounts(ctx context.Context, db *pgxpool.Pool) (map[uuid.UUID]ProductDesignFileCount, error) {
	rows, err := db.Query(ctx, `
		SELECT product_id, COUNT(*), COUNT(*) FILTER (WHERE name ILIKE '%.cdr')
		FROM product_design_files
		GROUP BY product_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[uuid.UUID]ProductDesignFileCount)
	for rows.Next() {
		var id uuid.UUID
		var c ProductDesignFileCount
		if err := rows.Scan(&id, &c.Total, &c.CDR); err != nil {
			return nil, err
		}
		counts[id] = c
	}
	return counts, rows.Err()
}
