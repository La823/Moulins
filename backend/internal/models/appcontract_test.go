package models

import (
	"reflect"
	"strings"
	"testing"
)

// The released mobile app (1.0.9+13) parses these fields with hard casts that
// throw at runtime if the shape changes -- List<String>.from(json['x']) blows
// up on anything that is not an array of strings, and it takes the whole
// screen with it, for every installed copy, until the store release lands.
//
// Renaming a field, removing it, or changing its type are all silent here in
// Go and fatal there. These tests make them loud.
//
// Delete an entry only once nobody is left on a version that parses it. The
// list mirrors the casts found in mobile/lib/models: product.dart categories
// and tags, user.dart and admin_user.dart permissions, presentation.dart
// preview_urls.
type fieldContract struct {
	jsonName string
	kind     reflect.Kind // kind of the field, after unwrapping a pointer
	elemKind reflect.Kind // for slices: the element kind. Invalid if n/a
}

func check(t *testing.T, v any, want []fieldContract) {
	t.Helper()
	typ := reflect.TypeOf(v)

	// Map json tag -> field, so a rename is caught rather than a reorder.
	byJSON := map[string]reflect.StructField{}
	for i := 0; i < typ.NumField(); i++ {
		f := typ.Field(i)
		tag := strings.Split(f.Tag.Get("json"), ",")[0]
		if tag != "" && tag != "-" {
			byJSON[tag] = f
		}
	}

	for _, w := range want {
		f, ok := byJSON[w.jsonName]
		if !ok {
			t.Errorf("%s: json field %q is gone -- the released app parses it and will break",
				typ.Name(), w.jsonName)
			continue
		}
		ft := f.Type
		if ft.Kind() == reflect.Ptr {
			ft = ft.Elem()
		}
		if ft.Kind() != w.kind {
			t.Errorf("%s.%s: is %s, the released app expects %s",
				typ.Name(), w.jsonName, ft.Kind(), w.kind)
			continue
		}
		if w.elemKind != reflect.Invalid && ft.Elem().Kind() != w.elemKind {
			t.Errorf("%s.%s: is []%s, the released app does List<String>.from() and expects []%s",
				typ.Name(), w.jsonName, ft.Elem().Kind(), w.elemKind)
		}
	}
}

func TestProductContract(t *testing.T) {
	check(t, Product{}, []fieldContract{
		{"categories", reflect.Slice, reflect.String},
		{"tags", reflect.Slice, reflect.String},
		{"id", reflect.Array, reflect.Invalid}, // uuid.UUID is [16]byte
		{"name", reflect.String, reflect.Invalid},
		{"price", reflect.Float64, reflect.Invalid},
		{"stock", reflect.Int, reflect.Invalid},
		{"moq", reflect.Int, reflect.Invalid},
		{"is_active", reflect.Bool, reflect.Invalid},
	})
}

func TestUserContract(t *testing.T) {
	check(t, User{}, []fieldContract{
		{"permissions", reflect.Slice, reflect.String},
	})
}

// Orders gained rate/line_total/order_total, which the app ignores because it
// reads only named keys. These are the fields it does read.
func TestOrderContract(t *testing.T) {
	check(t, OrderItem{}, []fieldContract{
		{"id", reflect.Array, reflect.Invalid},
		{"product_id", reflect.Array, reflect.Invalid},
		{"product_name", reflect.String, reflect.Invalid},
		{"quantity", reflect.Int, reflect.Invalid},
	})
	check(t, Order{}, []fieldContract{
		{"id", reflect.Array, reflect.Invalid},
		{"status", reflect.String, reflect.Invalid},
		{"transport_mode", reflect.String, reflect.Invalid},
		{"items", reflect.Slice, reflect.Struct},
	})
}
